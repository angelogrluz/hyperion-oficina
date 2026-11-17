import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { StockLink } from "@/lib/stock-entry";

const env = import.meta.env as ImportMetaEnv & { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string };
export const SUPABASE_URL = env.VITE_SUPABASE_URL || "https://jltzehisxmxywhxmdxmt.supabase.co";
// Public publishable key. Env still overrides when a non-empty value is set.
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || "sb_publishable_sh6X9towv0X7joZPYNpZhw_X1NZ5Tko";

export type CloudRole = "owner" | "admin" | "tecnico";
export type CompanyStatus = "pending" | "active" | "suspended";
export type CloudUser = {
  userId: string;
  email: string;
  role: CloudRole | null;
  companyId: string | null;
  companyName: string;
  companyStatus: CompanyStatus | null;
  platformAdmin: boolean;
};

const listeners = new Set<() => void>();
let client: SupabaseClient | null = null;
let current: CloudUser | null = null;
let applyingRemote = false;

export function cloudConfigured() {
  return Boolean(SUPABASE_ANON_KEY);
}

export function subscribeCloud(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

export function readCloudUser() {
  return current;
}

export function supabase(): SupabaseClient | null {
  if (!cloudConfigured()) return null;
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

async function loadMembership(session: Session) {
  const db = supabase();
  if (!db) return null;
  const rpc = await db.rpc("my_account");
  if (!rpc.error && Array.isArray(rpc.data)) {
    const row = rpc.data[0] as { company_id: string | null; company_name: string | null; role: CloudRole | null; status: CompanyStatus | null; platform_admin: boolean } | undefined;
    if (!row || (!row.company_id && !row.platform_admin)) return null;
    return {
      userId: session.user.id,
      email: session.user.email ?? "",
      role: row.role,
      companyId: row.company_id,
      companyName: row.company_name ?? "Oficina",
      companyStatus: row.status,
      platformAdmin: Boolean(row.platform_admin),
    } satisfies CloudUser;
  }
  const { data, error } = await db.from("memberships").select("role, company_id, companies(name)").eq("user_id", session.user.id).limit(1);
  if (error || !data?.length) return null;
  const row = data[0] as { role: CloudRole; company_id: string; companies: { name: string } | { name: string }[] | null };
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: row.role,
    companyId: row.company_id,
    companyName: company?.name ?? "Oficina",
    companyStatus: "active",
    platformAdmin: false,
  } satisfies CloudUser;
}

let booted = false;

export async function bootCloud() {
  const db = supabase();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  current = data.session ? await loadMembership(data.session) : null;
  if (!booted) {
    booted = true;
    db.auth.onAuthStateChange((_event, session) => {
    void (async () => {
      current = session ? await loadMembership(session) : null;
      emit();
    })();
    });
  }
  emit();
  return current;
}

export async function signIn(email: string, password: string) {
  const db = supabase();
  if (!db) return { error: "O servidor ainda não está configurado." };
  const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.session) return { error: "E-mail ou palavra-passe incorretos." };
  current = await loadMembership(data.session);
  emit();
  if (!current) return { error: "A conta entrou, mas ainda não tem oficina. Tenta outra vez daqui a um momento." };
  return { user: current };
}

export async function signUp(email: string, password: string, companyName: string) {
  const db = supabase();
  if (!db) return { error: "O servidor ainda não está configurado." };
  const { data, error } = await db.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { company_name: companyName.trim() || "A minha oficina" } },
  });
  if (error) return { error: error.message };
  if (!data.session) return { error: "Conta criada. Confirma o e-mail se o projeto o exigir, e entra a seguir." };
  current = await loadMembership(data.session);
  emit();
  return { user: current };
}

export async function signOut() {
  await supabase()?.auth.signOut();
  current = null;
  emit();
}

export async function assignDocumentNumber(series: "OR" | "ORC" | "ORCDOC" | "FT") {
  const db = supabase();
  if (!db || !current) throw new Error("Sessão em falta.");
  const { data, error } = await db.rpc("assign_document_number", { p_series: series });
  if (error || typeof data !== "string") throw new Error(error?.message || "Não foi possível numerar o documento.");
  return data;
}

const SETTING_KEYS = {
  company: "hyperion-oficina-empresa",
  prices: "hyperion-oficina-precos",
  users: "hyperion-oficina-utilizadores",
  permissions: "hyperion-oficina-permissoes",
  billing: "hyperion-oficina-faturacao",
  plateLookup: "hyperion-oficina-matricula",
  serviceTypes: "hyperion-oficina-tipos-servico",
  internalServices: "hyperion-oficina-servicos-internos",
  ecolub: "hyperion-oficina-ecolub-rate",
  assignments: "hyperion-oficina-tecnicos",
  workLogs: "hyperion-oficina-tempos",
  punches: "hyperion-oficina-pontos",
  symptoms: "hyperion-oficina-sintomas",
} as const;

function readJson(key: string) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

