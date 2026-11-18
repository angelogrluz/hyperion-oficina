import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { blankCompany } from "@/lib/company-settings";
import { CLOUD_OWNER_KEY, CLOUD_SESSION_FLAG, DEVICE_STASH_KEY } from "@/lib/cloud-session";
import { billingLabel } from "@/lib/moloni/service";
import type { StockLink } from "@/lib/stock-entry";

const env = (import.meta.env ?? {}) as ImportMetaEnv & { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string };
export const SUPABASE_URL = env.VITE_SUPABASE_URL || "https://jltzehisxmxywhxmdxmt.supabase.co";
// Public publishable key. Env still overrides when a non-empty value is set.
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || "sb_publishable_sh6X9towv0X7joZPYNpZhw_X1NZ5Tko";

export type CloudRole = "owner" | "admin" | "gestor" | "rececionista" | "mecanico" | "tecnico";
export type CompanyStatus = "pending" | "active" | "suspended";
export type CloudUser = {
  userId: string;
  email: string;
  role: CloudRole | null;
  companyId: string | null;
  companyName: string;
  slug: string | null;
  companyStatus: CompanyStatus | null;
  memberActive: boolean;
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

type AccountRow = {
  company_id: string | null;
  company_name: string | null;
  slug?: string | null;
  role: CloudRole | null;
  status: string | null;
  member_active?: boolean | null;
  platform_admin: boolean;
};

function asAccount(data: unknown): AccountRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return row as AccountRow;
}

function knownStatus(value: string | null | undefined, companyId: string | null): CompanyStatus | null {
  if (value === "active" || value === "suspended" || value === "pending") return value;
  return companyId ? "pending" : null;
}

function closedUser(session: Session, row: AccountRow | null): CloudUser {
  const companyId = row?.company_id ?? null;
  const status = knownStatus(row?.status, companyId);
  const user: CloudUser = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: row?.role ?? null,
    companyId,
    companyName: row?.company_name?.trim() || "Oficina",
    slug: row?.slug?.trim().toLowerCase() || null,
    companyStatus: status ?? "pending",
    memberActive: row?.member_active !== false,
    platformAdmin: Boolean(row?.platform_admin),
  };
  prepareCloudWorkspace(user);
  return user;
}

/** Move another company's local data aside. The open account then starts from its own blank settings. */
export function prepareCloudWorkspace(user: CloudUser) {
  if (typeof localStorage === "undefined") return;
  const id = user.companyId || user.userId;
  const name = user.companyName === "Oficina" ? "" : user.companyName;
  localStorage.setItem(CLOUD_SESSION_FLAG, "1");
  if (localStorage.getItem(CLOUD_OWNER_KEY) === id) {
    try {
      const stored = JSON.parse(localStorage.getItem("hyperion-oficina-empresa") || "null") as { legalName?: string; tradeName?: string } | null;
      if (name && !stored?.legalName?.trim() && !stored?.tradeName?.trim()) {
        localStorage.setItem("hyperion-oficina-empresa", JSON.stringify(blankCompany(name)));
      }
    } catch { /* the next read falls back to a blank company */ }
    return;
  }
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) keys.push(key);
  }
  const stash: Record<string, string> = {};
  for (const key of keys) {
    if (!key.startsWith("hyperion-oficina-")) continue;
    const value = localStorage.getItem(key);
    if (value != null) stash[key] = value;
  }
  if (Object.keys(stash).length && !localStorage.getItem(DEVICE_STASH_KEY)) {
    localStorage.setItem(DEVICE_STASH_KEY, JSON.stringify(stash));
  }
  applyingRemote = true;
  try {
    for (const key of keys) {
      if (key.startsWith("hyperion-oficina-")) localStorage.removeItem(key);
    }
    localStorage.removeItem("hcl_browser_session");
    localStorage.setItem("hyperion-oficina-empresa", JSON.stringify(blankCompany(name)));
    localStorage.setItem(CLOUD_OWNER_KEY, id);
  } finally {
    applyingRemote = false;
  }
}

