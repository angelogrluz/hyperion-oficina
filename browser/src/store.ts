import { openDB, type IDBPDatabase } from "idb";
import {
  defaultMargin,
  defaultMinStock,
  isOilArticle,
  latestEntryCost,
  isValidNif,
  isValidPlate,
  isValidRef,
  isValidVin,
  nextCost,
  nifCheckDigit,
  normalizeArticleDescription,
  normalizeNif,
  normalizePlate,
  platesMatch,
  normalizeRef,
  round2,
  roundPrice,
  salePrice,
  stockDelta,
} from "@/lib/domain";
import { CONSUMIDOR_FINAL } from "@/lib/consumidor";
import { purchaseTypeMovesStock } from "@/src/config";
import { issueMoloniInvoice, issueMoloniQuote, SHEET_PAYMENTS } from "@/lib/moloni/service";
import { issueCloudDocument } from "@/browser/src/moloni";
import { readCloudUser } from "@/browser/src/cloud";
import { dateOnly, lisbonParts, zonedDateTime } from "@/lib/format";
import type { StockArticle, StockEntryInput, StockLink } from "@/lib/stock-entry";
import { buildInvoiceDraft } from "@/lib/invoice/draft";
import { mockMoloniAdapter } from "@/lib/invoice/mock-moloni";
import { assignDocumentNumber, cloudActive, cloudConfigured, loadCompanyState, RevisionConflict, saveCompanyState } from "./cloud";
import { mergeById } from "@/lib/snapshot-merge";
import { nextObraNumber } from "@/lib/obra-number";
import { buildInvoiceLines } from "@/lib/invoice-payload";

