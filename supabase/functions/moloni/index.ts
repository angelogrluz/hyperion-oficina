// Moloni for one workshop. Deploy as Edge Function name: moloni.
// Dashboard: verify JWT ON. Secrets SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected.
// The password is used once for the grant and is not stored. If the refresh token dies, the workshop types it again.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const OFFICE = new Set(["owner", "admin", "gestor", "rececionista"]);
const ADMIN = new Set(["owner", "admin"]);
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método inválido." });
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Sessão em falta." });
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." });
    const body = await req.json();
    const admin = createClient(url, service);
    const companyId = String(body.company_id ?? "");
    const { data: membership } = await admin
      .from("memberships")
      .select("role, active, company_id")
      .eq("user_id", userData.user.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!membership || membership.active === false || !OFFICE.has(membership.role)) {
      return json({ error: "Sem permissão nesta oficina." });
    }
    const action = String(body.action ?? "status");
    if (["connect", "save", "disconnect"].includes(action) && !ADMIN.has(membership.role)) {
      return json({ error: "Só o administrador pode ligar a faturação." });
    }
    if (action === "status") return json(await publicStatus(admin, companyId));
    if (action === "connect") return json(await connect(admin, companyId, body));
    if (action === "catalog") return json(await catalog(admin, companyId));
    if (action === "save") return json(await save(admin, companyId, body));
    if (action === "disconnect") {
      await admin.from("moloni_connections").delete().eq("company_id", companyId);
      return json({ connected: false, status: "desligado" });
    }
    if (action === "issue") return json(await issue(admin, companyId, body));
    return json({ error: "Ação desconhecida." });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Falha na ligação à Moloni." });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

type Admin = ReturnType<typeof createClient>;

async function rowOf(admin: Admin, companyId: string) {
  const { data } = await admin.from("moloni_connections").select("*").eq("company_id", companyId).maybeSingle();
  return data;
}

function publicStatus(admin: Admin, companyId: string) {
  return rowOf(admin, companyId).then((row) => statusFrom(row));
}

function statusFrom(row: Record<string, unknown> | null) {
  if (!row) return { connected: false, status: "desligado" as const, needsPassword: false };
  const connected = Boolean(row.access_token && row.refresh_token);
  return {
    connected,
    status: connected ? "ligado" as const : "desligado" as const,
    needsPassword: !connected,
    username: row.username,
    developerId: row.developer_id,
    moloniCompanyId: row.moloni_company_id,
    moloniCompanyName: row.moloni_company_name,
    seriesFatura: row.series_fatura,
    seriesFaturaRecibo: row.series_fatura_recibo,
    seriesOrcamento: row.series_orcamento,
    taxId: row.tax_id,
    payments: row.payment_map ?? {},
    issueAs: row.issue_as,
    testMode: row.test_mode !== false,
  };
}

async function connect(admin: Admin, companyId: string, body: Record<string, unknown>) {
  const developerId = String(body.developer_id ?? "").trim();
  const clientSecret = String(body.client_secret ?? "").trim();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!developerId || !clientSecret || !username || !password) return { error: "Preenche o Developer ID, o segredo, o e-mail e a palavra-passe." };
  const token = await passwordGrant(developerId, clientSecret, username, password);
  const companies = await moloniList(token.access_token, "companies/getAll", {});
  await admin.from("moloni_connections").upsert({
    company_id: companyId,
    developer_id: developerId,
    client_secret: clientSecret,
    username,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    test_mode: true,
    updated_at: new Date().toISOString(),
  });
  return { ...statusFrom({ access_token: token.access_token, refresh_token: token.refresh_token, username, developer_id: developerId, test_mode: true, payment_map: {} }), companies: companies.map(companyOption) };
}

