import type { StockLink } from "@/lib/stock-entry";

const CLIENTS = "hyperion-oficina-clients";
const STOCK = "hyperion-oficina-stock";
const MEMORY = "hyperion-oficina-compra";
const SYMPTOMS = "hyperion-oficina-sintomas";

export type SymptomItem = {
  id: string;
  text: string;
  done: boolean;
};

const symptomListeners = new Set<() => void>();
let symptomRaw = "";
let symptomCache: Record<string, SymptomItem[]> = {};
const noSymptoms: SymptomItem[] = [];

function symptomMap() {
  if (typeof localStorage === "undefined") return symptomCache;
  const raw = localStorage.getItem(SYMPTOMS) ?? "";
  if (raw === symptomRaw) return symptomCache;
  symptomRaw = raw;
  try {
    symptomCache = raw ? (JSON.parse(raw) as Record<string, SymptomItem[]>) : {};
  } catch {
    symptomCache = {};
  }
  return symptomCache;
}

export function readSymptoms(documentId: string) {
  return symptomMap()[documentId] ?? noSymptoms;
}

export function writeSymptoms(documentId: string, items: SymptomItem[]) {
  if (typeof localStorage === "undefined") return;
  const next = { ...symptomMap(), [documentId]: items };
  const raw = JSON.stringify(next);
  localStorage.setItem(SYMPTOMS, raw);
  symptomRaw = raw;
  symptomCache = next;
  for (const listener of symptomListeners) listener();
}

export function moveSymptoms(from: string, to: string) {
  const items = readSymptoms(from);
  if (!items.length || from === to) return;
  writeSymptoms(to, items);
  writeSymptoms(from, []);
}

export function subscribeSymptoms(listener: () => void) {
  symptomListeners.add(listener);
  return () => {
    symptomListeners.delete(listener);
  };
}

export type CachedClient = {
  name: string;
  nif: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
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
    localStorage.removeItem(SYMPTOMS);
    symptomRaw = "";
    symptomCache = {};
  }
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(MEMORY);
}
