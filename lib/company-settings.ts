import { cloudBlankMode } from "@/lib/cloud-session";

const KEY = "hyperion-oficina-empresa";
const listeners = new Set<() => void>();

export type LogoMode = "default" | "custom" | "none";

export type CompanySettings = {
  legalName: string;
  tradeName: string;
  nif: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  site: string;
  bank: string;
  iban: string;
  hours: string;
  footer: string;
  defaultVat: number;
  logoMode: LogoMode;
  logoDataUrl: string;
  openingHours?: DayHours[];
  targets?: Record<string, YearTarget>;
};

export type DayHours = {
  open: boolean;
  start: string;
  end: string;
  lunch: boolean;
  lunchStart: string;
  lunchEnd: string;
};

export type YearTarget = {
  revenue: number;
  margin: number;
  months: Array<{ revenue: number; margin: number }>;
};

export const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;
export const WEEKDAY_LETTERS = ["S", "T", "Q", "Q", "S", "S", "D"] as const;

export function defaultOpeningHours(): DayHours[] {
  return WEEKDAYS.map((_, index) => ({
    open: index < 5,
    start: "09:00",
    end: "18:00",
    lunch: index < 5,
    lunchStart: "13:00",
    lunchEnd: "14:00",
  }));
}

export function readOpeningHours(company: CompanySettings) {
  const fallback = defaultOpeningHours();
  if (!Array.isArray(company.openingHours) || company.openingHours.length !== 7) return fallback;
  return company.openingHours.map((day, index) => ({ ...fallback[index], ...day }));
}

export function emptyYearTarget(): YearTarget {
  return { revenue: 0, margin: 0, months: Array.from({ length: 12 }, () => ({ revenue: 0, margin: 0 })) };
}

export function spreadTarget(revenue: number, margin: number): YearTarget {
  const months = Array.from({ length: 12 }, () => ({
    revenue: Math.round((revenue / 12) * 100) / 100,
    margin,
  }));
  const drift = Math.round((revenue - months.reduce((sum, month) => sum + month.revenue, 0)) * 100) / 100;
  months[0].revenue = Math.round((months[0].revenue + drift) * 100) / 100;
  return { revenue, margin, months };
}

/** Empty workshop. The name is the only value copied from sign-up. */
export function blankCompany(name = ""): CompanySettings {
  return {
    legalName: name,
    tradeName: name,
    nif: "",
    address: "",
    postalCode: "",
    city: "",
    country: "",
    phone: "",
    email: "",
    site: "",
    bank: "",
    iban: "",
    hours: "",
    footer: "",
    defaultVat: 23,
    logoMode: "none",
    logoDataUrl: "",
  };
}

/** Offline demo only. A cloud account never merges onto this object. */
export const installationCompany: CompanySettings = {
  legalName: "Hyperion Reparação Automóvel, Unipessoal, Lda",
  tradeName: "Hyperion Car Lab",
  nif: "518445356",
  address: "Rua do Mexilhão, N19",
  postalCode: "8400-105",
  city: "Mexilhoeira da Carregação",
  country: "Portugal",
  phone: "+351 926 771 904",
  email: "hyperioncarlab@gmail.com",
  site: "oficinahyperion.pt",
  bank: "Santander",
  iban: "PT50 0018 0003 6425 8007 0206 2",
  hours: "Segunda a sexta 9:00–13:00 e 14:30–18:00",
  footer: "",
  defaultVat: 23,
  logoMode: "default",
  logoDataUrl: "",
};

function baseCompany() {
  return cloudBlankMode() ? blankCompany() : installationCompany;
}

function merge(raw: Partial<CompanySettings> | null): CompanySettings {
  const base = baseCompany();
  const vat = Number(raw?.defaultVat);
  return {
    ...base,
    ...raw,
    defaultVat: Number.isFinite(vat) && vat >= 0 ? vat : base.defaultVat,
    logoMode: raw?.logoMode ?? base.logoMode,
    logoDataUrl: raw?.logoDataUrl ?? "",
  };
}

let companyCache: { raw: string; value: CompanySettings } = { raw: "", value: installationCompany };

export function readCompanySettings(): CompanySettings {
  if (typeof localStorage === "undefined") return installationCompany;
  const stored = localStorage.getItem(KEY) ?? "";
  const raw = `${cloudBlankMode() ? "c" : "l"}:${stored}`;
  if (companyCache.raw === raw) return companyCache.value;
  let value = baseCompany();
  if (stored) {
    try { value = merge(JSON.parse(stored) as Partial<CompanySettings>); } catch { value = baseCompany(); }
  }
  companyCache = { raw, value };
  return value;
}

export function writeCompanySettings(next: CompanySettings) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
  void import("@/browser/src/cloud").then((cloud) => cloud.afterLocalWrite());
}

export function subscribeCompanySettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function companyDisplayName(settings: CompanySettings = readCompanySettings()) {
  return settings.tradeName.trim() || settings.legalName.trim() || "Oficina";
}

export function companyReady(settings: CompanySettings = readCompanySettings()) {
  return Boolean(settings.legalName.trim() || settings.tradeName.trim());
}

export function companySiteHref(site: string) {
  const value = site.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/+/, "")}`;
}

export function bundledLogoSrc(light = false) {
  const file = light ? "logo-hyperion-light.png" : "logo-hyperion.png";
  if (typeof window !== "undefined" && window.location.pathname.includes("/hyperion-oficina")) return `/hyperion-oficina/${file}`;
  return `/${file}`;
}

export function companyLogoSrc(settings: CompanySettings = readCompanySettings(), light = false) {
  if (settings.logoMode === "none") return "";
  if (settings.logoMode === "custom" && settings.logoDataUrl) return settings.logoDataUrl;
  if (cloudBlankMode()) return "";
  return bundledLogoSrc(light);
}
