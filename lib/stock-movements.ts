import { purchaseTypeMovesStock } from "@/src/config";
import { round2 } from "@/lib/domain";

export type MovementArticle = {
  id: string;
  ref: string;
  description: string;
  family: string;
  isOil?: boolean;
  stockQty: number;
};

export type MovementPurchase = {
  id: string;
  date: string;
  createdAt: string;
  documentType: string;
  invoiceNumber: string;
  voided: boolean;
  supplierName: string;
};

export type MovementPurchaseLine = {
  id: string;
  purchaseId: string;
  articleId: string | null;
  tipologia?: string;
  ref: string;
  quantity: number;
  cost: number;
  position: number;
};

export type MovementOrder = {
  id: string;
  number: string;
  dateIn: string;
  createdAt: string;
  invoiceNumber: string | null;
  clientName: string;
  plate: string;
};

export type MovementLine = {
  id: string;
  orderId: string | null;
  articleId: string | null;
  ref?: string | null;
  quantity: number;
  unitPrice: number;
  position: number;
  stockEntryPurchaseId?: string | null;
};

export type StockMovement = {
  id: string;
  at: number;
  date: string;
  kind: "entrada" | "saida";
  document: string;
  href: string | null;
  entity: string;
  qtyIn: number;
  qtyOut: number;
  price: number | null;
  balance: number;
  adjustment: boolean;
};

export type StockLedger = {
  movements: StockMovement[];
  entered: number;
  left: number;
  stock: number;
};

const ECOLUB = "ECOLUB";

export function isHiddenStockArticle(article: { ref: string; family?: string }) {
  return article.ref.toUpperCase() === ECOLUB || (article.family ?? "").toLowerCase() === "eco taxa";
}

function lineMovesStock(tipologia: string | undefined) {
  if (!tipologia) return true;
  return purchaseTypeMovesStock(tipologia);
}

function time(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildStockLedger(input: {
  article: MovementArticle;
  purchases: MovementPurchase[];
  purchaseLines: MovementPurchaseLine[];
  orders: MovementOrder[];
  lines: MovementLine[];
}): StockLedger {
  const { article } = input;
  const purchases = new Map(input.purchases.map((purchase) => [purchase.id, purchase]));
  const orders = new Map(input.orders.map((order) => [order.id, order]));
  const entryPurchases = new Set(
    input.lines.map((line) => line.stockEntryPurchaseId).filter((id): id is string => Boolean(id)),
  );
  const drafts: Array<Omit<StockMovement, "balance"> & { created: number; position: number }> = [];

  for (const line of input.purchaseLines) {
    if (line.articleId !== article.id && line.ref.toUpperCase() !== article.ref.toUpperCase()) continue;
    if (!lineMovesStock(line.tipologia)) continue;
    const purchase = purchases.get(line.purchaseId);
    if (!purchase || purchase.voided) continue;
    const credit = purchase.documentType === "Nota de crédito";
    const fromSheet = entryPurchases.has(purchase.id);
    const document = fromSheet
      ? `Entrada de stock · ${purchase.invoiceNumber}`
      : credit
        ? `Nota de crédito ${purchase.invoiceNumber}`
        : `Compra ${purchase.invoiceNumber}`;
    const sheet = fromSheet
      ? input.lines.find((item) => item.stockEntryPurchaseId === purchase.id && item.orderId)
      : undefined;
    drafts.push({
      id: `p-${line.id}`,
      at: time(purchase.date),
      created: time(purchase.createdAt),
      position: line.position,
      date: purchase.date,
      kind: credit ? "saida" : "entrada",
      document,
      href: sheet?.orderId ? `/ordens/${sheet.orderId}` : "/compras",
      entity: purchase.supplierName,
      qtyIn: credit ? 0 : line.quantity,
      qtyOut: credit ? line.quantity : 0,
      price: line.cost,
      adjustment: false,
    });
  }

  for (const line of input.lines) {
    if (!line.orderId) continue;
    const matches = line.articleId === article.id || (line.ref ?? "").toUpperCase() === article.ref.toUpperCase();
    if (!matches || !(line.quantity > 0)) continue;
    const order = orders.get(line.orderId);
    if (!order) continue;
    const invoice = order.invoiceNumber ? ` · Fatura ${order.invoiceNumber}` : "";
    drafts.push({
      id: `o-${line.id}`,
      at: time(order.dateIn),
      created: time(order.createdAt),
      position: line.position,
      date: order.dateIn,
      kind: "saida",
      document: `Folha ${order.number}${invoice}`,
      href: order.invoiceNumber ? `/ordens/${order.id}/fatura` : `/ordens/${order.id}`,
      entity: [order.clientName, order.plate].filter(Boolean).join(" · "),
      qtyIn: 0,
      qtyOut: line.quantity,
      price: line.unitPrice,
      adjustment: false,
    });
  }

  drafts.sort((a, b) => a.at - b.at || a.created - b.created || a.position - b.position || a.id.localeCompare(b.id));
  const net = round2(drafts.reduce((sum, row) => sum + row.qtyIn - row.qtyOut, 0));
  const gap = round2(article.stockQty - net);
  if (gap !== 0) {
    const first = drafts[0]?.at ?? time(new Date().toISOString());
    drafts.unshift({
      id: "acerto",
      at: first - 1,
      created: 0,
      position: -1,
      date: drafts[0]?.date ?? new Date().toISOString(),
      kind: gap > 0 ? "entrada" : "saida",
      document: "Acerto até ao stock atual",
      href: null,
      entity: "Stock anterior não documentado",
      qtyIn: gap > 0 ? gap : 0,
      qtyOut: gap < 0 ? Math.abs(gap) : 0,
      price: null,
      adjustment: true,
    });
  }

  let balance = 0;
  const movements: StockMovement[] = drafts.map((row) => {
    balance = round2(balance + row.qtyIn - row.qtyOut);
    return { ...row, balance };
  });
  const counted = movements.filter((row) => !row.adjustment);
  return {
    movements,
    entered: round2(counted.reduce((sum, row) => sum + row.qtyIn, 0)),
    left: round2(counted.reduce((sum, row) => sum + row.qtyOut, 0)),
    stock: article.stockQty,
  };
}