export function collectSettings() {
  return {
    company: readJson(SETTING_KEYS.company) ?? {},
    prices: readJson(SETTING_KEYS.prices) ?? {},
    users: readJson(SETTING_KEYS.users) ?? [],
    permissions: readJson(SETTING_KEYS.permissions) ?? {},
    billing: readJson(SETTING_KEYS.billing) ?? {},
    plateLookup: readJson(SETTING_KEYS.plateLookup) ?? {},
    serviceTypes: readJson(SETTING_KEYS.serviceTypes) ?? [],
    internalServices: readJson(SETTING_KEYS.internalServices) ?? [],
    ecolub: localStorage.getItem(SETTING_KEYS.ecolub),
    assignments: readJson(SETTING_KEYS.assignments) ?? [],
    workLogs: readJson(SETTING_KEYS.workLogs) ?? [],
    punches: readJson(SETTING_KEYS.punches) ?? [],
    symptoms: readJson(SETTING_KEYS.symptoms) ?? {},
  };
}

function writeRaw(key: string, value: unknown) {
  if (value == null) return;
  localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
}

export function applyRemoteSettings(row: Record<string, unknown> | null) {
  if (!row) return;
  applyingRemote = true;
  try {
    writeRaw(SETTING_KEYS.company, row.company);
    writeRaw(SETTING_KEYS.prices, row.prices);
    writeRaw(SETTING_KEYS.users, row.users);
    writeRaw(SETTING_KEYS.permissions, row.permissions);
    writeRaw(SETTING_KEYS.billing, row.billing);
    writeRaw(SETTING_KEYS.plateLookup, row.plate_lookup);
    writeRaw(SETTING_KEYS.serviceTypes, row.service_types);
    writeRaw(SETTING_KEYS.internalServices, row.internal_services);
    if (typeof row.ecolub === "string") localStorage.setItem(SETTING_KEYS.ecolub, row.ecolub);
    writeRaw(SETTING_KEYS.assignments, row.assignments);
    writeRaw(SETTING_KEYS.workLogs, row.work_logs);
    writeRaw(SETTING_KEYS.punches, row.punches);
    writeRaw(SETTING_KEYS.symptoms, row.symptoms);
  } finally {
    applyingRemote = false;
  }
  window.dispatchEvent(new Event("oficinaplan-settings"));
}

export function cloudActive() {
  return cloudConfigured() && current != null;
}

let pushTimer = 0;
export function afterLocalWrite() {
  if (applyingRemote || !cloudActive()) return;
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => { void pushSettingsOnly(); }, 400);
}

async function pushSettingsOnly() {
  const db = supabase();
  if (!db || !current) return;
  const settings = collectSettings();
  const { error } = await db.rpc("save_company_settings", { settings: settings as never });
  if (error) console.error(error.message);
}

export async function saveCompanyState(payload: Record<string, unknown>) {
  const db = supabase();
  if (!db || !current) return;
  const body = { ...payload, settings: collectSettings() };
  const { error } = await db.rpc("save_company_state", { payload: body as never });
  if (error) throw new Error(error.message);
}

