import type { Prisma } from "@prisma/client";
import {
  defaultMinStock,
  isOilArticle,
  nextCost,
  normalizeArticleDescription,
  normalizeRef,
  round2,
  stockDelta,
} from "@/lib/domain";
import { dateOnly } from "@/lib/format";
import type { StockArticle, StockEntryInput, StockLink } from "@/lib/stock-entry";

export type IncomingPurchaseLine = {
  date: string;
  supplierId: string;
  documentType: string;
  invoiceNumber: string;
  paymentMethod: string;
  ref: string;
  description: string;
  quantity: number;
  cost: number;
  vat: number;
  margin: number;
  family: string;
  isOil?: boolean;
  minStock?: number;
};

export async function postPurchases(tx: Prisma.TransactionClient, lines: IncomingPurchaseLine[]) {
  const groups = new Map<string, IncomingPurchaseLine[]>();
  for (const line of lines) {
    const key = [line.date, line.supplierId, line.documentType, line.invoiceNumber.trim(), line.paymentMethod].join(
      "|",
    );
    const bucket = groups.get(key) ?? [];
    bucket.push(line);
    groups.set(key, bucket);
  }

  const purchaseIds: string[] = [];
  const touched = new Set<string>();

  for (const group of groups.values()) {
    const head = group[0];
    const purchase = await tx.purchase.create({
      data: {
        date: dateOnly(head.date),
        supplierId: head.supplierId,
        documentType: head.documentType,
        invoiceNumber: head.invoiceNumber.trim(),
        paymentMethod: head.paymentMethod,
      },
    });
    purchaseIds.push(purchase.id);

    for (const [position, line] of group.entries()) {
      const ref = normalizeRef(line.ref);
      const description = normalizeArticleDescription(line.description);
      const oil = Boolean(line.isOil) || isOilArticle({ family: line.family, ref });
      let article = await tx.article.findUnique({ where: { ref } });
      if (!article) {
        article = await tx.article.create({
          data: {
            ref,
            description,
            family: line.family || (oil ? "Óleo" : "Produto"),
            costPrice: 0,
            marginPercent: line.margin,
            vatRate: line.vat,
            stockQty: 0,
            minStock: line.minStock ?? defaultMinStock({ family: line.family, ref, isOil: oil }),
            isOil: oil,
          },
        });
      }

      const delta = stockDelta(line.documentType, line.quantity);
      const stockBefore = article.stockQty;
      const costBefore = article.costPrice;
      const stockQty = round2(stockBefore + delta);
      const costPrice = delta > 0 ? nextCost(Math.max(stockBefore, 0), costBefore, delta, line.cost) : costBefore;

      await tx.article.update({
        where: { id: article.id },
        data: {
          stockQty,
          costPrice,
          marginPercent: line.margin,
          vatRate: line.vat,
          active: true,
        },
      });
      await tx.purchaseLine.create({
        data: {
          purchaseId: purchase.id,
          articleId: article.id,
          ref,
          description,
          quantity: line.quantity,
          cost: line.cost,
          vatRate: line.vat,
          margin: line.margin,
          position,
          stockBefore,
          costBefore,
        },
      });
      touched.add(article.id);
    }
  }

  return { purchaseIds, articlesTouched: touched.size };
}

export async function voidPurchase(tx: Prisma.TransactionClient, purchaseId: string) {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    include: { lines: { orderBy: { position: "desc" } } },
  });
  if (!purchase) throw new Error("Compra não encontrada.");
  if (purchase.voided) throw new Error("Esta compra já foi anulada.");

  for (const line of purchase.lines) {
    const article = await tx.article.findUnique({ where: { id: line.articleId } });
    if (!article) continue;
    const delta = stockDelta(purchase.documentType, line.quantity);
    await tx.article.update({
      where: { id: article.id },
      data: { stockQty: round2(article.stockQty - delta) },
    });
  }

  await tx.purchase.update({
    where: { id: purchaseId },
    data: { voided: true, voidedAt: new Date() },
  });
}

function articleView(article: {
  id: string;
  ref: string;
  description: string;
  costPrice: number;
  marginPercent: number;
  vatRate: number;
  stockQty: number;
  family: string;
}): StockArticle {
  return {
    id: article.id,
    ref: article.ref,
    description: article.description,
    costPrice: article.costPrice,
    marginPercent: article.marginPercent,
    vatRate: article.vatRate,
    stockQty: article.stockQty,
    family: article.family,
  };
}