async function catalog(admin: Admin, companyId: string) {
  const row = await requireToken(admin, companyId);
  if ("error" in row) return row;
  const companies = await moloniList(row.token, "companies/getAll", {});
  const moloniCompanyId = String(row.data.moloni_company_id ?? "");
  if (!moloniCompanyId) return { companies: companies.map(companyOption), series: [], taxes: [], paymentMethods: [] };
  const [series, taxes, paymentMethods] = await Promise.all([
    moloniList(row.token, "documentSets/getAll", { company_id: moloniCompanyId }),
    moloniList(row.token, "taxes/getAll", { company_id: moloniCompanyId }),
    moloniList(row.token, "paymentMethods/getAll", { company_id: moloniCompanyId }),
  ]);
  return {
    companies: companies.map(companyOption),
    series: series.map((item) => ({ id: String(item.document_set_id), name: String(item.name ?? item.document_set_id) })),
    taxes: taxes.map((item) => ({ id: String(item.tax_id), name: `${item.name ?? "IVA"} ${item.value ?? ""}%`.trim(), value: Number(item.value ?? 0) })),
    paymentMethods: paymentMethods.map((item) => ({ id: String(item.payment_method_id), name: String(item.name ?? item.payment_method_id) })),
  };
}

async function save(admin: Admin, companyId: string, body: Record<string, unknown>) {
  const row = await rowOf(admin, companyId);
  if (!row) return { error: "Liga a conta antes de escolher a empresa." };
  const payments = body.payments && typeof body.payments === "object" ? body.payments : {};
  await admin.from("moloni_connections").update({
    moloni_company_id: String(body.moloni_company_id ?? row.moloni_company_id ?? ""),
    moloni_company_name: String(body.moloni_company_name ?? row.moloni_company_name ?? ""),
    series_fatura: String(body.series_fatura ?? ""),
    series_fatura_recibo: String(body.series_fatura_recibo ?? ""),
    series_orcamento: String(body.series_orcamento ?? ""),
    tax_id: String(body.tax_id ?? ""),
    payment_map: payments,
    issue_as: body.issue_as === "fatura_recibo" ? "fatura_recibo" : "fatura",
    test_mode: body.test_mode !== false,
    product_id: null,
    updated_at: new Date().toISOString(),
  }).eq("company_id", companyId);
  return publicStatus(admin, companyId);
}