export type Client = {
  id: string;
  name: string;
  nif: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Vehicle = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  version: string;
  year: number | null;
  vin: string;
  engine: string;
  engineCode?: string;
  oil?: string;
  nextInspection?: string;
  nextService?: string;
  km: number;
  fuel: string;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Article = {
  id: string;
  ref: string;
  description: string;
  family: string;
  costPrice: number;
  lastCost: number | null;
  marginPercent: number;
  vatRate: number;
  stockQty: number;
  minStock: number;
  isOil: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Supplier = {
  id: string;
  name: string;
  nif: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type DocLine = {
  id: string;
  kind: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountPercent?: number;
  vatRate: number;
  internalNote?: string;
  articleId: string | null;
  ref?: string;
  orderId: string | null;
  quoteId: string | null;
  position: number;
  stockEntry?: StockLink | null;
};

export type Order = {
  id: string;
  number: string;
  clientId: string | null;
  vehicleId: string | null;
  dateIn: string;
  dateOut: string | null;
  km: number;
  kmOut?: number | null;
  problem: string;
  status: string;
  approval?: string;
  approvalAt?: string | null;
  notes: string;
  invoiceNumber: string | null;
  invoiceProvider: string | null;
  invoiceIssuedAt: string | null;
  invoiceSimulated: boolean;
  invoiceUrl?: string | null;
  originalDocumentUrl?: string | null;
  invoiceExternalId?: string | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
  quoteNumber?: string | null;
  quoteUrl?: string | null;
  quoteId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Quote = {
  id: string;
  number: string;
  clientId: string;
  vehicleId: string;
  date: string;
  validUntil: string | null;
  km: number;
  problem: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Purchase = {
  id: string;
  date: string;
  supplierId: string;
  documentType: string;
  invoiceNumber: string;
  paymentMethod: string;
  voided: boolean;
  voidedAt: string | null;
  createdAt: string;
};

export type PurchaseLine = {
  id: string;
  purchaseId: string;
  articleId: string | null;
  tipologia?: string;
  ref: string;
  description: string;
  quantity: number;
  cost: number;
  vatRate: number;
  margin: number;
  position: number;
  stockBefore: number;
  costBefore: number;
};

export type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  clientId: string;
  vehicleId: string | null;
  title: string;
  notes: string;
  orderId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceLog = {
  id: string;
  orderId: string;
  providerId: string;
  providerLabel: string;
  simulated: boolean;
  documentNumber: string;
  requestJson: string;
  responseJson: string;
  createdAt: string;
};

export type Workshop = {
  id: string;
  legalName: string;
  tradeName: string;
  nif: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  labourRate: number;
};

export type Snapshot = {
  workshop: Workshop;
  clients: Client[];
  vehicles: Vehicle[];
  articles: Article[];
  suppliers: Supplier[];
  orders: Order[];
  quotes: Quote[];
  lines: DocLine[];
  purchases: Purchase[];
  purchaseLines: PurchaseLine[];
  appointments: Appointment[];
  invoiceLogs: InvoiceLog[];
};

const DB_NAME = "hyperion-oficina";
const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

let database: IDBPDatabase | null = null;
let chain: Promise<unknown> = Promise.resolve();
let cloudMemory: Snapshot | null = null;
let baseSnapshot: Snapshot | null = null;
const listeners = new Set<() => void>();

export function subscribeSnapshot(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifySnapshot() {
  for (const listener of listeners) listener();
}

async function databaseHandle() {
  if (!database) {
    database = await openDB(DB_NAME, 1, {
      upgrade(db: IDBPDatabase) {
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      },
    });
  }
  return database;
}

function workshopFromSettings(): Workshop {
  let legalName = "Oficina";
  let labourRate = 0;
  try {
    const company = JSON.parse(localStorage.getItem("hyperion-oficina-empresa") || "null") as { legalName?: string; tradeName?: string } | null;
    const prices = JSON.parse(localStorage.getItem("hyperion-oficina-precos") || "null") as { hourly?: number } | null;
    if (company?.legalName) legalName = company.legalName;
    if (prices?.hourly != null && Number.isFinite(Number(prices.hourly))) labourRate = Number(prices.hourly);
    return {
      id: "cloud",
      legalName,
      tradeName: company?.tradeName || legalName,
      nif: "",
      address: "",
      postalCode: "",
      city: "",
      phone: "",
      email: "",
      labourRate,
    };
  } catch {
    return { id: "cloud", legalName, tradeName: legalName, nif: "", address: "", postalCode: "", city: "", phone: "", email: "", labourRate };
  }
}

function emptyCloudSnapshot(): Snapshot {
  return {
    workshop: workshopFromSettings(),
    clients: [],
    vehicles: [],
    articles: [],
    suppliers: [],
    orders: [],
    quotes: [],
    lines: [],
    purchases: [],
    purchaseLines: [],
    appointments: [],
    invoiceLogs: [],
  };
}

export async function readSnapshot(): Promise<Snapshot> {
  if (cloudConfigured() && !cloudActive()) return emptyCloudSnapshot();
  if (cloudActive()) {
    if (cloudMemory) return cloudMemory;
    const loaded = await loadCompanyState();
    if (!loaded) throw new Error("Sem sessão na nuvem.");
    rememberLoadedDocuments(loaded);
    cloudMemory = { workshop: workshopFromSettings(), ...loaded };
    baseSnapshot = structuredClone(cloudMemory);
    return cloudMemory;
  }
  const db = await databaseHandle();
  const existing = (await db.get("kv", "snapshot")) as Snapshot | undefined;
  if (existing) return existing;
  const seeded = await buildDemo();
  await db.put("kv", seeded, "snapshot");
  return seeded;
}

export async function readDeviceSnapshot(): Promise<Snapshot | null> {
  const db = await databaseHandle();
  return ((await db.get("kv", "snapshot")) as Snapshot | undefined) ?? null;
}

export function forgetCloudMemory() {
  cloudMemory = null;
  baseSnapshot = null;
}

async function persistCloud(draft: Snapshot) {
  let current = draft;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await saveCompanyState(snapshotPayload(current));
      baseSnapshot = structuredClone(current);
      return current;
    } catch (error) {
      if (!(error instanceof RevisionConflict) || attempt === 2) throw error;
      const loaded = await loadCompanyState();
      if (!loaded) throw error;
      rememberLoadedDocuments(loaded);
      const remote = { workshop: workshopFromSettings(), ...loaded };
      current = {
        ...remote,
        clients: mergeById(baseSnapshot?.clients, current.clients, remote.clients),
        vehicles: mergeById(baseSnapshot?.vehicles, current.vehicles, remote.vehicles),
        articles: mergeById(baseSnapshot?.articles, current.articles, remote.articles),
        suppliers: mergeById(baseSnapshot?.suppliers, current.suppliers, remote.suppliers),
        orders: mergeById(baseSnapshot?.orders, current.orders, remote.orders),
        quotes: mergeById(baseSnapshot?.quotes, current.quotes, remote.quotes),
        lines: mergeById(baseSnapshot?.lines, current.lines, remote.lines),
        purchases: mergeById(baseSnapshot?.purchases, current.purchases, remote.purchases),
        purchaseLines: mergeById(baseSnapshot?.purchaseLines, current.purchaseLines, remote.purchaseLines),
        appointments: mergeById(baseSnapshot?.appointments, current.appointments, remote.appointments),
        invoiceLogs: mergeById(baseSnapshot?.invoiceLogs, current.invoiceLogs, remote.invoiceLogs),
      };
      baseSnapshot = structuredClone(remote);
    }
  }
  return current;
}

export async function resetDemo() {
  if (cloudActive()) throw new Error("Na nuvem não se repõem os dados de demonstração.");
  const db = await databaseHandle();
  const seeded = await buildDemo();
  await db.put("kv", seeded, "snapshot");
  notifySnapshot();
  return seeded;
}

function snapshotPayload(snap: Snapshot) {
  return {
    clients: snap.clients,
    vehicles: snap.vehicles,
    articles: snap.articles,
    suppliers: snap.suppliers,
    orders: snap.orders,
    quotes: snap.quotes,
    lines: snap.lines,
    purchases: snap.purchases,
    purchaseLines: snap.purchaseLines,
    appointments: snap.appointments,
    invoiceLogs: snap.invoiceLogs.map((log) => ({
      ...log,
      requestJson: log.requestJson || "{}",
      responseJson: log.responseJson || "{}",
    })),
  };
}

function update(mutate: (snap: Snapshot) => void | Promise<void>) {
  const run = chain.then(async () => {
    const snap = structuredClone(await readSnapshot());
    await mutate(snap);
    if (cloudActive()) cloudMemory = await persistCloud(snap);
    else {
      const db = await databaseHandle();
      await db.put("kv", snap, "snapshot");
    }
    notifySnapshot();
    return cloudActive() ? cloudMemory : snap;
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function replaceSnapshot(next: Snapshot) {
  const run = chain.then(async () => {
    if (cloudActive()) cloudMemory = await persistCloud(next);
    else {
      const db = await databaseHandle();
      await db.put("kv", next, "snapshot");
    }
    notifySnapshot();
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function stamp() {
  return nowIso();
}

function rememberLoadedDocuments(loaded: { orders: Order[]; invoiceLogs: InvoiceLog[] }) {
  for (const order of loaded.orders) {
    if (order.invoiceExternalId) continue;
    for (const log of loaded.invoiceLogs) {
      if (log.orderId !== order.id) continue;
      try {
        const parsed = JSON.parse(log.responseJson) as { externalId?: string; documentId?: string };
        const id = parsed.externalId || parsed.documentId;
        if (id) {
          order.invoiceExternalId = String(id);
          break;
        }
      } catch {
        /* the log is not a cached document */
      }
    }
  }
}

export async function rememberOfficialDocument(orderId: string, documentId: string, documentType: string, number: string) {
  const current = await readSnapshot();
  const known = current.orders.find((item) => item.id === orderId)?.invoiceExternalId === documentId
    && current.invoiceLogs.some((log) => {
      if (log.orderId !== orderId) return false;
      try { return String((JSON.parse(log.responseJson) as { externalId?: string }).externalId ?? "") === documentId; } catch { return false; }
    });
  if (known) return;
  await update((snap) => {
    const order = snap.orders.find((item) => item.id === orderId);
    if (order) order.invoiceExternalId = documentId;
    const already = snap.invoiceLogs.some((log) => {
      if (log.orderId !== orderId) return false;
      try { return String((JSON.parse(log.responseJson) as { externalId?: string }).externalId ?? "") === documentId; } catch { return false; }
    });
    if (already) return;
    snap.invoiceLogs.push({
      id: uid(),
      orderId,
      providerId: "certificado",
      providerLabel: "Fatura certificada",
      simulated: false,
      documentNumber: number,
      requestJson: "{}",
      responseJson: JSON.stringify({ externalId: documentId, documentType }),
      createdAt: stamp(),
    });
  });
}

function nextNumber(snap: Snapshot, kind: "OR" | "ORC") {
  const year = lisbonParts().year;
  if (kind === "OR") return nextObraNumber(snap.orders.map((order) => order.number), year);
  const prefix = `${kind}-${year}-`;
  const rows = kind === "OR" ? snap.orders : snap.quotes;
  const max = rows.reduce((highest, row) => {
    if (!row.number.startsWith(prefix)) return highest;
    const value = Number(row.number.slice(prefix.length));
    return Number.isFinite(value) ? Math.max(highest, value) : highest;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

async function serverNumber(series: "OR" | "ORC" | "ORCDOC" | "FT") {
  if (!cloudActive()) return null;
  return assignDocumentNumber(series);
}

function nextDocumentSequence(snap: Snapshot, year: number, prefix: "FT" | "ORC") {
  return (
    snap.orders.reduce((highest, order) => {
      const number = prefix === "FT" ? order.invoiceNumber : order.quoteNumber;
      if (!number?.startsWith(`${prefix} A/${year}/`)) return highest;
      const value = Number(number.split("/").at(-1));
      return Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, 0) + 1
  );
}

export function normalizePersonName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function clientConflict(clients: Client[], data: { name: string; nif: string; phone: string }, ignoreId = "") {
  const nif = normalizeNif(data.nif);
  if (nif === CONSUMIDOR_FINAL.nif) {
    const name = normalizePersonName(data.name);
    if (clients.some((client) => client.id !== ignoreId && normalizeNif(client.nif) === nif && normalizePersonName(client.name) === name)) {
      return "Já existe um cliente com este nome.";
    }
    return "";
  }
  if (nif) {
    if (!isValidNif(nif)) return "NIF inválido.";
    if (clients.some((client) => client.id !== ignoreId && normalizeNif(client.nif) === nif)) return "Já existe um cliente com este NIF.";
  }
  if (!nif) {
    const name = normalizePersonName(data.name);
    const phone = normalizePhone(data.phone);
    if (clients.some((client) => client.id !== ignoreId && !normalizeNif(client.nif) && normalizePersonName(client.name) === name && normalizePhone(client.phone) === phone)) {
      return "Já existe um cliente com este nome e telefone.";
    }
  }
  return "";
}

export async function saveClientRecord(id: string | null, data: Omit<Client, "id" | "createdAt" | "updatedAt">) {
  if (data.name.trim().length < 1) return { ok: false as const, error: "Indique o nome." };
  let saved: Client | null = null;
  await update((snap) => {
    const conflict = clientConflict(snap.clients, data, id ?? "");
    if (conflict) throw new Error(conflict);
    if (id) {
      const current = snap.clients.find((client) => client.id === id);
      if (!current) throw new Error("Cliente não encontrado.");
      Object.assign(current, data, { updatedAt: stamp() });
      saved = current;
    } else {
      saved = { ...data, id: uid(), createdAt: stamp(), updatedAt: stamp() };
      snap.clients.push(saved);
    }
  }).catch((error: unknown) => {
    saved = null;
    throw error;
  });
  if (!saved) return { ok: false as const, error: "Não foi possível guardar o cliente." };
  const client = saved as Client;
  return { ok: true as const, id: client.id, name: client.name, nif: client.nif };
}

export async function ensureConsumidorFinalRecord() {
  let saved: Client | null = null;
  await update((snap) => {
    const current = snap.clients.find((client) => client.nif === CONSUMIDOR_FINAL.nif);
    if (current) {
      current.name = CONSUMIDOR_FINAL.name;
      current.address = "";
      current.updatedAt = stamp();
      saved = current;
      return;
    }
    saved = {
      id: uid(),
      name: CONSUMIDOR_FINAL.name,
      nif: CONSUMIDOR_FINAL.nif,
      phone: "",
      email: "",
      address: "",
      postalCode: "",
      city: "",
      notes: "",
      createdAt: stamp(),
      updatedAt: stamp(),
    };
    snap.clients.push(saved);
  });
  if (!saved) return { ok: false as const, error: "Não foi possível preparar o consumidor final." };
  const client = saved as Client;
  return { ok: true as const, id: client.id, name: client.name, nif: client.nif };
}

export async function deleteClientRecord(id: string) {
  try {
    await update((snap) => {
      if (
        snap.vehicles.some((item) => item.clientId === id) ||
        snap.orders.some((item) => item.clientId === id) ||
        snap.quotes.some((item) => item.clientId === id) ||
        snap.appointments.some((item) => item.clientId === id)
      ) {
        throw new Error("Este cliente tem viaturas, documentos ou marcações. Não pode ser eliminado.");
      }
      snap.clients = snap.clients.filter((client) => client.id !== id);
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível eliminar." };
  }
}

export async function saveVehicleRecord(
  id: string | null,
  data: Omit<Vehicle, "id" | "createdAt" | "updatedAt">,
) {
  const plate = normalizePlate(data.plate);
  if (!plate) return { ok: false as const, error: "Indique a matrícula." };
  if (!isValidVin(data.vin)) return { ok: false as const, error: "O VIN, se preenchido, tem 17 caracteres (sem I, O ou Q)." };
  const clientId = data.clientId || null;
  let saved: Vehicle | null = null;
  try {
    await update((snap) => {
      if (clientId && !snap.clients.some((client) => client.id === clientId)) throw new Error("Cliente não encontrado.");
      if (snap.vehicles.some((vehicle) => platesMatch(vehicle.plate, plate) && vehicle.id !== id)) {
        throw new Error("Já existe uma viatura com esta matrícula.");
      }
      data = { ...data, plate };
      const patch = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
      if (id) {
        const current = snap.vehicles.find((vehicle) => vehicle.id === id);
        if (!current) throw new Error("Viatura não encontrada.");
        Object.assign(current, patch, { clientId, updatedAt: stamp() });
        saved = current;
      } else {
        saved = {
          engineCode: "",
          oil: "",
          nextInspection: "",
          nextService: "",
          ...patch,
          clientId,
          id: uid(),
          createdAt: stamp(),
          updatedAt: stamp(),
        } as Vehicle;
        snap.vehicles.push(saved);
      }
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível guardar a viatura." };
  }
  if (!saved) return { ok: false as const, error: "Não foi possível guardar a viatura." };
  const vehicle = saved as Vehicle;
  return {
    ok: true as const,
    id: vehicle.id,
    clientId: vehicle.clientId,
    plate: vehicle.plate,
    brand: vehicle.brand,
    model: vehicle.model,
    km: vehicle.km,
  };
}

export async function deleteVehicleRecord(id: string) {
  try {
    await update((snap) => {
      if (
        snap.orders.some((item) => item.vehicleId === id) ||
        snap.quotes.some((item) => item.vehicleId === id) ||
        snap.appointments.some((item) => item.vehicleId === id)
      ) {
        throw new Error("Esta viatura tem ordens, orçamentos ou marcações.");
      }
      snap.vehicles = snap.vehicles.filter((vehicle) => vehicle.id !== id);
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível eliminar." };
  }
}

export async function saveArticleRecord(id: string | null, data: Omit<Article, "id" | "createdAt" | "updatedAt" | "active"> & { active?: boolean }) {
  if (!isValidRef(data.ref)) return { ok: false as const, error: "A referência deve ter 2 a 24 caracteres, em maiúsculas." };
  if (data.description.length < 2) return { ok: false as const, error: "Indique a descrição." };
  let savedId = "";
  try {
    await update((snap) => {
      if (snap.articles.some((article) => article.ref === data.ref && article.id !== id)) {
        throw new Error("Já existe um artigo com esta referência.");
      }
      if (id) {
        const current = snap.articles.find((article) => article.id === id);
        if (!current) throw new Error("Artigo não encontrado.");
        Object.assign(current, data, { active: true, updatedAt: stamp() });
        savedId = current.id;
      } else {
        const created: Article = { ...data, id: uid(), active: true, createdAt: stamp(), updatedAt: stamp() };
        snap.articles.push(created);
        savedId = created.id;
      }
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível guardar o artigo." };
  }
  return { ok: true as const, id: savedId };
}

export async function removeArticleRecord(id: string) {
  let archived = false;
  await update((snap) => {
    const used = snap.lines.some((line) => line.articleId === id) || snap.purchaseLines.some((line) => line.articleId === id);
    if (used) {
      const article = snap.articles.find((item) => item.id === id);
      if (article) article.active = false;
      archived = true;
      return;
    }
    snap.articles = snap.articles.filter((article) => article.id !== id);
  });
  return { ok: true as const, archived };
}

export async function saveSupplierRecord(id: string | null, data: Omit<Supplier, "id" | "createdAt" | "updatedAt">) {
  if (data.name.trim().length < 2) return { ok: false as const, error: "Indique o nome do fornecedor." };
  if (data.nif && !isValidNif(data.nif)) return { ok: false as const, error: "NIF inválido." };
  let saved: Supplier | null = null;
  await update((snap) => {
    if (id) {
      const current = snap.suppliers.find((supplier) => supplier.id === id);
      if (!current) throw new Error("Fornecedor não encontrado.");
      Object.assign(current, data, { updatedAt: stamp() });
      saved = current;
    } else {
      saved = { ...data, id: uid(), createdAt: stamp(), updatedAt: stamp() };
      snap.suppliers.push(saved);
    }
  });
  if (!saved) return { ok: false as const, error: "Não foi possível guardar o fornecedor." };
  const supplier = saved as Supplier;
  return { ok: true as const, id: supplier.id, name: supplier.name };
}

export async function deleteSupplierRecord(id: string) {
  try {
    await update((snap) => {
      if (snap.purchases.some((purchase) => purchase.supplierId === id)) {
        throw new Error("Este fornecedor tem compras lançadas.");
      }
      snap.suppliers = snap.suppliers.filter((supplier) => supplier.id !== id);
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível eliminar." };
  }
}

type IncomingLine = {
  kind: "mao_de_obra" | "peca" | "servico" | "servico_externo";
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountPercent?: number;
  vatRate: number;
  internalNote?: string;
  articleId: string | null;
  ref?: string;
  stockEntry?: StockLink | null;
};

function pushLines(snap: Snapshot, parent: { orderId?: string; quoteId?: string }, lines: IncomingLine[]) {
  lines.forEach((line, position) => {
    snap.lines.push({
      id: uid(),
      kind: line.kind,
      description: line.description,
      quantity: line.quantity,
      unitPrice: roundPrice(line.unitPrice),
      unitCost: line.kind === "mao_de_obra" ? 0 : roundPrice(line.unitCost),
      discountPercent: round2(line.discountPercent ?? 0),
      vatRate: line.vatRate,
      internalNote: line.internalNote ?? "",
      articleId: line.kind === "peca" ? line.articleId : null,
      ref: line.ref?.trim() ?? "",
      orderId: parent.orderId ?? null,
      quoteId: parent.quoteId ?? null,
      position,
      stockEntry: line.kind === "peca" ? line.stockEntry ?? null : null,
    });
  });
}

export async function saveOrderRecord(id: string | null, input: {
  clientId: string;
  vehicleId: string;
  dateIn: string;
  dateOut: string;
  km: number;
  kmOut?: number | null;
  problem: string;
  notes: string;
  status: string;
  approval?: string;
  approvalAt?: string | null;
  lines: IncomingLine[];
}) {
  if (input.dateOut && input.dateOut < input.dateIn) {
    return { ok: false as const, error: "A data de saída não pode ser anterior à entrada." };
  }
  let savedId = "";
  const stock: Record<string, number> = {};
  try {
    const reservedOrder = id ? null : await serverNumber("OR");
    await update((snap) => {
      const clientId = input.clientId || null;
      const vehicleId = input.vehicleId || null;
      if (clientId && !snap.clients.some((client) => client.id === clientId)) throw new Error("Cliente não encontrado.");
      const vehicle = vehicleId ? snap.vehicles.find((item) => item.id === vehicleId) : null;
      if (vehicleId && !vehicle) throw new Error("Viatura não encontrada.");
      for (const line of input.lines) {
        if (line.kind === "peca" && line.articleId && !snap.articles.some((article) => article.id === line.articleId)) {
          throw new Error("Uma das peças já não existe no stock.");
        }
      }
      if (vehicle && clientId) vehicle.clientId = clientId;
      if (vehicle && input.km > vehicle.km) vehicle.km = input.km;
      const previousLines = id ? snap.lines.filter((line) => line.orderId === id) : [];
      for (const articleId of adjustOilStock(snap, previousLines, input.lines)) {
        const article = snap.articles.find((item) => item.id === articleId);
        if (article) stock[articleId] = article.stockQty;
      }
      const dateOut = input.dateOut
        ? dateOnly(input.dateOut).toISOString()
        : input.status === "concluida"
          ? dateOnly(lisbonParts().iso).toISOString()
          : null;
      const data = {
        clientId,
        vehicleId,
        dateIn: dateOnly(input.dateIn).toISOString(),
        dateOut,
        km: input.km,
        kmOut: input.kmOut ?? null,
        problem: input.problem.trim(),
        notes: input.notes,
        status: input.status,
        approval: input.approval || "aguarda",
        approvalAt: input.approval && input.approval !== "aguarda" ? input.approvalAt ?? null : null,
        updatedAt: stamp(),
      };
      if (!id) {
        const created: Order = {
          ...data,
          id: uid(),
          number: reservedOrder ?? nextNumber(snap, "OR"),
          invoiceNumber: null,
          invoiceProvider: null,
          invoiceIssuedAt: null,
          invoiceSimulated: false,
          quoteId: null,
          createdAt: stamp(),
        };
        snap.orders.push(created);
        pushLines(snap, { orderId: created.id }, input.lines);
        savedId = created.id;
        return;
      }
      const current = snap.orders.find((order) => order.id === id);
      if (!current) throw new Error("Ordem não encontrada.");
      if (current.status === "faturada") throw new Error("Uma ordem faturada não pode ser alterada.");
      Object.assign(current, data);
      if (current.quoteId && clientId) {
        const quote = snap.quotes.find((item) => item.id === current.quoteId);
        if (quote) {
          quote.clientId = clientId;
          if (vehicleId) quote.vehicleId = vehicleId;
          quote.updatedAt = stamp();
        }
      }
      snap.lines = snap.lines.filter((line) => line.orderId !== id);
      pushLines(snap, { orderId: id }, input.lines);
      savedId = id;
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível guardar a ordem." };
  }
  return { ok: true as const, id: savedId, stock };
}

function stockTaken(snap: Snapshot, lines: Array<{ articleId: string | null; quantity: number }>) {
  const taken = new Map<string, number>();
  for (const line of lines) {
    if (!line.articleId) continue;
    const article = snap.articles.find((item) => item.id === line.articleId);
    if (!article) continue;
    taken.set(article.id, round2((taken.get(article.id) ?? 0) + line.quantity));
  }
  return taken;
}

function adjustOilStock(snap: Snapshot, before: Array<{ articleId: string | null; quantity: number }>, after: Array<{ articleId: string | null; quantity: number }>) {
  const previous = stockTaken(snap, before);
  const next = stockTaken(snap, after);
  const touched: string[] = [];
  for (const articleId of new Set([...previous.keys(), ...next.keys()])) {
    const article = snap.articles.find((item) => item.id === articleId);
    if (!article) continue;
    const delta = (next.get(articleId) ?? 0) - (previous.get(articleId) ?? 0);
    if (!delta) continue;
    article.stockQty = round2(article.stockQty - delta);
    article.updatedAt = stamp();
    touched.push(articleId);
  }
  return touched;
}

export async function saveQuoteRecord(id: string | null, input: {
  clientId: string;
  vehicleId: string;
  date: string;
  validUntil: string;
  km: number;
  problem: string;
  notes: string;
  status: string;
  lines: IncomingLine[];
}) {
  if (input.problem.trim().length < 3) return { ok: false as const, error: "Descreva o trabalho a orçamentar." };
  let savedId = "";
  try {
    const reservedQuote = id ? null : await serverNumber("ORC");
    await update((snap) => {
      const vehicle = snap.vehicles.find((item) => item.id === input.vehicleId && item.clientId === input.clientId);
      if (!vehicle) throw new Error("A viatura não pertence ao cliente.");
      const data = {
        clientId: input.clientId,
        vehicleId: input.vehicleId,
        date: dateOnly(input.date).toISOString(),
        validUntil: input.validUntil ? dateOnly(input.validUntil).toISOString() : null,
        km: input.km,
        problem: input.problem.trim(),
        notes: input.notes,
        status: input.status,
        updatedAt: stamp(),
      };
      if (!id) {
        const created: Quote = { ...data, id: uid(), number: reservedQuote ?? nextNumber(snap, "ORC"), createdAt: stamp() };
        snap.quotes.push(created);
        pushLines(snap, { quoteId: created.id }, input.lines);
        savedId = created.id;
        return;
      }
      const current = snap.quotes.find((quote) => quote.id === id);
      if (!current) throw new Error("Orçamento não encontrado.");
      if (current.status === "convertido") throw new Error("Um orçamento convertido não pode ser alterado.");
      Object.assign(current, data);
      snap.lines = snap.lines.filter((line) => line.quoteId !== id);
      pushLines(snap, { quoteId: id }, input.lines);
      savedId = id;
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível guardar o orçamento." };
  }
  return { ok: true as const, id: savedId };
}

export async function convertQuoteRecord(id: string) {
  let orderId = "";
  try {
    await update((snap) => {
      const quote = snap.quotes.find((item) => item.id === id);
      if (!quote) throw new Error("Orçamento não encontrado.");
      if (quote.status === "convertido" || snap.orders.some((order) => order.quoteId === id)) {
        throw new Error("Este orçamento já foi convertido.");
      }
      if (quote.status === "recusado") throw new Error("Um orçamento recusado não pode ser convertido.");
      const created: Order = {
        id: uid(),
        number: nextNumber(snap, "OR"),
        clientId: quote.clientId,
        vehicleId: quote.vehicleId,
        dateIn: dateOnly(lisbonParts().iso).toISOString(),
        dateOut: null,
        km: quote.km,
        problem: quote.problem,
        status: "aberta",
        notes: quote.notes,
        invoiceNumber: null,
        invoiceProvider: null,
        invoiceIssuedAt: null,
        invoiceSimulated: false,
        quoteId: quote.id,
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      snap.orders.push(created);
      const source = snap.lines.filter((line) => line.quoteId === quote.id);
      pushLines(
        snap,
        { orderId: created.id },
        source.map((line) => ({
          kind: line.kind === "mao_de_obra" ? "mao_de_obra" : "peca",
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
          discountPercent: line.discountPercent ?? 0,
          vatRate: line.vatRate,
          articleId: line.articleId,
        })),
      );
      quote.status = "convertido";
      quote.updatedAt = stamp();
      orderId = created.id;
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível converter o orçamento." };
  }
  return { ok: true as const, orderId };
}

function orderBundle(snap: Snapshot, orderId: string) {
  const order = snap.orders.find((item) => item.id === orderId);
  if (!order) return null;
  const client = snap.clients.find((item) => item.id === order.clientId);
  const vehicle = snap.vehicles.find((item) => item.id === order.vehicleId);
  if (!client || !vehicle) return null;
  const lines = snap.lines
    .filter((line) => line.orderId === orderId)
    .sort((a, b) => a.position - b.position)
    .map((line) => ({
      ...line,
      article: snap.articles.find((article) => article.id === line.articleId) ?? null,
    }));
  return { order, client, vehicle, lines };
}

function moloniPayload(bundle: NonNullable<ReturnType<typeof orderBundle>>, sequence: number, year: number) {
  // Same lines and rounding as the obra screen: the invoice total must be exactly the obra total.
  const built = buildInvoiceLines(bundle.lines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent ?? 0,
    vatRate: line.vatRate,
    kind: line.kind,
    ref: line.ref,
    articleRef: line.article?.ref ?? null,
  })));
  return {
    orderId: bundle.order.id,
    orderNumber: bundle.order.number,
    sequence,
    year,
    customer: {
      name: bundle.client.name,
      nif: bundle.client.nif,
      address: bundle.client.address,
      postalCode: bundle.client.postalCode,
      city: bundle.client.city,
      email: bundle.client.email,
      phone: bundle.client.phone,
    },
    lines: built.lines,
    base: built.base,
    vat: built.vat,
    total: built.total,
  };
}

export async function issueQuoteRecord(orderId: string) {
  const snap = await readSnapshot();
  const bundle = orderBundle(snap, orderId);
  if (!bundle) return { ok: false as const, error: "Indique o cliente e a viatura antes de gerar o orçamento." };
  if (bundle.lines.length === 0) return { ok: false as const, error: "A folha não tem linhas." };
  if (bundle.order.quoteNumber) {
    return {
      ok: true as const,
      documentNumber: bundle.order.quoteNumber,
      url: bundle.order.quoteUrl ?? `/ordens/${orderId}/orcamento`,
    };
  }
  const year = lisbonParts().year;
  let issued;
  try {
    const payload = moloniPayload(bundle, nextDocumentSequence(snap, year, "ORC"), year);
    const cloudUser = readCloudUser();
    const remote = cloudUser?.companyId
      ? await issueCloudDocument({
        companyId: cloudUser.companyId,
        kind: "orcamento",
        orderId,
        orderNumber: payload.orderNumber,
        total: payload.total,
        customer: payload.customer,
        lines: payload.lines,
      })
      : null;
    if (remote) issued = remote;
    else {
      const serverQuote = await serverNumber("ORCDOC");
      issued = await issueMoloniQuote({ ...payload, sequence: serverQuote ? 1 : payload.sequence });
      if (issued.simulated && serverQuote) issued = { ...issued, documentNumber: serverQuote };
    }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "O programa de faturação recusou o orçamento." };
  }
  const url = issued.url ?? `/ordens/${orderId}/orcamento`;
  await update((current) => {
    const order = current.orders.find((item) => item.id === orderId);
    if (!order) throw new Error("Ordem não encontrada.");
    order.quoteNumber = issued.documentNumber;
    order.quoteUrl = url;
    order.updatedAt = stamp();
  });
  return { ok: true as const, documentNumber: issued.documentNumber, url };
}

export async function issueInvoiceRecord(orderId: string, paymentMethod = "Transferência") {
  if (!SHEET_PAYMENTS.includes(paymentMethod as (typeof SHEET_PAYMENTS)[number])) {
    return { ok: false as const, error: "Escolha o modo de pagamento." };
  }
  const snap = await readSnapshot();
  const order = snap.orders.find((item) => item.id === orderId);
  if (!order) return { ok: false as const, error: "Ordem não encontrada." };
  if (!order.clientId || !order.vehicleId) return { ok: false as const, error: "Indique o cliente e a viatura antes de faturar." };
  const bundle = orderBundle(snap, orderId);
  if (!bundle) return { ok: false as const, error: "Ordem não encontrada." };
  if (bundle.order.status === "faturada") return { ok: false as const, error: "Esta ordem já foi faturada." };
  if (bundle.order.status !== "concluida") return { ok: false as const, error: "Só é possível faturar uma ordem concluída." };
  if (bundle.lines.length === 0) return { ok: false as const, error: "A ordem não tem linhas para faturar." };
  const year = lisbonParts().year;
  let issued;
  try {
    // The connected invoicing program assigns the number itself; only claim an internal FT number
    // when there is no connected program (simulated invoice), and only after nothing else failed.
    const payload = moloniPayload(bundle, nextDocumentSequence(snap, year, "FT"), year);
    const cloudUser = readCloudUser();
    const remote = cloudUser?.companyId
      ? await issueCloudDocument({
        companyId: cloudUser.companyId,
        kind: "fatura",
        orderId,
        orderNumber: payload.orderNumber,
        paymentMethod,
        total: payload.total,
        customer: payload.customer,
        lines: payload.lines,
      })
      : null;
    if (remote) issued = remote;
    else {
      const serverInvoice = await serverNumber("FT");
      issued = await issueMoloniInvoice({ ...payload, sequence: serverInvoice ? 1 : payload.sequence, paymentMethod });
      if (issued.simulated && serverInvoice) issued = { ...issued, documentNumber: serverInvoice };
    }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "O programa de faturação recusou a fatura." };
  }
  // The number exists now: let the dialog close while the obra is saved.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("oficinaplan:invoice-issued", { detail: { orderId, number: issued.documentNumber } }));
  }
  const url = issued.url ?? `/ordens/${orderId}/fatura`;
  let warning: string | null = null;
  try {
    await update((current) => {
      const saved = current.orders.find((item) => item.id === orderId);
      if (!saved || saved.status !== "concluida") throw new Error("A ordem mudou de estado. Atualize a página.");
      warning = null;
      const clash = current.orders.find((item) => item.id !== orderId && item.invoiceNumber === issued.documentNumber);
      if (clash) {
        console.warn("[faturar] número repetido", issued.documentNumber, "já usado na obra", clash.number, clash.id);
        // The external document already exists: never lose it because of imported history.
        // Only a clash with another document issued here (not imported) is a real duplicate.
        if (!isImportedOrder(clash)) {
          throw new Error(`O número ${issued.documentNumber} já está gravado na obra ${clash.number}. A fatura não foi gravada nesta obra; avisa o suporte antes de tentar outra vez.`);
        }
        warning = `Fatura gravada nesta obra, mas o número ${issued.documentNumber} também existe no histórico importado (obra ${clash.number}). Confirma no programa de faturação qual é a conta ligada.`;
      }
      saved.status = "faturada";
      saved.invoiceNumber = issued.documentNumber;
      saved.invoiceProvider = issued.providerLabel;
      saved.invoiceIssuedAt = new Date().toISOString();
      saved.invoiceSimulated = issued.simulated;
      saved.invoiceUrl = url;
      if (issued.externalId) saved.invoiceExternalId = String(issued.externalId);
      saved.paymentMethod = paymentMethod;
      saved.dateOut = saved.dateOut ?? dateOnly(lisbonParts().iso).toISOString();
      saved.updatedAt = stamp();
      current.invoiceLogs.push({
        id: uid(),
        orderId,
        providerId: issued.providerId,
        providerLabel: issued.providerLabel,
        simulated: issued.simulated,
        documentNumber: issued.documentNumber,
        requestJson: JSON.stringify({ paymentMethod, customer: bundle.client.nif, ...(warning ? { conflict: { number: issued.documentNumber, withOrder: clash?.id, withObra: clash?.number } } : {}) }),
        responseJson: JSON.stringify(issued),
        createdAt: stamp(),
      });
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível gravar a fatura." };
  }
  return { ok: true as const, documentNumber: issued.documentNumber, provider: issued.providerLabel, url, warning: warning as string | null };
}

function isImportedOrder(order: Order) {
  return /import/i.test(order.invoiceProvider ?? "");
}

type PurchaseInput = {
  date: string;
  supplierId: string;
  documentType: string;
  invoiceNumber: string;
  paymentMethod: string;
  ref: string;
  description: string;
  quantity: number;
  cost: number;
  vat: number;
  margin: number;
  family: string;
  tipologia?: string;
  isOil?: boolean;
};

export async function savePurchasesRecord(lines: PurchaseInput[]) {
  let count = 0;
  let articles = 0;
  try {
    await update((snap) => {
      const groups = new Map<string, PurchaseInput[]>();
      for (const line of lines) {
        const key = [line.date, line.supplierId, line.documentType, line.invoiceNumber.trim(), line.paymentMethod].join("|");
        const bucket = groups.get(key) ?? [];
        bucket.push(line);
        groups.set(key, bucket);
      }
      const touched = new Set<string>();
      for (const group of groups.values()) {
        const head = group[0];
        if (snap.purchases.some((purchase) => !purchase.voided && purchase.supplierId === head.supplierId && purchase.documentType === head.documentType && purchase.invoiceNumber === head.invoiceNumber.trim())) {
          throw new Error(`O documento ${head.invoiceNumber} deste fornecedor já foi lançado.`);
        }
        const purchase: Purchase = {
          id: uid(),
          date: dateOnly(head.date).toISOString(),
          supplierId: head.supplierId,
          documentType: head.documentType,
          invoiceNumber: head.invoiceNumber.trim(),
          paymentMethod: head.paymentMethod,
          voided: false,
          voidedAt: null,
          createdAt: stamp(),
        };
        snap.purchases.push(purchase);
        count += 1;
        group.forEach((line, position) => {
          const tipologia = line.tipologia || "produto";
          const description = normalizeArticleDescription(line.description);
          if (!purchaseTypeMovesStock(tipologia)) {
            snap.purchaseLines.push({
              id: uid(),
              purchaseId: purchase.id,
              articleId: null,
              tipologia,
              ref: line.ref.trim(),
              description,
              quantity: line.quantity,
              cost: line.cost,
              vatRate: line.vat,
              margin: line.margin,
              position,
              stockBefore: 0,
              costBefore: 0,
            });
            return;
          }
          const ref = normalizeRef(line.ref);
          const oil = Boolean(line.isOil) || isOilArticle({ family: line.family, ref });
          let article = snap.articles.find((item) => item.ref === ref);
          if (!article) {
            article = {
              id: uid(),
              ref,
              description,
              family: line.family || (oil ? "Óleo" : "Produto"),
              costPrice: 0,
              lastCost: null,
              marginPercent: line.margin,
              vatRate: line.vat,
              stockQty: 0,
              minStock: defaultMinStock({ family: line.family, ref, isOil: oil }),
              isOil: oil,
              active: true,
              createdAt: stamp(),
              updatedAt: stamp(),
            };
            snap.articles.push(article);
          }
          const delta = stockDelta(line.documentType, line.quantity);
          const stockBefore = article.stockQty;
          const costBefore = article.costPrice;
          article.stockQty = round2(stockBefore + delta);
          article.costPrice = delta > 0 ? nextCost(Math.max(stockBefore, 0), costBefore, delta, line.cost) : costBefore;
          article.marginPercent = line.margin;
          article.vatRate = line.vat;
          article.active = true;
          article.updatedAt = stamp();
          snap.purchaseLines.push({
            id: uid(),
            purchaseId: purchase.id,
            articleId: article.id,
            tipologia,
            ref,
            description,
            quantity: line.quantity,
            cost: line.cost,
            vatRate: line.vat,
            margin: line.margin,
            position,
            stockBefore,
            costBefore,
          });
          touched.add(article.id);
        });
      }
      for (const articleId of touched) syncLastCost(snap, articleId);
      articles = touched.size;
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível lançar a compra." };
  }
  return { ok: true as const, count, articles };
}

export async function cancelPurchaseRecord(id: string) {
  try {
    await update((snap) => {
      const purchase = snap.purchases.find((item) => item.id === id);
      if (!purchase) throw new Error("Compra não encontrada.");
      if (purchase.voided) throw new Error("Esta compra já foi anulada.");
      const lines = snap.purchaseLines.filter((line) => line.purchaseId === id).sort((a, b) => b.position - a.position);
      for (const line of lines) {
        if (!line.articleId) continue;
        const article = snap.articles.find((item) => item.id === line.articleId);
        if (!article) continue;
        const delta = stockDelta(purchase.documentType, line.quantity);
        article.stockQty = round2(article.stockQty - delta);
        article.updatedAt = stamp();
      }
      purchase.voided = true;
      purchase.voidedAt = stamp();
      for (const line of lines) {
        if (line.articleId) syncLastCost(snap, line.articleId);
      }
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível anular a compra." };
  }
}

function viewArticle(article: Article): StockArticle {
  return {
    id: article.id,
    ref: article.ref,
    description: article.description,
    costPrice: article.costPrice,
    lastCost: article.lastCost,
    marginPercent: article.marginPercent,
    vatRate: article.vatRate,
    stockQty: article.stockQty,
    family: article.family,
  };
}

function syncLastCost(snap: Snapshot, articleId: string) {
  const article = snap.articles.find((item) => item.id === articleId);
  if (!article) return;
  const entries = snap.purchaseLines.flatMap((line) => {
    if (line.articleId !== articleId) return [];
    const purchase = snap.purchases.find((item) => item.id === line.purchaseId);
    if (!purchase || purchase.voided || purchase.documentType === "Nota de crédito") return [];
    return [{ date: purchase.date, createdAt: purchase.createdAt, cost: line.cost }];
  });
  article.lastCost = latestEntryCost(entries);
}

export async function commitStockEntryRecord(input: StockEntryInput) {
  const ref = normalizeRef(input.ref);
  if (!isValidRef(ref)) return { ok: false as const, error: `Referência inválida: ${input.ref || "(vazia)"}.` };
  const description = normalizeArticleDescription(input.description);
  if (description.length < 2) return { ok: false as const, error: "Indique a descrição do artigo." };
  if (!(input.quantity > 0)) return { ok: false as const, error: "A quantidade tem de ser superior a zero." };
  if (!input.supplierId) return { ok: false as const, error: "Escolha o fornecedor." };
  const invoiceNumber = input.invoiceNumber.trim();
  if (!invoiceNumber) return { ok: false as const, error: "Indique o número da fatura." };
  if (invoiceNumber.length > 40) return { ok: false as const, error: "O número da fatura é demasiado longo." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false as const, error: "Data inválida." };
  if (!(input.cost >= 0)) return { ok: false as const, error: "Custo inválido." };
  if (!(input.vat >= 0 && input.vat <= 100)) return { ok: false as const, error: "IVA inválido." };
  const quantity = round2(input.quantity);
  const cost = round2(input.cost);
  let saved: { link: StockLink; article: StockArticle } | null = null;
  try {
    await update((snap) => {
      const supplier = snap.suppliers.find((item) => item.id === input.supplierId);
      if (!supplier) throw new Error("Fornecedor não encontrado.");
      const existing = input.purchaseLineId
        ? snap.purchaseLines.find((item) => item.id === input.purchaseLineId)
        : undefined;
      const existingPurchase = existing ? snap.purchases.find((item) => item.id === existing.purchaseId) : undefined;
      if (input.purchaseLineId && (!existing || !existingPurchase || existingPurchase.voided)) {
        throw new Error("A entrada de stock já não existe.");
      }
      if (existing && existingPurchase) {
        const previous = snap.articles.find((item) => item.id === existing.articleId);
        if (previous) {
          previous.stockQty = round2(previous.stockQty - stockDelta(existingPurchase.documentType, existing.quantity));
          previous.updatedAt = stamp();
        }
        snap.purchaseLines = snap.purchaseLines.filter((item) => item.id !== existing.id);
        if (!snap.purchaseLines.some((item) => item.purchaseId === existingPurchase.id)) {
          snap.purchases = snap.purchases.filter((item) => item.id !== existingPurchase.id);
        }
      }

      let purchase = snap.purchases.find(
        (item) =>
          !item.voided &&
          item.supplierId === supplier.id &&
          item.documentType === "Fatura" &&
          item.invoiceNumber.trim().toLowerCase() === invoiceNumber.toLowerCase(),
      );
      if (purchase) {
        purchase.date = dateOnly(input.date).toISOString();
        purchase.invoiceNumber = invoiceNumber;
      } else {
        purchase = {
          id: uid(),
          date: dateOnly(input.date).toISOString(),
          supplierId: supplier.id,
          documentType: "Fatura",
          invoiceNumber,
          paymentMethod: "Transferência",
          voided: false,
          voidedAt: null,
          createdAt: stamp(),
        };
        snap.purchases.push(purchase);
      }

      const oil = isOilArticle({ family: input.family, ref });
      let article = snap.articles.find((item) => item.ref === ref);
      if (!article) {
        article = {
          id: uid(),
          ref,
          description,
          family: input.family || (oil ? "Óleo" : "Produto"),
          costPrice: cost,
          lastCost: null,
          marginPercent: input.margin,
          vatRate: input.vat,
          stockQty: 0,
          minStock: defaultMinStock({ family: input.family, ref, isOil: oil }),
          isOil: oil,
          active: true,
          createdAt: stamp(),
          updatedAt: stamp(),
        };
        snap.articles.push(article);
      }
      const stockBefore = article.stockQty;
      article.stockQty = round2(stockBefore + quantity);
      article.active = true;
      article.updatedAt = stamp();
      const purchaseLineId = existing?.id ?? uid();
      snap.purchaseLines.push({
        id: purchaseLineId,
        purchaseId: purchase.id,
        articleId: article.id,
        tipologia: "produto",
        ref,
        description,
        quantity,
        cost,
        vatRate: input.vat,
        margin: input.margin,
        position: snap.purchaseLines.filter((item) => item.purchaseId === purchase.id).length,
        stockBefore,
        costBefore: article.costPrice,
      });
      const link: StockLink = {
        purchaseId: purchase.id,
        purchaseLineId,
        invoiceNumber,
        supplierId: supplier.id,
        supplierName: supplier.name,
        quantity,
        cost,
        vatRate: input.vat,
        date: input.date,
      };
      for (const doc of snap.lines) {
        if (doc.id === input.lineId || doc.stockEntry?.purchaseLineId === purchaseLineId) {
          doc.stockEntry = link;
          if (doc.kind === "peca") doc.articleId = article.id;
        }
      }
      syncLastCost(snap, article.id);
      saved = { link, article: viewArticle(article) };
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível dar entrada de stock." };
  }
  const payload = saved as { link: StockLink; article: StockArticle } | null;
  if (!payload) return { ok: false as const, error: "Não foi possível dar entrada de stock." };
  return { ok: true as const, link: payload.link, article: payload.article };
}

export async function removeStockEntryRecord(purchaseLineId: string) {
  let article: StockArticle | null = null;
  try {
    await update((snap) => {
      const line = snap.purchaseLines.find((item) => item.id === purchaseLineId);
      if (!line) return;
      const purchase = snap.purchases.find((item) => item.id === line.purchaseId);
      if (!purchase || purchase.voided) return;
      const current = snap.articles.find((item) => item.id === line.articleId);
      if (current) {
        current.stockQty = round2(current.stockQty - stockDelta(purchase.documentType, line.quantity));
        current.updatedAt = stamp();
        article = viewArticle(current);
      }
      snap.purchaseLines = snap.purchaseLines.filter((item) => item.id !== line.id);
      if (!snap.purchaseLines.some((item) => item.purchaseId === purchase.id)) {
        snap.purchases = snap.purchases.filter((item) => item.id !== purchase.id);
      }
      if (current) syncLastCost(snap, current.id);
      article = current ? viewArticle(current) : article;
      for (const doc of snap.lines) {
        if (doc.stockEntry?.purchaseLineId === purchaseLineId) doc.stockEntry = null;
      }
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível retirar a entrada." };
  }
  return { ok: true as const, article };
}

export async function saveAppointmentRecord(input: {
  date: string;
  time: string;
  duration: number;
  clientId: string;
  vehicleId: string;
  title: string;
  notes: string;
}) {
  let savedId = "";
  try {
    await update((snap) => {
      if (!snap.clients.some((client) => client.id === input.clientId)) throw new Error("Cliente não encontrado.");
      if (input.vehicleId) {
        const vehicle = snap.vehicles.find((item) => item.id === input.vehicleId);
        if (!vehicle || vehicle.clientId !== input.clientId) throw new Error("A viatura não pertence ao cliente.");
      }
      if (!Number.isFinite(input.duration) || input.duration < 15 || input.duration > 480) throw new Error("A duração tem de ficar entre 15 minutos e 8 horas.");
      const startsAt = zonedDateTime(input.date, input.time);
      if (!fitsOpeningHours(startsAt, input.duration)) {
        throw new Error("Esse horário fica fora da oficina: segunda a sexta, 9:00–13:00 e 14:30–18:00.");
      }
      const endsAt = new Date(startsAt.getTime() + input.duration * 60 * 1000);
      if (snap.appointments.some((item) => startsAt < new Date(item.endsAt) && endsAt > new Date(item.startsAt))) {
        throw new Error("Já há uma marcação nesse intervalo.");
      }
      const created: Appointment = {
        id: uid(),
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + input.duration * 60 * 1000).toISOString(),
        clientId: input.clientId,
        vehicleId: input.vehicleId || null,
        title: input.title,
        notes: input.notes,
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      snap.appointments.push(created);
      savedId = created.id;
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível criar a marcação." };
  }
  return { ok: true as const, id: savedId };
}

function fitsOpeningHours(startsAt: Date, durationMin: number) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(startsAt);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  if (weekday === "Sat" || weekday === "Sun") return false;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const start = hour * 60 + minute;
  const end = start + durationMin;
  return (start >= 9 * 60 && end <= 13 * 60) || (start >= 14 * 60 + 30 && end <= 18 * 60);
}

export async function convertAppointmentRecord(id: string) {
  let orderId = "";
  try {
    const reservedOrder = await serverNumber("OR");
    await update((snap) => {
      const item = snap.appointments.find((entry) => entry.id === id);
      if (!item) throw new Error("Marcação não encontrada.");
      if (item.orderId && snap.orders.some((order) => order.id === item.orderId)) throw new Error("Esta marcação já tem obra.");
      if (!item.clientId || !item.vehicleId) throw new Error("Indica o cliente e a viatura antes de abrir a obra.");
      const created: Order = {
        id: uid(),
        number: reservedOrder ?? nextNumber(snap, "OR"),
        clientId: item.clientId,
        vehicleId: item.vehicleId,
        dateIn: dateOnly(lisbonParts().iso).toISOString(),
        dateOut: null,
        km: snap.vehicles.find((vehicle) => vehicle.id === item.vehicleId)?.km ?? 0,
        problem: item.title,
        status: "aberta",
        notes: item.notes,
        approval: "aguarda",
        approvalAt: null,
        invoiceNumber: null,
        invoiceProvider: null,
        invoiceIssuedAt: null,
        invoiceSimulated: false,
        paymentMethod: null,
        paidAt: null,
        quoteId: null,
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      snap.orders.push(created);
      item.orderId = created.id;
      item.updatedAt = stamp();
      orderId = created.id;
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível abrir a obra." };
  }
  return { ok: true as const, id: orderId };
}

export async function markOrderPaidRecord(orderId: string) {
  try {
    await update((snap) => {
      const order = snap.orders.find((item) => item.id === orderId);
      if (!order || !order.invoiceNumber) throw new Error("Só podes registar o pagamento de uma obra faturada.");
      order.paidAt = new Date().toISOString();
      order.updatedAt = stamp();
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível registar o pagamento." };
  }
  return { ok: true as const };
}

export async function deleteAppointmentRecord(id: string) {
  await update((snap) => {
    snap.appointments = snap.appointments.filter((item) => item.id !== id);
  });
  return { ok: true as const };
}

export function clientById(snap: Snapshot, id: string) {
  return snap.clients.find((client) => client.id === id) ?? null;
}

export function vehicleById(snap: Snapshot, id: string) {
  return snap.vehicles.find((vehicle) => vehicle.id === id) ?? null;
}

function attachLines(snap: Snapshot, parent: "order" | "quote", id: string) {
  return snap.lines
    .filter((line) => (parent === "order" ? line.orderId === id : line.quoteId === id))
    .sort((a, b) => a.position - b.position)
    .map((line) => ({
      ...line,
      article: line.articleId ? snap.articles.find((article) => article.id === line.articleId) ?? null : null,
    }));
}

export function hydrateOrder(snap: Snapshot, id: string) {
  const order = snap.orders.find((item) => item.id === id);
  if (!order) return null;
  const client = order.clientId ? clientById(snap, order.clientId) : null;
  const vehicle = order.vehicleId ? vehicleById(snap, order.vehicleId) : null;
  return { ...order, client, vehicle, lines: attachLines(snap, "order", id) };
}

export function hydrateQuote(snap: Snapshot, id: string) {
  const quote = snap.quotes.find((item) => item.id === id);
  if (!quote) return null;
  const client = clientById(snap, quote.clientId);
  const vehicle = vehicleById(snap, quote.vehicleId);
  if (!client || !vehicle) return null;
  const order = snap.orders.find((item) => item.quoteId === quote.id) ?? null;
  return { ...quote, client, vehicle, lines: attachLines(snap, "quote", id), order };
}

async function buildDemo(): Promise<Snapshot> {
  const nif = (base: string) => nifCheckDigit(base);
  const stampAt = "2026-11-01T12:00:00.000Z";
  const workshop: Workshop = {
    id: "default",
    legalName: "Hyperion Car Lab, Lda",
    tradeName: "Hyperion Car Lab",
    nif: nif("51483729"),
    address: "Rua do Comércio, 128",
    postalCode: "4400-123",
    city: "Vila Nova de Gaia",
    phone: "223 194 870",
    email: "oficina@hyperioncarlab.pt",
    labourRate: 45,
  };
  const clients: Client[] = [
    ["c-ana", "Ana Martins", nif("24517839"), "913 441 208", "ana.martins@email.pt", "Rua de Cedofeita, 88, 4050-180 Porto", ""],
    ["c-rui", "Rui Carvalho", nif("19843267"), "934 220 118", "rui.carvalho@email.pt", "Avenida da República, 410, 4430-190 Vila Nova de Gaia", ""],
    ["c-helena", "Helena Costa", nif("22319045"), "962 775 014", "helena.costa@email.pt", "Rua de Santa Catarina, 512, 4000-442 Porto", ""],
    ["c-silva", "Transportes Silva, Lda", nif("51490218"), "225 098 441", "frota@transportesilva.pt", "Rua da Indústria, 40, 4470-553 Maia", "Faturação para a sede. Contacto de oficina: Sr. Paulo."],
    ["c-joao", "João Pereira", nif("17654028"), "918 663 902", "joao.pereira@email.pt", "Rua do Bonfim, 23, 4300-066 Porto", ""],
    ["c-marta", "Marta Lopes", nif("25190834"), "927 114 663", "marta.lopes@email.pt", "Travessa da Areosa, 7, 4405-560 Vila Nova de Gaia", ""],
    ["c-final", CONSUMIDOR_FINAL.name, CONSUMIDOR_FINAL.nif, "", "", "", ""],
  ].map(([id, name, nifValue, phone, email, address, notes]) => ({
    id, name, nif: nifValue, phone, email, address, postalCode: "", city: "", notes, createdAt: stampAt, updatedAt: stampAt,
  }));
  const vehicles: Vehicle[] = ([
    ["v-208", "AB-19-CK", "Peugeot", "208", 2020, "VF3CCHMZ6LS123456", 62340, "Gasolina", "c-ana"],
    ["v-golf", "CD-47-MH", "Volkswagen", "Golf", 2018, "WVWZZZAUZJW123456", 148230, "Gasóleo", "c-rui"],
    ["v-a", "DH-22-RL", "Mercedes-Benz", "Classe A", 2022, "WDD1760421J123456", 41280, "Gasolina", "c-helena"],
    ["v-master", "EK-08-PT", "Renault", "Master", 2021, "VF1MA000X61234567", 180200, "Gasóleo", "c-silva"],
    ["v-bmw", "FN-63-VX", "BMW", "320d", 2016, "WBA8E5104G1234567", 186400, "Gasóleo", "c-joao"],
    ["v-yaris", "GT-15-QB", "Toyota", "Yaris Hybrid", 2023, "SB1K93BE00E123456", 28450, "Híbrido", "c-marta"],
  ] as const).map(([id, plate, brand, model, year, vin, km, fuel, clientId]) => ({
    id, plate, brand, model, version: "", engine: "", engineCode: "", oil: "", nextInspection: "", nextService: "", year, vin, km, fuel, clientId, createdAt: stampAt, updatedAt: stampAt,
  }));
  vehicles.forEach((vehicle) => {
    if (!isValidPlate(vehicle.plate) || !isValidVin(vehicle.vin)) throw new Error(vehicle.plate);
  });
  const displacements: Record<string, string> = {
    "v-208": "1199 cc",
    "v-golf": "1598 cc",
    "v-a": "1332 cc",
    "v-master": "2299 cc",
    "v-bmw": "1995 cc",
    "v-yaris": "1490 cc",
  };
  for (const vehicle of vehicles) vehicle.version = displacements[vehicle.id] ?? vehicle.version;
  const suppliers: Supplier[] = [
    ["s-delta", "AutoDelta Peças, Lda", nif("50933127"), "225 301 440", "encomendas@autodelta.pt", "Rua do Engenho, 90, 4300-215 Porto"],
    ["s-lubri", "LubriNorte, Lda", nif("50881246"), "223 770 215", "vendas@lubrinorte.pt", "Zona Industrial de Canelas, 4410-125 Vila Nova de Gaia"],
    ["s-travo", "Travomais, Lda", nif("51544019"), "229 418 660", "pedidos@travomais.pt", "Rua da Circunvalação, 2140, 4450-206 Matosinhos"],
  ].map(([id, name, nifValue, phone, email, address]) => ({
    id, name, nif: nifValue, phone, email, address, notes: "", createdAt: stampAt, updatedAt: stampAt,
  }));

  const snap: Snapshot = {
    workshop,
    clients,
    vehicles,
    articles: [],
    suppliers,
    orders: [],
    quotes: [],
    lines: [],
    purchases: [],
    purchaseLines: [],
    appointments: [],
    invoiceLogs: [],
  };

  const purchaseLine = (
    supplierId: string,
    date: string,
    invoiceNumber: string,
    ref: string,
    description: string,
    quantity: number,
    cost: number,
    margin: number,
    family: string,
  ): PurchaseInput => ({
    date, supplierId, documentType: "Fatura", invoiceNumber, paymentMethod: "Transferência", ref, description, quantity, cost, vat: 23, margin, family, isOil: family === "Óleo",
  });

  applyPurchases(snap, [
    purchaseLine("s-delta", "2026-10-18", "AD-2026/441", "FLT-AR-208", "FILTRO DE AR PEUGEOT 208", 6, 8.4, 40, "Filtros"),
    purchaseLine("s-delta", "2026-10-18", "AD-2026/441", "FLT-OL-GOLF", "FILTRO DE ÓLEO VW GOLF", 4, 6.1, 40, "Filtros"),
    purchaseLine("s-delta", "2026-10-18", "AD-2026/441", "FLT-OL-MB", "FILTRO DE ÓLEO MERCEDES CLASSE A", 3, 7.5, 40, "Filtros"),
    purchaseLine("s-delta", "2026-10-18", "AD-2026/441", "FLT-HAB-001", "FILTRO DE HABITÁCULO", 1, 7.2, 40, "Filtros"),
    purchaseLine("s-delta", "2026-10-18", "AD-2026/441", "VEL-NGK", "VELA DE IGNIÇÃO NGK", 12, 8.75, 40, "Ignição"),
    purchaseLine("s-delta", "2026-10-18", "AD-2026/441", "COR-DST", "KIT CORREIA DE DISTRIBUIÇÃO", 1, 62, 40, "Produto"),
    purchaseLine("s-delta", "2026-10-18", "AD-2026/441", "LIQ-DOT4", "LÍQUIDO DE TRAVÕES DOT4 (L)", 8, 4.9, 40, "Produto"),
    purchaseLine("s-lubri", "2026-09-02", "LN-880", "OLEO-5W30", "ÓLEO MOTOR 5W30 (L)", 10, 6.5, 30, "Óleo"),
    purchaseLine("s-lubri", "2026-09-02", "LN-880", "ECOLUB", "ECO TAXA LUBRIFICANTES", 10, 0.09, 0, "Eco Taxa"),
    purchaseLine("s-lubri", "2026-10-28", "LN-1092", "OLEO-5W30", "ÓLEO MOTOR 5W30 (L)", 22, 6.8, 30, "Óleo"),
    purchaseLine("s-lubri", "2026-10-28", "LN-1092", "ECOLUB", "ECO TAXA LUBRIFICANTES", 22, 0.09, 0, "Eco Taxa"),
    purchaseLine("s-lubri", "2026-10-28", "LN-1092", "OLEO-5W40", "ÓLEO MOTOR 5W40 (L)", 3, 7.1, 30, "Óleo"),
    purchaseLine("s-lubri", "2026-10-28", "LN-1092", "ECOLUB", "ECO TAXA LUBRIFICANTES", 3, 0.09, 0, "Eco Taxa"),
    purchaseLine("s-travo", "2026-09-15", "TM-090", "PST-DIANT", "PASTILHAS DE TRAVÃO DIANTEIRAS", 6, 21, 40, "Travões"),
    purchaseLine("s-travo", "2026-11-03", "TM-778", "PST-DIANT", "PASTILHAS DE TRAVÃO DIANTEIRAS", 4, 22.5, 40, "Travões"),
    purchaseLine("s-travo", "2026-11-03", "TM-778", "DSC-DIANT", "DISCOS DE TRAVÃO DIANTEIROS (PAR)", 2, 48, 40, "Travões"),
    { ...purchaseLine("s-travo", "2026-11-06", "NC-14", "PST-DIANT", "PASTILHAS DE TRAVÃO DIANTEIRAS", 1, 22.5, 40, "Travões"), documentType: "Nota de crédito" },
  ]);

  const byRef = new Map(snap.articles.map((article) => [article.ref, article]));
  const part = (ref: string, quantity: number): IncomingLine => {
    const article = byRef.get(ref);
    if (!article) throw new Error(ref);
    return {
      kind: "peca",
      description: article.description,
      quantity,
      unitPrice: salePrice(article.costPrice, article.marginPercent),
      unitCost: article.costPrice,
      vatRate: article.vatRate,
      articleId: article.id,
    };
  };
  const labour = (description: string, hours: number): IncomingLine => ({
    kind: "mao_de_obra",
    description,
    quantity: hours,
    unitPrice: workshop.labourRate,
    unitCost: 0,
    vatRate: 23,
    articleId: null,
  });

  const addOrder = (order: Omit<Order, "createdAt" | "updatedAt" | "invoiceNumber" | "invoiceProvider" | "invoiceIssuedAt" | "invoiceSimulated">, lines: IncomingLine[]) => {
    snap.orders.push({
      ...order,
      invoiceNumber: null,
      invoiceProvider: null,
      invoiceIssuedAt: null,
      invoiceSimulated: false,
      invoiceUrl: null,
      paymentMethod: null,
      quoteNumber: null,
      quoteUrl: null,
      createdAt: stampAt,
      updatedAt: stampAt,
    });
    pushLines(snap, { orderId: order.id }, lines);
  };
  const addQuote = (quote: Omit<Quote, "createdAt" | "updatedAt">, lines: IncomingLine[]) => {
    snap.quotes.push({ ...quote, createdAt: stampAt, updatedAt: stampAt });
    pushLines(snap, { quoteId: quote.id }, lines);
  };

  const helenaLines = [
    labour("Revisão programada e inspeção de níveis", 1.5),
    part("OLEO-5W30", 4.5),
    part("FLT-OL-MB", 1),
    part("ECOLUB", 4.5),
  ];
  addQuote({
    id: "q-helena",
    number: "ORC-2026-0001",
    clientId: "c-helena",
    vehicleId: "v-a",
    date: dateOnly("2026-10-30").toISOString(),
    validUntil: dateOnly("2026-11-15").toISOString(),
    km: 41200,
    problem: "Revisão dos 40 000 km, com substituição de óleo e filtro.",
    status: "convertido",
    notes: "",
  }, helenaLines);
  addOrder({
    id: "o-helena",
    number: "OR-2026-0002",
    clientId: "c-helena",
    vehicleId: "v-a",
    dateIn: dateOnly("2026-11-02").toISOString(),
    dateOut: dateOnly("2026-11-03").toISOString(),
    km: 41280,
    problem: "Revisão dos 40 000 km. Cliente pede também verificação dos travões.",
    status: "concluida",
    notes: "",
    quoteId: "q-helena",
  }, helenaLines);
  addOrder({
    id: "o-rui",
    number: "OR-2026-0001",
    clientId: "c-rui",
    vehicleId: "v-golf",
    dateIn: dateOnly("2026-10-28").toISOString(),
    dateOut: dateOnly("2026-10-29").toISOString(),
    km: 148230,
    problem: "Revisão periódica. Cliente indica um consumo de óleo ligeiro.",
    status: "concluida",
    notes: "",
    quoteId: null,
  }, [
    labour("Revisão periódica e reposição de níveis", 2),
    part("OLEO-5W30", 5),
    part("FLT-OL-GOLF", 1),
    part("ECOLUB", 5),
  ]);
  addOrder({
    id: "o-joao",
    number: "OR-2026-0003",
    clientId: "c-joao",
    vehicleId: "v-bmw",
    dateIn: dateOnly("2026-11-03").toISOString(),
    dateOut: dateOnly("2026-11-04").toISOString(),
    km: 186400,
    problem: "Chiar nos travões dianteiros e volante a vibrar em travagem.",
    status: "concluida",
    notes: "",
    quoteId: null,
  }, [labour("Substituir pastilhas dianteiras e limpar pinças", 1.2), part("PST-DIANT", 1)]);
  addOrder({
    id: "o-ana",
    number: "OR-2026-0004",
    clientId: "c-ana",
    vehicleId: "v-208",
    dateIn: dateOnly("2026-11-04").toISOString(),
    dateOut: dateOnly("2026-11-05").toISOString(),
    km: 62340,
    problem: "Travagem fraca e vibração no pedal. Pedir orçamento já aceite pelo telefone.",
    status: "concluida",
    notes: "Cliente levanta a viatura hoje ao fim da tarde.",
    quoteId: null,
  }, [
    labour("Substituir discos e pastilhas dianteiros", 2),
    part("PST-DIANT", 1),
    part("DSC-DIANT", 1),
  ]);
  addOrder({
    id: "o-master",
    number: "OR-2026-0005",
    clientId: "c-silva",
    vehicleId: "v-master",
    dateIn: dateOnly("2026-11-05").toISOString(),
    dateOut: null,
    km: 180200,
    problem: "Substituição do kit de distribuição aos 180 000 km. Viatura de frota, sem viatura de substituição.",
    status: "em_curso",
    notes: "",
    quoteId: null,
  }, [labour("Substituir kit de distribuição e bomba de água", 4), part("COR-DST", 1)]);
  addOrder({
    id: "o-marta",
    number: "OR-2026-0006",
    clientId: "c-marta",
    vehicleId: "v-yaris",
    dateIn: dateOnly("2026-11-05").toISOString(),
    dateOut: null,
    km: 28450,
    problem: "Barulho na suspensão dianteira ao passar lombas.",
    status: "aberta",
    notes: "",
    quoteId: null,
  }, [labour("Diagnóstico de suspensão dianteira", 0.5)]);
  addQuote({
    id: "q-marta",
    number: "ORC-2026-0002",
    clientId: "c-marta",
    vehicleId: "v-yaris",
    date: dateOnly("2026-11-04").toISOString(),
    validUntil: dateOnly("2026-11-19").toISOString(),
    km: 28450,
    problem: "Substituição do braço de suspensão dianteiro esquerdo e alinhamento.",
    status: "aberto",
    notes: "Peças ainda não encomendadas. Aguarda aceitação da cliente.",
  }, [
    labour("Substituir braço de suspensão e alinhar a direção", 2.2),
    { kind: "peca", description: "BRAÇO DE SUSPENSÃO DIANTEIRO ESQUERDO", quantity: 1, unitPrice: 95, unitCost: 62, vatRate: 23, articleId: null },
    { kind: "peca", description: "BUCHA DO BRAÇO", quantity: 2, unitPrice: 14, unitCost: 8, vatRate: 23, articleId: null },
  ]);

  await invoiceInto(snap, "o-rui", 1, new Date("2026-10-29T16:30:00.000Z"));
  await invoiceInto(snap, "o-helena", 2, new Date("2026-11-03T17:10:00.000Z"));
  await invoiceInto(snap, "o-joao", 3, new Date("2026-11-04T18:00:00.000Z"));

  const slot = (date: string, time: string, minutes: number, clientId: string, vehicleId: string, title: string, notes: string): Appointment => {
    const startsAt = zonedDateTime(date, time);
    return {
      id: uid(),
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + minutes * 60 * 1000).toISOString(),
      clientId,
      vehicleId,
      title,
      notes,
      createdAt: stampAt,
      updatedAt: stampAt,
    };
  };
  for (const line of snap.lines) {
    if (!line.orderId || !line.articleId || line.kind === "mao_de_obra") continue;
    const article = snap.articles.find((item) => item.id === line.articleId);
    if (!article) continue;
    article.stockQty = round2(article.stockQty - line.quantity);
  }

  snap.appointments = [
    slot("2026-11-05", "08:30", 90, "c-silva", "v-master", "Distribuição da Renault Master", "Viatura já na oficina."),
    slot("2026-11-05", "15:00", 60, "c-marta", "v-yaris", "Diagnóstico de suspensão", "Vem sem marcação de peças."),
    slot("2026-11-05", "17:30", 30, "c-ana", "v-208", "Entrega do Peugeot 208", "Travões concluídos."),
    slot("2026-11-06", "10:00", 60, "c-rui", "v-golf", "Troca de pneus", "Cliente traz os pneus."),
    slot("2026-11-07", "11:30", 45, "c-helena", "v-a", "Alinhamento de direção", ""),
    slot("2026-11-10", "09:00", 120, "c-joao", "v-bmw", "Revisão de inverno", "Ver luzes e bateria."),
  ];
  return snap;
}

function applyPurchases(snap: Snapshot, lines: PurchaseInput[]) {
  const groups = new Map<string, PurchaseInput[]>();
  for (const line of lines) {
    const key = [line.date, line.supplierId, line.invoiceNumber].join("|");
    const bucket = groups.get(key) ?? [];
    bucket.push(line);
    groups.set(key, bucket);
  }
  for (const group of groups.values()) {
    const head = group[0];
    const purchase: Purchase = {
      id: uid(),
      date: dateOnly(head.date).toISOString(),
      supplierId: head.supplierId,
      documentType: head.documentType,
      invoiceNumber: head.invoiceNumber,
      paymentMethod: head.paymentMethod,
      voided: false,
      voidedAt: null,
      createdAt: nowIso(),
    };
    snap.purchases.push(purchase);
    group.forEach((line, position) => {
      const ref = normalizeRef(line.ref);
      const description = normalizeArticleDescription(line.description);
      const oil = Boolean(line.isOil) || isOilArticle({ family: line.family, ref });
      let article = snap.articles.find((item) => item.ref === ref);
      if (!article) {
        article = {
          id: uid(),
          ref,
          description,
          family: line.family || (oil ? "Óleo" : "Produto"),
          costPrice: 0,
          lastCost: null,
          marginPercent: line.margin,
          vatRate: line.vat,
          stockQty: 0,
          minStock: defaultMinStock({ family: line.family, ref, isOil: oil }),
          isOil: oil,
          active: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        snap.articles.push(article);
      }
      const delta = stockDelta(line.documentType, line.quantity);
      const stockBefore = article.stockQty;
      const costBefore = article.costPrice;
      article.stockQty = round2(stockBefore + delta);
      article.costPrice = delta > 0 ? nextCost(Math.max(stockBefore, 0), costBefore, delta, line.cost) : costBefore;
      article.marginPercent = line.margin;
      article.vatRate = line.vat;
      snap.purchaseLines.push({
        id: uid(),
        purchaseId: purchase.id,
        articleId: article.id,
        tipologia: line.tipologia || "produto",
        ref,
        description,
        quantity: line.quantity,
        cost: line.cost,
        vatRate: line.vat,
        margin: line.margin,
        position,
        stockBefore,
        costBefore,
      });
    });
  }
}

async function invoiceInto(snap: Snapshot, orderId: string, sequence: number, issuedAt: Date) {
  const bundle = orderBundle(snap, orderId);
  if (!bundle) throw new Error(orderId);
  const draft = buildInvoiceDraft({
    order: {
      id: bundle.order.id,
      number: bundle.order.number,
      km: bundle.order.km,
      problem: bundle.order.problem,
      notes: bundle.order.notes,
      client: bundle.client,
      vehicle: bundle.vehicle,
      lines: bundle.lines,
    },
    workshop: snap.workshop,
    sequence,
    year: 2026,
    issuedAt,
  });
  const issued = await mockMoloniAdapter.issue(draft);
  bundle.order.status = "faturada";
  bundle.order.invoiceNumber = issued.documentNumber;
  bundle.order.invoiceProvider = issued.providerLabel;
  bundle.order.invoiceIssuedAt = issuedAt.toISOString();
  bundle.order.invoiceSimulated = true;
  snap.invoiceLogs.push({
    id: uid(),
    orderId,
    providerId: issued.providerId,
    providerLabel: issued.providerLabel,
    simulated: true,
    documentNumber: issued.documentNumber,
    requestJson: JSON.stringify(draft),
    responseJson: JSON.stringify(issued),
    createdAt: issuedAt.toISOString(),
  });
}

void normalizePlate;
void normalizeNif;
void defaultMargin;