export function readDeviceStash(): Record<string, string> | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(DEVICE_STASH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function loadMembership(session: Session) {
  const db = supabase();
  if (!db) return null;
  await db.rpc("claim_staff_invites");
  const rpc = await db.rpc("my_account");
  const row = rpc.error ? null : asAccount(rpc.data);
  if (rpc.error || !row || (!row.company_id && !row.platform_admin)) {
    return closedUser(session, row);
  }
  return closedUser(session, row);
}

let booted = false;

export async function bootCloud() {
  const db = supabase();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  current = data.session ? await loadMembership(data.session) : null;
  await ensureRemoteIdentity(current);
  if (!booted) {
    booted = true;
    db.auth.onAuthStateChange((_event, session) => {
    void (async () => {
      current = session ? await loadMembership(session) : null;
      await ensureRemoteIdentity(current);
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
  await ensureRemoteIdentity(current);
  emit();
  if (!current) return { error: "A conta entrou, mas ainda não tem oficina. Tenta outra vez daqui a um momento." };
  return { user: current };
}

export async function signUp(email: string, password: string, companyName: string, ownerName = "", slug = "") {
  const db = supabase();
  if (!db) return { error: "O servidor ainda não está configurado." };
  const { data, error } = await db.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { company_name: companyName.trim() || "A minha oficina", company_slug: slug.trim().toLowerCase(), full_name: ownerName.trim() } },
  });
  if (error) return { error: error.message };
  if (!data.session) return { error: "Conta criada. Confirma o e-mail se o projeto o exigir, e entra a seguir." };
  current = await loadMembership(data.session);
  await ensureRemoteIdentity(current);
  emit();
  return { user: current };
}

export async function resetPassword(email: string, nextPath = "/entrar") {
  const db = supabase();
  if (!db) return { error: "O servidor ainda não está configurado." };
  const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${nextPath.startsWith("/") ? nextPath : `/${nextPath}`}` });
  if (error) return { error: "Não foi possível enviar o e-mail. Confirma o endereço." };
  return { error: "" };
}

export async function resolveCompanyPublic(slug: string) {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.rpc("resolve_company_public", { p_slug: slug });
  if (error || !data || typeof data !== "object") return null;
  const row = data as { slug?: string; name?: string; logo?: string | null };
  if (!row.slug) return null;
  return { slug: row.slug, name: row.name || slug, logo: row.logo || null };
}

export async function setCompanySlug(slug: string) {
  const db = supabase();
  if (!db) return { error: "O servidor ainda não está configurado." };
  const { data, error } = await db.rpc("set_company_slug", { p_slug: slug });
  if (error) return { error: error.message.includes("já está") ? "Este endereço já está a ser usado." : "Não foi possível guardar o endereço." };
  if (current) current = { ...current, slug: String(data || slug).toLowerCase() };
  emit();
  return { slug: String(data || slug) };
}

export async function inviteStaff(input: { email: string; role: string; name: string; companyId: string }) {
  const db = supabase();
  if (!db) return { error: "O servidor ainda não está configurado." };
  const { data, error } = await db.functions.invoke("invite-staff", {
    body: { email: input.email, role: input.role, name: input.name, company_id: input.companyId },
  });
  if (error) return { error: "O convite por e-mail ainda não está publicado. A pessoa fica na equipa e pode usar o PIN. Quando a função estiver ativa, guarda outra vez para enviar o convite." };
  const payload = data as { error?: string; message?: string } | null;
  if (payload?.error) return { error: payload.error };
  return { message: payload?.message || "Convite enviado." };
}

export async function setMemberActive(email: string, active: boolean) {
  const db = supabase();
  if (!db || !email.trim()) return;
  await db.rpc("set_member_active", { p_email: email.trim(), p_active: active });
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
  return cloudConfigured() && current?.companyStatus === "active" && Boolean(current.companyId);
}

let pushTimer = 0;
export function afterLocalWrite() {
  if (applyingRemote || !cloudActive()) return;
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => { void pushSettingsOnly(); }, 400);
}

export async function ensureOwnerStaff(user: CloudUser | null) {
  if (!user || user.companyStatus !== "active" || user.role !== "owner") return;
  const { readUsers, writeCurrentUserId, writeUsers } = await import("@/lib/user-settings");
  const users = readUsers();
  const email = user.email.trim().toLowerCase();
  const existing = users.find((item) => item.id === user.userId || (email !== "" && item.email.trim().toLowerCase() === email));
  if (existing) {
    writeCurrentUserId(existing.id);
    return;
  }
  writeUsers([...users, {
    id: user.userId,
    name: "Admin",
    login: "admin",
    email: user.email,
    role: "admin",
    active: true,
    technician: false,
    clocksIn: false,
    pin: "",
  }]);
  writeCurrentUserId(user.userId);
}

async function ensureRemoteIdentity(user: CloudUser | null) {
  if (!user || user.companyStatus !== "active" || !user.companyId) return;
  const db = supabase();
  if (!db) return;
  const { data, error } = await db.from("company_settings").select("company").eq("company_id", user.companyId).maybeSingle();
  if (error) return;
  const company = (data?.company ?? null) as { legalName?: string; tradeName?: string } | null;
  if (company?.legalName?.trim() || company?.tradeName?.trim()) return;
  const name = user.companyName === "Oficina" ? "" : user.companyName;
  applyingRemote = true;
  try {
    localStorage.setItem("hyperion-oficina-empresa", JSON.stringify(blankCompany(name)));
  } finally {
    applyingRemote = false;
  }
  await pushSettingsOnly();
}

async function pushSettingsOnly() {
  const db = supabase();
  if (!db || !current) return;
  const settings = collectSettings();
  const { error } = await db.rpc("save_company_settings", { settings: settings as never });
  if (error) console.error(error.message);
}

let stateRevision = 0;
let revisionKnown = false;

export class RevisionConflict extends Error {
  constructor() {
    super("revision desatualizada");
    this.name = "RevisionConflict";
  }
}

export function currentStateRevision() {
  return stateRevision;
}

export async function saveCompanyState(payload: Record<string, unknown>) {
  const db = supabase();
  if (!db || !current) return stateRevision;
  const { settings, ...rest } = payload;
  const body = { ...rest, settings: settings ?? collectSettings(), ...(revisionKnown ? { baseRevision: stateRevision } : {}) };
  const { data, error } = await db.rpc("save_company_state", { payload: body as never });
  if (error) {
    if (error.message.toLowerCase().includes("revision desatualizada")) throw new RevisionConflict();
    throw new Error(error.message);
  }
  const next = typeof data === "number" ? data : typeof data === "string" && /^\d+$/.test(data) ? Number(data) : null;
  if (next != null) {
    stateRevision = next;
    revisionKnown = true;
  }
  return stateRevision;
}

type Row = Record<string, unknown>;

function rawProvider(value: unknown) {
  const text = String(value ?? "");
  if (!text || text === "null") return null;
  if (text.toLowerCase() === "keymaster" || text.toLowerCase() === "importado") return "importado";
  return billingLabel(text) || null;
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function selectCompanyRows(table: string, companyId: string) {
  const db = supabase();
  if (!db) return { data: [] as Row[], error: null as { message: string } | null };
  const page = 1000;
  const data: Row[] = [];
  for (let from = 0; ; from += page) {
    const result = await db.from(table).select("*").eq("company_id", companyId).order("id", { ascending: true }).range(from, from + page - 1);
    if (result.error) return { data, error: result.error };
    const batch = (result.data ?? []) as Row[];
    data.push(...batch);
    if (batch.length < page) break;
  }
  return { data, error: null as { message: string } | null };
}

export async function loadCompanyState() {
  const db = supabase();
  if (!db || !current) return null;
  const cid = current.companyId;
  const [clients, vehicles, articles, suppliers, orders, quotes, lines, purchases, purchaseLines, appointments, invoiceLogs, settings] = await Promise.all([
    selectCompanyRows("clients", cid),
    selectCompanyRows("vehicles", cid),
    selectCompanyRows("articles", cid),
    selectCompanyRows("suppliers", cid),
    selectCompanyRows("orders", cid),
    selectCompanyRows("quotes", cid),
    selectCompanyRows("doc_lines", cid),
    selectCompanyRows("purchases", cid),
    selectCompanyRows("purchase_lines", cid),
    selectCompanyRows("appointments", cid),
    selectCompanyRows("invoice_logs", cid),
    db.from("company_settings").select("*").eq("company_id", cid).maybeSingle(),
  ]);
  const failed = [clients, vehicles, articles, suppliers, orders, quotes, lines, purchases, purchaseLines, appointments, invoiceLogs, settings].find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
  const revision = await db.from("companies").select("state_revision").eq("id", cid).maybeSingle();
  if (!revision.error && revision.data && "state_revision" in revision.data) {
    stateRevision = Number(revision.data.state_revision) || 0;
    revisionKnown = true;
  }
  if (settings.data) applyRemoteSettings(settings.data as Row);
  await ensureOwnerStaff(current);
  return {
    clients: ((clients.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), name: String(row.name ?? ""), nif: String(row.nif ?? ""), phone: String(row.phone ?? ""), email: String(row.email ?? ""),
      address: String(row.address ?? ""), postalCode: String(row.postal_code ?? ""), city: String(row.city ?? ""), notes: String(row.notes ?? ""),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    })),
    vehicles: ((vehicles.data ?? []) as Row[]).map((row) => ({
      id: String(row.id), clientId: (row.client_id as string | null) ?? null, plate: String(row.plate ?? ""), brand: String(row.brand ?? ""), model: String(row.model ?? ""),
      version: String(row.version ?? ""), year: row.year == null || row.year === "" ? null : num(row.year), vin: String(row.vin ?? ""), engine: String(row.engine ?? ""),
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
      notes: String(row.notes ?? ""), invoiceNumber: (row.invoice_number as string | null) ?? null, invoiceProvider: rawProvider(row.invoice_provider),
      invoiceIssuedAt: (row.invoice_issued_at as string | null) ?? null, invoiceSimulated: Boolean(row.invoice_simulated), invoiceUrl: (row.invoice_url as string | null) ?? null,
      originalDocumentUrl: /^https?:\/\//i.test(String(row.invoice_url ?? "")) ? String(row.invoice_url) : null,
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
      id: String(row.id), orderId: String(row.order_id ?? ""), providerId: String(row.provider_id ?? ""), providerLabel: billingLabel(String(row.provider_label ?? "")),
      simulated: Boolean(row.simulated), documentNumber: String(row.document_number ?? ""),
      requestJson: typeof row.request_json === "string" ? row.request_json : JSON.stringify(row.request_json ?? {}),
      responseJson: typeof row.response_json === "string" ? row.response_json : JSON.stringify(row.response_json ?? {}),
      createdAt: String(row.created_at),
    })),
  };
}

const IMPORTED = "oficinaplan-imported";

export function importAlreadyDone() {
  const id = current?.companyId;
  if (!id) return false;
  return localStorage.getItem(`${IMPORTED}:${id}`) === "1";
}

export function markImported() {
  const id = current?.companyId;
  if (id) localStorage.setItem(`${IMPORTED}:${id}`, "1");
}