async function issue(admin: Admin, companyId: string, body: Record<string, unknown>) {
  const ready = await requireToken(admin, companyId);
  if ("error" in ready) return ready;
  const row = ready.data;
  if (!row.moloni_company_id || !row.tax_id) return { error: "Escolhe a empresa, o IVA e as séries em Integrações." };
  const kind = String(body.kind ?? "fatura");
  const documentSet = kind === "orcamento" ? row.series_orcamento : row.issue_as === "fatura_recibo" ? row.series_fatura_recibo : row.series_fatura;
  if (!documentSet) return { error: "Falta a série deste documento em Integrações." };
  const customer = (body.customer ?? {}) as Record<string, string>;
  const lines = Array.isArray(body.lines) ? body.lines as Array<Record<string, number | string>> : [];
  if (!lines.length) return { error: "O documento não tem linhas." };
  const nif = consumerNif(customer.nif, customer.name);
  const customerId = await ensureCustomer(ready.token, String(row.moloni_company_id), { ...customer, nif });
  const productId = await ensureProduct(admin, companyId, ready.token, row);
  const taxes = await moloniList(ready.token, "taxes/getAll", { company_id: String(row.moloni_company_id) });
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams();
  params.set("company_id", String(row.moloni_company_id));
  params.set("date", today);
  params.set("expiration_date", today);
  params.set("document_set_id", String(documentSet));
  params.set("customer_id", customerId);
  params.set("our_reference", String(body.order_number ?? ""));
  params.set("status", row.test_mode ? "0" : "1");
  lines.forEach((line, index) => {
    const rate = Number(line.vatRate ?? 23);
    const tax = taxes.find((item) => Number(item.value) === rate) ?? taxes.find((item) => String(item.tax_id) === String(row.tax_id));
    params.set(`products[${index}][product_id]`, productId);
    params.set(`products[${index}][name]`, String(line.description ?? "Serviço"));
    params.set(`products[${index}][summary]`, String(line.description ?? ""));
    params.set(`products[${index}][qty]`, String(line.quantity ?? 1));
    params.set(`products[${index}][price]`, String(line.unitPrice ?? 0));
    params.set(`products[${index}][discount]`, "0");
    params.set(`products[${index}][order]`, String(index));
    if (rate === 0) params.set(`products[${index}][exemption_reason]`, "M99");
    if (tax) {
      params.set(`products[${index}][taxes][0][tax_id]`, String(tax.tax_id));
      params.set(`products[${index}][taxes][0][value]`, String(tax.value ?? rate));
      params.set(`products[${index}][taxes][0][order]`, "0");
    }
  });
  if (kind !== "orcamento") {
    const map = (row.payment_map ?? {}) as Record<string, string>;
    const method = map[String(body.payment_method ?? "")] || Object.values(map)[0];
    if (method) {
      params.set("payments[0][payment_method_id]", method);
      params.set("payments[0][date]", today);
      params.set("payments[0][value]", String(body.total ?? 0));
    }
  }
  const endpoint = kind === "orcamento" ? "estimates/insert" : row.issue_as === "fatura_recibo" && kind !== "orcamento" ? "invoiceReceipts/insert" : "invoices/insert";
  const created = await moloniPost(ready.token, endpoint, params);
  const documentId = String(created.document_id ?? created.documentId ?? "");
  if (!documentId) return { error: "A Moloni não devolveu o documento." };
  const info = await moloniPost(ready.token, "documents/getOne", new URLSearchParams({ company_id: String(row.moloni_company_id), document_id: documentId })).catch(() => ({}));
  const number = String(info.document_set_name && info.number ? `${info.document_set_name}/${info.number}` : info.number ?? documentId);
  let pdf: string | null = null;
  if (!row.test_mode) {
    const link = await moloniPost(ready.token, "documents/getPDFLink", new URLSearchParams({ company_id: String(row.moloni_company_id), document_id: documentId })).catch(() => ({}));
    pdf = typeof link.url === "string" ? link.url : null;
  }
  return {
    documentNumber: number,
    externalId: documentId,
    url: pdf,
    providerId: "moloni",
    providerLabel: row.test_mode ? "Moloni (rascunho de teste)" : "Moloni",
    simulated: false,
    testMode: Boolean(row.test_mode),
  };
}

function consumerNif(nif?: string, name?: string) {
  const value = String(nif ?? "").replace(/\s/g, "");
  if (!value || value === "999999990" || /consumidor final/i.test(String(name ?? ""))) return "999999990";
  return value;
}

async function ensureCustomer(token: string, companyId: string, customer: Record<string, string>) {
  const nif = consumerNif(customer.nif, customer.name);
  const found = await moloniList(token, "customers/getByVat", { company_id: companyId, vat: nif });
  const existing = found.find((item) => item.customer_id) ?? found[0];
  if (existing?.customer_id) return String(existing.customer_id);
  const created = await moloniPost(token, "customers/insert", new URLSearchParams({
    company_id: companyId,
    vat: nif,
    number: nif,
    name: nif === "999999990" ? "Consumidor Final" : (customer.name || "Cliente"),
    language_id: "1",
    address: customer.address || "Desconhecida",
    city: customer.city || "Desconhecida",
    zip_code: customer.postalCode || "0000-000",
    country_id: "1",
    email: customer.email || "",
    phone: customer.phone || "",
    maturity_date_id: "1",
    payment_day: "0",
    discount: "0",
    credit_limit: "0",
    qty_copies_document: "1",
    sales_man_id: "0",
  }));
  if (!created.customer_id) throw new Error("Não foi possível criar o cliente na Moloni.");
  return String(created.customer_id);
}

