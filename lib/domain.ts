export const ECOLUB_REF = "ECOLUB";
export const ECOLUB_UNIT_COST = 0.09;
export const DEFAULT_MARGIN = 40;
export const OIL_MARGIN = 30;
export const DEFAULT_VAT = 23;

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function normalizeSearch(value: string) {
  return stripDiacritics(value).toLowerCase().trim();
}

export function includesSearch(haystack: string, query: string) {
  const q = normalizeSearch(query);
  if (!q) return true;
  return normalizeSearch(haystack).includes(q);
}

export function normalizePlate(input: string) {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]{2}\d{2}[A-Z]{2}$/.test(raw)) {
    return `${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;
  }
  return input.toUpperCase().trim();
}

export function isValidPlate(plate: string) {
  return /^[A-Z]{2}-\d{2}-[A-Z]{2}$/.test(plate);
}

export function normalizeNif(input: string) {
  return input.replace(/\D/g, "");
}

export function nifCheckDigit(eight: string) {
  if (!/^\d{8}$/.test(eight)) {
    throw new Error("O NIF base tem de ter 8 dígitos.");
  }
  const digits = eight.split("").map(Number);
  const sum = digits.reduce((acc, digit, index) => acc + digit * (9 - index), 0);
  const mod = sum % 11;
  const check = mod < 2 ? 0 : 11 - mod;
  return `${eight}${check}`;
}

export function isValidNif(nif: string) {
  if (!/^[1235689]\d{8}$/.test(nif)) return false;
  return nifCheckDigit(nif.slice(0, 8)) === nif;
}

export function normalizeRef(input: string) {
  return stripDiacritics(input).toUpperCase().replace(/\s+/g, "").trim();
}

export function isValidRef(ref: string) {
  return /^[A-Z0-9][A-Z0-9._/-]{1,23}$/.test(ref);
}

export function normalizeArticleDescription(input: string) {
  return input.replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-PT");
}

export function isValidVin(vin: string) {
  return vin === "" || /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
}

export function isOilArticle(input: {
  family?: string | null;
  ref?: string | null;
  isOil?: boolean;
}) {
  if (input.isOil) return true;
  const family = stripDiacritics(input.family ?? "").toLowerCase();
  if (family === "oleo") return true;
  const ref = (input.ref ?? "").toUpperCase();
  return ref.startsWith("OLEO-") || ref.startsWith("OLEO_");
}

export function defaultMargin(input: {
  family?: string | null;
  ref?: string | null;
  isOil?: boolean;
}) {
  const ref = (input.ref ?? "").toUpperCase();
  const family = input.family ?? "";
  if (ref === ECOLUB_REF || family === "Eco Taxa") return 0;
  if (isOilArticle(input)) return OIL_MARGIN;
  return DEFAULT_MARGIN;
}

export function defaultMinStock(input: {
  family?: string | null;
  ref?: string | null;
  isOil?: boolean;
}) {
  const ref = (input.ref ?? "").toUpperCase();
  const family = input.family ?? "";
  if (ref === ECOLUB_REF || family === "Eco Taxa") return 0;
  if (isOilArticle(input)) return 8;
  return 2;
}

export function salePrice(cost: number, marginPercent: number) {
  return round2(cost * (1 + marginPercent / 100));
}

export function priceWithVat(net: number, vatRate = DEFAULT_VAT) {
  return round2(net * (1 + vatRate / 100));
}

export function ecolubAmount(litres: number) {
  return round2(litres * ECOLUB_UNIT_COST);
}

export type MoneyLine = {
  quantity: number;
  unitPrice: number;
  unitCost: number;
  vatRate: number;
};

export type LineTotals = {
  base: number;
  vat: number;
  total: number;
  margin: number;
};

export function lineAmounts(line: MoneyLine): LineTotals {
  const base = round2(line.quantity * line.unitPrice);
  const vat = round2(base * (line.vatRate / 100));
  return {
    base,
    vat,
    total: round2(base + vat),
    margin: round2((line.unitPrice - line.unitCost) * line.quantity),
  };
}

export function sumTotals(lines: MoneyLine[]): LineTotals {
  return lines.reduce<LineTotals>(
    (acc, line) => {
      const totals = lineAmounts(line);
      return {
        base: round2(acc.base + totals.base),
        vat: round2(acc.vat + totals.vat),
        total: round2(acc.total + totals.total),
        margin: round2(acc.margin + totals.margin),
      };
    },
    { base: 0, vat: 0, total: 0, margin: 0 },
  );
}

export function nextCost(oldQty: number, oldCost: number, addQty: number, addCost: number) {
  if (addQty <= 0) return round2(oldCost);
  if (oldQty <= 0) return round2(addCost);
  return round2((oldQty * oldCost + addQty * addCost) / (oldQty + addQty));
}

export function stockDelta(documentType: string, quantity: number) {
  const qty = Math.abs(quantity);
  if (documentType === "Nota de crédito") return -qty;
  return qty;
}

export type PurchaseHeader = {
  date: string;
  supplierId: string;
  documentType: string;
  invoiceNumber: string;
  paymentMethod: string;
};

export function inheritedPurchaseHeader(today: string, previous?: PurchaseHeader): PurchaseHeader {
  return {
    date: previous?.date || today,
    supplierId: previous?.supplierId ?? "",
    documentType: previous?.documentType || "Fatura",
    invoiceNumber: previous?.invoiceNumber ?? "",
    paymentMethod: previous?.paymentMethod || "Transferência",
  };
}

export function parseDecimal(input: string) {
  const trimmed = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}
