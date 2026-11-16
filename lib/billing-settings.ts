const BILLING_KEY = "hyperion-oficina-faturacao";
const PLATE_KEY = "hyperion-oficina-matricula";
const listeners = new Set<() => void>();

export const DOCUMENT_TYPES = ["Fatura", "Fatura-recibo", "Fatura simplificada"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type BillingSettings = {
  clientId: string;
  clientSecret: string;
  user: string;
  password: string;
  companyId: string;
  series: string;
  documentType: DocumentType;
  paymentMethod: string;
};

export type PlateLookupSettings = {
  apiUrl: string;
  apiKey: string;
};

export const emptyBilling: BillingSettings = {
  clientId: "",
  clientSecret: "",
  user: "",
  password: "",
  companyId: "",
  series: "",
  documentType: "Fatura",
  paymentMethod: "Transferência",
};

export const emptyPlateLookup: PlateLookupSettings = { apiUrl: "", apiKey: "" };

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

let billingRaw = "\0";
let billingSnap = emptyBilling;
let plateRaw = "\0";
let plateSnap = emptyPlateLookup;

export function readBillingSettings(): BillingSettings {
  const raw = typeof localStorage === "undefined" ? "" : localStorage.getItem(BILLING_KEY) ?? "";
  if (raw === billingRaw) return billingSnap;
  billingRaw = raw;
  const parsed = raw ? readJson(BILLING_KEY, emptyBilling) : emptyBilling;
  const documentType = DOCUMENT_TYPES.includes(parsed.documentType) ? parsed.documentType : "Fatura";
  billingSnap = { ...emptyBilling, ...parsed, documentType };
  return billingSnap;
}

export function writeBillingSettings(next: BillingSettings) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(BILLING_KEY, JSON.stringify(next));
  void import("@/browser/src/cloud").then((cloud) => cloud.afterLocalWrite());
  billingRaw = "\0";
  listeners.forEach((listener) => listener());
}

export function readPlateLookup(): PlateLookupSettings {
  const raw = typeof localStorage === "undefined" ? "" : localStorage.getItem(PLATE_KEY) ?? "";
  if (raw === plateRaw) return plateSnap;
  plateRaw = raw;
  plateSnap = raw ? readJson(PLATE_KEY, emptyPlateLookup) : emptyPlateLookup;
  return plateSnap;
}

export function writePlateLookup(next: PlateLookupSettings) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PLATE_KEY, JSON.stringify(next));
  void import("@/browser/src/cloud").then((cloud) => cloud.afterLocalWrite());
  plateRaw = "\0";
  listeners.forEach((listener) => listener());
}

export function subscribeIntegrations(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function billingReady(settings: BillingSettings) {
  return Boolean(settings.clientId.trim() && settings.clientSecret.trim() && settings.user.trim() && settings.password.trim() && settings.companyId.trim() && settings.series.trim());
}
