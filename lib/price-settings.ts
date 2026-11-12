const KEY = "hyperion-oficina-precos";
const listeners = new Set<() => void>();

export type PriceSettings = {
  hourly: number | null;
  mecanica: number | null;
  diagnostico: number | null;
  arCondicionado: number | null;
  chapa: number | null;
  productMargin: number;
  oilMargin: number;
  quoteDays: number | null;
};

export const installationPrices: PriceSettings = {
  hourly: 45,
  mecanica: null,
  diagnostico: null,
  arCondicionado: null,
  chapa: null,
  productMargin: 40,
  oilMargin: 30,
  quoteDays: null,
};

function num(value: unknown, fallback: number | null) {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

let priceCache: { raw: string; value: PriceSettings } = { raw: "", value: installationPrices };

export function readPriceSettings(): PriceSettings {
  if (typeof localStorage === "undefined") return installationPrices;
  const raw = localStorage.getItem(KEY) ?? "";
  if (priceCache.raw === raw) return priceCache.value;
  let value = installationPrices;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<PriceSettings>;
      value = {
        hourly: num(parsed.hourly, installationPrices.hourly),
        mecanica: num(parsed.mecanica, null),
        diagnostico: num(parsed.diagnostico, null),
        arCondicionado: num(parsed.arCondicionado, null),
        chapa: num(parsed.chapa, null),
        productMargin: num(parsed.productMargin, 40) ?? 40,
        oilMargin: num(parsed.oilMargin, 30) ?? 30,
        quoteDays: num(parsed.quoteDays, null),
      };
    } catch { value = installationPrices; }
  }
  priceCache = { raw, value };
  return value;
}

export function writePriceSettings(next: PriceSettings) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function subscribePriceSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function effectiveRate(rate: number | null, prices = readPriceSettings()) {
  return rate ?? prices.hourly;
}

export function labourUnitPrice(description: string, prices = readPriceSettings()) {
  const text = description.toLocaleLowerCase("pt-PT");
  if (text.includes("diagnóst")) return effectiveRate(prices.diagnostico, prices);
  if (text.includes("ar condicionado")) return effectiveRate(prices.arCondicionado, prices);
  if (text.includes("chapa") || text.includes("pintura")) return effectiveRate(prices.chapa, prices);
  if (text.includes("mecân")) return effectiveRate(prices.mecanica, prices);
  return prices.hourly;
}