async function ensureProduct(admin: Admin, companyId: string, token: string, row: Record<string, unknown>) {
  if (row.product_id) return String(row.product_id);
  const found = await moloniList(token, "products/getByReference", { company_id: String(row.moloni_company_id), reference: "OFICINAPLAN" });
  const existing = found.find((item) => item.product_id);
  if (existing?.product_id) {
    await admin.from("moloni_connections").update({ product_id: String(existing.product_id) }).eq("company_id", companyId);
    return String(existing.product_id);
  }
  const created = await moloniPost(token, "products/insert", new URLSearchParams({
    company_id: String(row.moloni_company_id),
    category_id: "1",
    type: "2",
    name: "Serviço de oficina",
    reference: "OFICINAPLAN",
    price: "0",
    unit_id: "1",
    has_stock: "0",
    stock: "0",
  }));
  if (!created.product_id) throw new Error("Não foi possível criar o artigo genérico na Moloni.");
  await admin.from("moloni_connections").update({ product_id: String(created.product_id) }).eq("company_id", companyId);
  return String(created.product_id);
}

async function requireToken(admin: Admin, companyId: string): Promise<{ token: string; data: Record<string, any> } | { error: string }> {
  const row = await rowOf(admin, companyId);
  if (!row?.refresh_token) return { error: "A Moloni não está ligada. Volta a escrever a palavra-passe em Integrações." };
  const expires = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (row.access_token && expires > Date.now() + 60_000) return { token: row.access_token, data: row };
  try {
    const token = await refreshGrant(row.developer_id, row.client_secret, row.refresh_token);
    await admin.from("moloni_connections").update({
      access_token: token.access_token,
      refresh_token: token.refresh_token || row.refresh_token,
      token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("company_id", companyId);
    return { token: token.access_token, data: { ...row, access_token: token.access_token } };
  } catch {
    await admin.from("moloni_connections").update({ access_token: null, refresh_token: null, token_expires_at: null }).eq("company_id", companyId);
    return { error: "A sessão da Moloni expirou. Escreve outra vez a palavra-passe para ligar." };
  }
}

async function passwordGrant(developerId: string, clientSecret: string, username: string, password: string) {
  const url = new URL("https://api.moloni.pt/v1/grant/");
  url.searchParams.set("grant_type", "password");
  url.searchParams.set("client_id", developerId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("username", username);
  url.searchParams.set("password", password);
  return readToken(await fetch(url));
}

async function refreshGrant(developerId: string, clientSecret: string, refreshToken: string) {
  const url = new URL("https://api.moloni.pt/v1/grant/");
  url.searchParams.set("grant_type", "refresh_token");
  url.searchParams.set("client_id", developerId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("refresh_token", refreshToken);
  return readToken(await fetch(url));
}

async function readToken(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "A Moloni recusou a ligação. Confirma o Developer ID, o segredo e a palavra-passe.");
  }
  return { access_token: String(payload.access_token), refresh_token: String(payload.refresh_token ?? ""), expires_in: Number(payload.expires_in ?? 3600) };
}

async function moloniList(token: string, path: string, fields: Record<string, string>) {
  const payload = await moloniCall(token, path, new URLSearchParams(fields));
  const list = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? [payload] : [];
  const error = list.find((item) => item && (item.error || item.error_description) && !item.company_id && !item.document_id && !item.customer_id && !item.product_id && !item.tax_id && !item.payment_method_id && !item.document_set_id);
  if (error && list.length === 1) throw new Error(String(error.error_description || error.error));
  return list.filter((item) => item && !item.error);
}

async function moloniPost(token: string, path: string, body: URLSearchParams) {
  const payload = await moloniCall(token, path, body);
  if (Array.isArray(payload)) {
    const error = payload.find((item) => item && (item.error || item.error_description));
    if (error && !error.document_id && !error.customer_id && !error.product_id) throw new Error(String(error.error_description || error.error));
    return payload.find((item) => item && (item.document_id || item.customer_id || item.product_id || item.url || item.number)) ?? payload[0] ?? {};
  }
  if (payload?.error) throw new Error(String(payload.error_description || payload.error));
  return payload ?? {};
}

async function moloniCall(token: string, path: string, body: URLSearchParams) {
  const response = await fetch(`https://api.moloni.pt/v1/${path}/?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("A Moloni recusou o pedido.");
  return payload;
}

function companyOption(item: Record<string, unknown>) {
  return { id: String(item.company_id), name: String(item.name ?? item.company_id) };
}
