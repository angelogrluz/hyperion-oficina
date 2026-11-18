import { lineAmounts, sumTotals } from "@/lib/domain";
import { formatMediumDate } from "@/lib/format";
import { orderStatusLabel, quoteStatusLabel } from "@/lib/labels";

export type PrintableLine = {
  kind: "mao_de_obra" | "peca";
  ref: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  base: number;
  total: number;
};

export type PrintableDocument = {
  kind: "order" | "quote";
  title: string;
  number: string;
  sheetNumber?: string;
  relatedNumber?: string;
  statusLabel: string;
  primaryDateLabel: string;
  primaryDate: string;
  secondaryDateLabel: string;
  secondaryDate: string;
  km: number;
  problemLabel: string;
  problem: string;
  notes: string;
  client: { name: string; nif: string; address: string; phone: string; email: string; postalCode?: string; city?: string };
  vehicle: {
    plate: string;
    brand: string;
    model: string;
    year: number;
    vin: string;
    fuel: string;
    km: number;
  };
  lines: PrintableLine[];
  totals: { base: number; vat: number; total: number };
  invoice: { number: string; provider: string; simulated: boolean } | null;
  paymentMethod?: string | null;
};

type WorkshopLike = {
  legalName: string;
  tradeName: string;
  nif: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
};

type LineLike = {
  kind: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discountPercent?: number;
  article: { ref: string } | null;
};

function toLines(lines: LineLike[]): PrintableLine[] {
  return lines.map((line) => {
    const amounts = lineAmounts({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitCost: 0,
      vatRate: line.vatRate,
      discountPercent: line.discountPercent,
    });
    return {
      kind: line.kind === "mao_de_obra" ? "mao_de_obra" : "peca",
      ref: line.article?.ref ?? null,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      base: amounts.base,
      total: amounts.total,
    };
  });
}

function totals(lines: LineLike[]) {
  const summed = sumTotals(
    lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitCost: 0,
      vatRate: line.vatRate,
      discountPercent: line.discountPercent,
    })),
  );
  return { base: summed.base, vat: summed.vat, total: summed.total };
}

export type WorkshopProfile = WorkshopLike;

export function orderToPrintable(order: {
  number: string;
  status: string;
  dateIn: Date;
  dateOut: Date | null;
  km: number;
  problem: string;
  notes: string;
  invoiceNumber: string | null;
  invoiceProvider: string | null;
  invoiceSimulated: boolean;
  client: PrintableDocument["client"];
  vehicle: PrintableDocument["vehicle"];
  lines: LineLike[];
}): PrintableDocument {
  return {
    kind: "order",
    title: "Ordem de reparação",
    number: order.number,
    statusLabel: orderStatusLabel(order.status),
    primaryDateLabel: "Entrada",
    primaryDate: formatMediumDate(order.dateIn),
    secondaryDateLabel: "Saída",
    secondaryDate: order.dateOut ? formatMediumDate(order.dateOut) : "—",
    km: order.km,
    problemLabel: "Problema relatado",
    problem: order.problem,
    notes: order.notes,
    client: order.client,
    vehicle: order.vehicle,
    lines: toLines(order.lines),
    totals: totals(order.lines),
    invoice: order.invoiceNumber
      ? {
          number: order.invoiceNumber,
          provider: order.invoiceProvider?.toLowerCase() === "keymaster" || order.invoiceProvider?.toLowerCase() === "importado" ? "Importado" : (order.invoiceProvider ?? "Simulação"),
          simulated: order.invoiceSimulated,
        }
      : null,
  };
}

export function quoteToPrintable(quote: {
  number: string;
  status: string;
  date: Date;
  validUntil: Date | null;
  km: number;
  problem: string;
  notes: string;
  client: PrintableDocument["client"];
  vehicle: PrintableDocument["vehicle"];
  lines: LineLike[];
}): PrintableDocument {
  return {
    kind: "quote",
    title: "Orçamento",
    number: quote.number,
    statusLabel: quoteStatusLabel(quote.status),
    primaryDateLabel: "Data",
    primaryDate: formatMediumDate(quote.date),
    secondaryDateLabel: "Válido até",
    secondaryDate: quote.validUntil ? formatMediumDate(quote.validUntil) : "—",
    km: quote.km,
    problemLabel: "Trabalho orçamentado",
    problem: quote.problem,
    notes: quote.notes,
    client: quote.client,
    vehicle: quote.vehicle,
    lines: toLines(quote.lines),
    totals: totals(quote.lines),
    invoice: null,
  };
}