type Row = Record<string, unknown>;

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function loadCompanyState() {
  const db = supabase();
  if (!db || !current) return null;
  const cid = current.companyId;
  const [clients, vehicles, articles, suppliers, orders, quotes, lines, purchases, purchaseLines, appointments, invoiceLogs, settings] = await Promise.all([
    db.from("clients").select("*").eq("company_id", cid),
    db.from("vehicles").select("*").eq("company_id", cid),
    db.from("articles").select("*").eq("company_id", cid),
    db.from("suppliers").select("*").eq("company_id", cid),
    db.from("orders").select("*").eq("company_id", cid),
    db.from("quotes").select("*").eq("company_id", cid),
    db.from("doc_lines").select("*").eq("company_id", cid),
    db.from("purchases").select("*").eq("company_id", cid),
    db.from("purchase_lines").select("*").eq("company_id", cid),
    db.from("appointments").select("*").eq("company_id", cid),
    db.from("invoice_logs").select("*").eq("company_id", cid),
    db.from("company_settings").select("*").eq("company_id", cid).maybeSingle(),
  ]);
  const failed = [clients, vehicles, articles, suppliers, orders, quotes, lines, purchases, purchaseLines, appointments, invoiceLogs, settings].find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
  if (settings.data) applyRemoteSettings(settings.data as Row);
  return {
    clients: ((clients.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), name: String(row.name ?? ""), nif: String(row.nif ?? ""), phone: String(row.phone ?? ""), email: String(row.email ?? ""),
      address: String(row.address ?? ""), postalCode: String(row.postal_code ?? ""), city: String(row.city ?? ""), notes: String(row.notes ?? ""),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    })),
    vehicles: ((vehicles.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), clientId: (row.client_id as string | null) ?? null, plate: String(row.plate ?? ""), brand: String(row.brand ?? ""), model: String(row.model ?? ""),
      version: String(row.version ?? ""), year: num(row.year, new Date().getFullYear()), vin: String(row.vin ?? ""), engine: String(row.engine ?? ""),
      engineCode: String(row.engine_code ?? ""), oil: String(row.oil ?? ""), nextInspection: String(row.next_inspection ?? ""), nextService: String(row.next_service ?? ""),
      km: num(row.km), fuel: String(row.fuel ?? ""), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    })),
    articles: ((articles.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), ref: String(row.ref ?? ""), description: String(row.description ?? ""), family: String(row.family ?? ""),
      costPrice: num(row.cost_price), lastCost: row.last_cost == null ? null : num(row.last_cost), marginPercent: num(row.margin_percent), vatRate: num(row.vat_rate, 23),
      stockQty: num(row.stock_qty), minStock: num(row.min_stock), isOil: Boolean(row.is_oil), active: row.active !== false,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    })),
    suppliers: ((suppliers.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), name: String(row.name ?? ""), nif: String(row.nif ?? ""), phone: String(row.phone ?? ""), email: String(row.email ?? ""),
      address: String(row.address ?? ""), notes: String(row.notes ?? ""), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    })),
    orders: ((orders.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), number: String(row.number ?? ""), clientId: (row.client_id as string | null) ?? null, vehicleId: (row.vehicle_id as string | null) ?? null,
      dateIn: String(row.date_in), dateOut: (row.date_out as string | null) ?? null, km: num(row.km), kmOut: row.km_out == null ? null : num(row.km_out),
      problem: String(row.problem ?? ""), status: String(row.status ?? "aberta"), approval: String(row.approval ?? "aguarda"), approvalAt: (row.approval_at as string | null) ?? null,
      notes: String(row.notes ?? ""), invoiceNumber: (row.invoice_number as string | null) ?? null, invoiceProvider: (row.invoice_provider as string | null) ?? null,
      invoiceIssuedAt: (row.invoice_issued_at as string | null) ?? null, invoiceSimulated: Boolean(row.invoice_simulated), invoiceUrl: (row.invoice_url as string | null) ?? null,
      paymentMethod: (row.payment_method as string | null) ?? null, paidAt: (row.paid_at as string | null) ?? null, quoteNumber: (row.quote_number as string | null) ?? null,
      quoteUrl: (row.quote_url as string | null) ?? null, quoteId: (row.quote_id as string | null) ?? null, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    })),
    quotes: ((quotes.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), number: String(row.number ?? ""), clientId: String(row.client_id ?? ""), vehicleId: String(row.vehicle_id ?? ""),
      date: String(row.date), validUntil: (row.valid_until as string | null) ?? null, km: num(row.km), problem: String(row.problem ?? ""),
      status: String(row.status ?? "aberto"), notes: String(row.notes ?? ""), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    })),
    lines: ((lines.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), orderId: (row.order_id as string | null) ?? null, quoteId: (row.quote_id as string | null) ?? null, kind: String(row.kind ?? "peca"),
      description: String(row.description ?? ""), quantity: num(row.quantity), unitPrice: num(row.unit_price), unitCost: num(row.unit_cost),
      discountPercent: num(row.discount_percent), vatRate: num(row.vat_rate, 23), internalNote: String(row.internal_note ?? ""),
      articleId: (row.article_id as string | null) ?? null, ref: String(row.ref ?? ""), position: num(row.position), stockEntry: (row.stock_entry as StockLink | null) ?? null,
    })),
    purchases: ((purchases.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), date: String(row.date), supplierId: String(row.supplier_id ?? ""), documentType: String(row.document_type ?? ""),
      invoiceNumber: String(row.invoice_number ?? ""), paymentMethod: String(row.payment_method ?? ""), voided: Boolean(row.voided),
      voidedAt: (row.voided_at as string | null) ?? null, createdAt: String(row.created_at),
    })),
    purchaseLines: ((purchaseLines.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), purchaseId: String(row.purchase_id ?? ""), articleId: (row.article_id as string | null) ?? null, tipologia: String(row.tipologia ?? ""),
      ref: String(row.ref ?? ""), description: String(row.description ?? ""), quantity: num(row.quantity), cost: num(row.cost), vatRate: num(row.vat_rate, 23),
      margin: num(row.margin), position: num(row.position), stockBefore: num(row.stock_before), costBefore: num(row.cost_before),
    })),
    appointments: ((appointments.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), startsAt: String(row.starts_at), endsAt: String(row.ends_at), clientId: String(row.client_id ?? ""),
      vehicleId: (row.vehicle_id as string | null) ?? null, title: String(row.title ?? ""), notes: String(row.notes ?? ""),
      orderId: (row.order_id as string | null) ?? null, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    })),
    invoiceLogs: ((invoiceLogs.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), orderId: String(row.order_id ?? ""), providerId: String(row.provider_id ?? ""), providerLabel: String(row.provider_label ?? ""),
      simulated: Boolean(row.simulated), documentNumber: String(row.document_number ?? ""),
      requestJson: typeof row.request_json === "string" ? row.request_json : JSON.stringify(row.request_json ?? {}),
      responseJson: typeof row.response_json === "string" ? row.response_json : JSON.stringify(row.response_json ?? {}),
      createdAt: String(row.created_at),
    })),
  };
}

const IMPORTED = "oficinaplan-imported";

export function importAlreadyDone() {
  return localStorage.getItem(IMPORTED) === "1";
}

export function markImported() {
  localStorage.setItem(IMPORTED, "1");
}
