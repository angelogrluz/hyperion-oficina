import { toLineKind } from "@/lib/line-kinds";
import { lineAmounts, sumTotals } from "@/lib/domain";
import { lisbonISODate } from "@/lib/format";
import type { InvoiceDraft, InvoiceParty } from "@/lib/invoice/types";

type WorkshopLike = {
  legalName: string;
  nif: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
};

type OrderLike = {
  id: string;
  number: string;
  km: number;
  problem: string;
  notes: string;
  client: InvoiceParty;
  vehicle: {
    plate: string;
    brand: string;
    model: string;
    year: number;
    vin: string;
    km: number;
  };
  lines: Array<{
    kind: string;
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
    discountPercent?: number;
    article: { ref: string } | null;
  }>;
};

export function buildInvoiceDraft(input: {
  order: OrderLike;
  workshop: WorkshopLike;
  sequence: number;
  year: number;
  issuedAt?: Date;
}): InvoiceDraft {
  const issuedAt = input.issuedAt ?? new Date();
  const lines = input.order.lines.map((line) => {
    const amounts = lineAmounts({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitCost: 0,
      vatRate: line.vatRate,
      discountPercent: line.discountPercent ?? 0,
    });
    return {
      kind: toLineKind(line.kind),
      ref: line.article?.ref ?? null,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      base: amounts.base,
      vat: amounts.vat,
      total: amounts.total,
    };
  });
  const totals = sumTotals(
    input.order.lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitCost: 0,
      vatRate: line.vatRate,
      discountPercent: line.discountPercent ?? 0,
    })),
  );

  return {
    orderId: input.order.id,
    orderNumber: input.order.number,
    sequence: input.sequence,
    year: input.year,
    issuedAt: issuedAt.toISOString(),
    currency: "EUR",
    seller: {
      name: input.workshop.legalName,
      nif: input.workshop.nif,
      address: input.workshop.address,
      postalCode: input.workshop.postalCode,
      city: input.workshop.city,
      email: input.workshop.email,
      phone: input.workshop.phone,
    },
    customer: input.order.client,
    vehicle: { ...input.order.vehicle, km: input.order.km },
    lines,
    totals: { base: totals.base, vat: totals.vat, total: totals.total },
    notes: input.order.notes || input.order.problem,
  };
}

export function invoiceIssuedDateLabel(iso: string) {
  return lisbonISODate(new Date(iso));
}
