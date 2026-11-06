import type { StockLink } from "@/lib/stock-entry";

const CLIENTS = "hyperion-oficina-clients";
const STOCK = "hyperion-oficina-stock";
const MEMORY = "hyperion-oficina-compra";

export type CachedClient = {
  name: string;
  nif: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

export type PurchaseMemory = {
  remember: boolean;
  supplierId: string;
  invoiceNumber: string;
};

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function readClientCache(): Record<string, CachedClient> {
  if (typeof localStorage === "undefined") return {};
  return readJson<Record<string, CachedClient>>(localStorage, CLIENTS) ?? {};
}

export function writeClientCache(id: string, client: CachedClient) {
  if (typeof localStorage === "undefined") return;
  const all = readClientCache();
  all[id] = client;
  localStorage.setItem(CLIENTS, JSON.stringify(all));
}

export function readStockLinks(): Record<string, StockLink> {
  if (typeof localStorage === "undefined") return {};
  return readJson<Record<string, StockLink>>(localStorage, STOCK) ?? {};
}

export function writeStockLink(lineKey: string, link: StockLink | null) {
  if (typeof localStorage === "undefined") return;
  const all = readStockLinks();
  if (link) all[lineKey] = link;
  else delete all[lineKey];
  localStorage.setItem(STOCK, JSON.stringify(all));
}

export function readPurchaseMemory(): PurchaseMemory | null {
  if (typeof sessionStorage === "undefined") return null;
  const value = readJson<PurchaseMemory>(sessionStorage, MEMORY);
  if (!value?.remember || !value.supplierId || !value.invoiceNumber) return null;
  return value;
}

export function writePurchaseMemory(memory: PurchaseMemory | null) {
  if (typeof sessionStorage === "undefined") return;
  if (!memory?.remember) sessionStorage.removeItem(MEMORY);
  else sessionStorage.setItem(MEMORY, JSON.stringify(memory));
}

export function clearWorkshopCache() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(CLIENTS);
    localStorage.removeItem(STOCK);
  }
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(MEMORY);
}
