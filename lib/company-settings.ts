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
};

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

function merge(raw: Partial<CompanySettings> | null): CompanySettings {
  const vat = Number(raw?.defaultVat);
  return {
    ...installationCompany,
    ...raw,
    defaultVat: Number.isFinite(vat) && vat >= 0 ? vat : installationCompany.defaultVat,
    logoMode: raw?.logoMode ?? "default",
    logoDataUrl: raw?.logoDataUrl ?? "",
  };
}

let companyCache: { raw: string; value: CompanySettings } = { raw: "", value: installationCompany };

export function readCompanySettings(): CompanySettings {
  if (typeof localStorage === "undefined") return installationCompany;
  const raw = localStorage.getItem(KEY) ?? "";
  if (companyCache.raw === raw) return companyCache.value;
  let value = installationCompany;
  if (raw) {
    try { value = merge(JSON.parse(raw) as Partial<CompanySettings>); } catch { value = installationCompany; }
  }
  companyCache = { raw, value };
  return value;
}

export function writeCompanySettings(next: CompanySettings) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
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
  return bundledLogoSrc(light);
}
