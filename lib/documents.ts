import type { Prisma } from "@prisma/client";
import { sumTotals, type MoneyLine } from "@/lib/domain";
import { lisbonParts } from "@/lib/format";

type DocDb = {
  repairOrder: Prisma.TransactionClient["repairOrder"];
  quote: Prisma.TransactionClient["quote"];
};

export async function nextDocumentNumber(tx: DocDb, kind: "OR" | "ORC") {
  const year = lisbonParts().year;
  const prefix = `${kind}-${year}-`;
  const rows =
    kind === "OR"
      ? await tx.repairOrder.findMany({
          where: { number: { startsWith: prefix } },
          select: { number: true },
        })
      : await tx.quote.findMany({
          where: { number: { startsWith: prefix } },
          select: { number: true },
        });
  const max = rows.reduce((highest, row) => {
    const value = Number(row.number.slice(prefix.length));
    return Number.isFinite(value) ? Math.max(highest, value) : highest;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function nextInvoiceSequence(tx: DocDb, year: number) {
  const rows = await tx.repairOrder.findMany({
    where: { invoiceNumber: { startsWith: `FT A/${year}/` } },
    select: { invoiceNumber: true },
  });
  return (
    rows.reduce((highest, row) => {
      const value = Number(row.invoiceNumber?.split("/").at(-1));
      return Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, 0) + 1
  );
}

export function totalsOf(
  lines: Array<{ quantity: number; unitPrice: number; unitCost: number; vatRate: number }>,
) {
  return sumTotals(lines satisfies MoneyLine[]);
}