export async function upsertSheetStock(tx: Prisma.TransactionClient, input: StockEntryInput) {
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new Error("Fornecedor não encontrado.");
  const invoiceNumber = input.invoiceNumber.trim();
  const ref = normalizeRef(input.ref);
  const description = normalizeArticleDescription(input.description);
  const quantity = round2(input.quantity);
  const cost = round2(input.cost);
  const vat = input.vat;

  const existing = input.purchaseLineId
    ? await tx.purchaseLine.findUnique({ where: { id: input.purchaseLineId }, include: { purchase: true } })
    : null;
  if (input.purchaseLineId && (!existing || existing.purchase.voided)) {
    throw new Error("A entrada de stock já não existe.");
  }
  if (existing) {
    const previous = await tx.article.findUnique({ where: { id: existing.articleId } });
    if (previous) {
      const delta = stockDelta(existing.purchase.documentType, existing.quantity);
      await tx.article.update({
        where: { id: previous.id },
        data: { stockQty: round2(previous.stockQty - delta) },
      });
    }
    await tx.purchaseLine.delete({ where: { id: existing.id } });
    const remaining = await tx.purchaseLine.count({ where: { purchaseId: existing.purchaseId } });
    if (remaining === 0) await tx.purchase.delete({ where: { id: existing.purchaseId } });
  }

  const candidates = await tx.purchase.findMany({
    where: { supplierId: supplier.id, voided: false, documentType: "Fatura" },
  });
  const matched = candidates.find((item) => item.invoiceNumber.trim().toLowerCase() === invoiceNumber.toLowerCase());
  const purchase = matched
    ? await tx.purchase.update({
        where: { id: matched.id },
        data: { date: dateOnly(input.date), invoiceNumber },
      })
    : await tx.purchase.create({
        data: {
          date: dateOnly(input.date),
          supplierId: supplier.id,
          documentType: "Fatura",
          invoiceNumber,
          paymentMethod: "Transferência",
        },
      });

  const oil = isOilArticle({ family: input.family, ref });
  let article = await tx.article.findUnique({ where: { ref } });
  if (!article) {
    article = await tx.article.create({
      data: {
        ref,
        description,
        family: input.family || (oil ? "Óleo" : "Produto"),
        costPrice: cost,
        marginPercent: input.margin,
        vatRate: vat,
        stockQty: 0,
        minStock: defaultMinStock({ family: input.family, ref, isOil: oil }),
        isOil: oil,
      },
    });
  }
  const stockBefore = article.stockQty;
  const stockQty = round2(stockBefore + quantity);
  article = await tx.article.update({
    where: { id: article.id },
    data: { stockQty, active: true },
  });
  const position = await tx.purchaseLine.count({ where: { purchaseId: purchase.id } });
  const line = await tx.purchaseLine.create({
    data: {
      id: existing?.id,
      purchaseId: purchase.id,
      articleId: article.id,
      ref,
      description,
      quantity,
      cost,
      vatRate: vat,
      margin: input.margin,
      position,
      stockBefore,
      costBefore: article.costPrice,
    },
  });
  if (input.lineId) {
    await tx.documentLine.updateMany({
      where: { id: input.lineId, kind: "peca" },
      data: { articleId: article.id },
    });
  }
  const link: StockLink = {
    purchaseId: purchase.id,
    purchaseLineId: line.id,
    invoiceNumber,
    supplierId: supplier.id,
    supplierName: supplier.name,
    quantity,
    cost,
    vatRate: vat,
    date: input.date,
  };
  return { link, article: articleView(article) };
}

export async function removeSheetStock(tx: Prisma.TransactionClient, purchaseLineId: string) {
  const line = await tx.purchaseLine.findUnique({ where: { id: purchaseLineId }, include: { purchase: true } });
  if (!line || line.purchase.voided) return { article: null as StockArticle | null };
  const current = await tx.article.findUnique({ where: { id: line.articleId } });
  let article: StockArticle | null = null;
  if (current) {
    const delta = stockDelta(line.purchase.documentType, line.quantity);
    const updated = await tx.article.update({
      where: { id: current.id },
      data: { stockQty: round2(current.stockQty - delta) },
    });
    article = articleView(updated);
  }
  await tx.purchaseLine.delete({ where: { id: line.id } });
  const remaining = await tx.purchaseLine.count({ where: { purchaseId: line.purchaseId } });
  if (remaining === 0) await tx.purchase.delete({ where: { id: line.purchaseId } });
  return { article };
}
