import { lineAmounts, roundPrice, sumTotals } from "@/lib/domain";

export type PayloadSourceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  vatRate: number;
  kind: string;
  ref?: string;
  articleRef?: string | null;
};

/**
 * Lines sent to the invoicing program: unit price WITHOUT IVA (full precision), discount %, the line's
 * own reference and family. The totals use the program's rounding (see lineAmounts/sumTotals), so the
 * document total is exactly what the obra shows.
 */
export function buildInvoiceLines(source: PayloadSourceLine[]) {
  const lines = source.map((line) => {
    const discountPercent = Math.min(100, Math.max(0, Number(line.discountPercent ?? 0) || 0));
    const unitPrice = roundPrice(line.unitPrice);
    const amounts = lineAmounts({ quantity: line.quantity, unitPrice, unitCost: 0, vatRate: line.vatRate, discountPercent });
    return {
      description: line.description,
      quantity: line.quantity,
      unitPrice,
      discountPercent,
      vatRate: line.vatRate,
      ref: line.ref || line.articleRef || "",
      kind: line.kind,
      total: amounts.base,
    };
  });
  const totals = sumTotals(lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice, unitCost: 0, vatRate: line.vatRate, discountPercent: line.discountPercent })));
  return { lines, base: totals.base, vat: totals.vat, total: totals.total };
}
