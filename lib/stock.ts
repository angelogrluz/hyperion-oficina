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
