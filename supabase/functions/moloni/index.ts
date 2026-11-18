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
    if (action === "pdf") return json(await lookupPdf(admin, companyId, body));
    return json({ error: "Ação desconhecida." });
  } catch (error) {
    return json({ error: publicError(error instanceof Error ? error.message : "Falha na ligação ao programa de faturação.") });
  }
});

function publicError(message: string) {
  return message
    .replace(/\bna Moloni\b/gi, "no programa de faturação")
    .replace(/\bda Moloni\b/gi, "do programa de faturação")
    .replace(/\bà Moloni\b/gi, "ao programa de faturação")
    .replace(/\bpela Moloni\b/gi, "pelo programa de faturação")
    .replace(/\bA Moloni\b/g, "O programa de faturação")
    .replace(/\ba Moloni\b/g, "o programa de faturação")
    .replace(/Moloni/gi, "programa de faturação");
}

// Validation errors come back with HTTP 200 as an array of "<code> <field> [params]"
// strings (or {code, description} objects when human_errors=true is sent).
const FIELD_LABELS: Record<string, string> = {
  company_id: "empresa", category_id: "categoria do artigo", type: "tipo de artigo", name: "nome",
  reference: "referência", price: "preço", unit_id: "unidade de medida", has_stock: "controlo de stock",
  stock: "stock", exemption_reason: "motivo de isenção de IVA", taxes: "impostos", tax_id: "taxa de IVA",
  value: "valor", order: "ordem", cumulative: "imposto cumulativo", vat: "NIF", number: "número de cliente",
  language_id: "idioma", address: "morada", city: "localidade", zip_code: "código postal", country_id: "país",
  email: "e-mail", phone: "telefone", maturity_date_id: "prazo de vencimento", payment_day: "dia de pagamento",
  discount: "desconto", credit_limit: "limite de crédito", qty_copies_document: "número de cópias",
  sales_man_id: "vendedor", date: "data", expiration_date: "data de vencimento", document_set_id: "série",
  customer_id: "cliente", products: "linhas", product_id: "artigo", qty: "quantidade", payments: "pagamentos",
  payment_method_id: "método de pagamento", our_reference: "referência interna", status: "estado",
  parent_id: "categoria-mãe", short_name: "abreviatura", summary: "descrição",
};
const CODE_TEXT: Record<string, string> = {
  "1": "é obrigatório",
  "2": "tem de ser um número válido (ID inexistente ou valor fora do intervalo)",
  "3": "não é um e-mail válido",
  "4": "já existe (tem de ser único)",
  "5": "não tem um valor aceite",
  "6": "tem de ser um URL",
  "7": "não é um código postal válido",
  "8": "não é um NIF português válido",
  "9": "tem de ser uma data AAAA-MM-DD",
  "10": "associação de documento inválida",
  "11": "o documento não pode ser comunicado à AT",
  "12": "tem uma data fora do intervalo permitido",
  "13": "não é um telefone válido",
  "14": "ordem/cumulatividade dos impostos inválida",
  "15": "tem mais do que uma taxa de IVA",
  "16": "acima do limite legal o cliente tem de estar identificado (nome, morada, localidade e código postal reais)",
  "17": "atingiu o limite permitido",
};

class ProviderValidationError extends Error {}

function describeField(raw: string) {
  // e.g. "products", "products.0.taxes.0.tax_id", "products[0][taxes]"
  const parts = raw.split(/[.\[\]]+/).filter(Boolean);
  const line = parts.length > 1 && parts[0] === "products" && /^\d+$/.test(parts[1]) ? ` (linha ${Number(parts[1]) + 1})` : "";
  const last = [...parts].reverse().find((part) => !/^\d+$/.test(part)) ?? raw;
  return `${FIELD_LABELS[last] ?? last}${line}`;
}

function validationMessages(payload: unknown): string[] | null {
  if (!Array.isArray(payload) || !payload.length) return null;
  const out: string[] = [];
  for (const item of payload) {
    let code = "";
    if (typeof item === "string") code = item;
    else if (item && typeof item === "object" && typeof (item as Record<string, unknown>).code === "string") code = String((item as Record<string, unknown>).code);
    else return null;
    const match = code.trim().match(/^(\d+)\s+(\S+)(.*)$/);
    if (!match) return null;
    const [, num, field] = match;
    out.push(`${describeField(field)} ${CODE_TEXT[num] ?? "não é válido"} [${code.trim()}]`);
  }
  return out;
}

function validationError(path: string, payload: unknown, sent?: URLSearchParams) {
  const messages = validationMessages(payload);
  if (!messages) return null;
  const sentKeys = sent ? [...new Set([...sent.keys()].map((key) => key.replace(/\[\d+\]/g, "[]")))].join(",") : "";
  const detail = JSON.stringify(payload).slice(0, 1500);
  console.error(`[prod] ${path} validation`, detail, sentKeys ? `sent=${sentKeys}` : "");
  return new ProviderValidationError(`O programa de faturação recusou o pedido (${path}): ${messages.join("; ")}.`);
}

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
    hasSecret: Boolean(row.client_secret),
  };
}

async function connect(admin: Admin, companyId: string, body: Record<string, unknown>) {
  // The secret never goes back to the browser; when it is already stored for this workshop it may be left blank.
  const stored = await rowOf(admin, companyId);
  const developerId = String(body.developer_id ?? "").trim() || String(stored?.developer_id ?? "");
  const clientSecret = String(body.client_secret ?? "").trim() || String(stored?.client_secret ?? "");
  const username = String(body.username ?? "").trim() || String(stored?.username ?? "");
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
  const taxes = await moloniList(ready.token, "taxes/getAll", { company_id: String(row.moloni_company_id) });
  const productId = await ensureProduct(admin, companyId, ready.token, row, taxes);
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams();
  params.set("company_id", String(row.moloni_company_id));
  params.set("date", today);
  params.set("expiration_date", today);
  params.set("document_set_id", String(documentSet));
  params.set("customer_id", customerId);
  params.set("our_reference", String(body.order_number ?? ""));
  const testMode = row.test_mode !== false;
  const demoAccount = isDemoCompany(row);
  params.set("status", testMode ? "0" : "1");
  lines.forEach((line, index) => {
    const rate = Number(line.vatRate ?? 23);
    // 0 % lines must not fall back to the default (23 %) tax; they go out with an exemption reason only.
    const tax = taxes.find((item) => Number(item.value) === rate) ?? (rate === 0 ? undefined : taxes.find((item) => String(item.tax_id) === String(row.tax_id)));
    params.set(`products[${index}][product_id]`, productId);
    params.set(`products[${index}][name]`, String(line.description ?? "Serviço"));
    params.set(`products[${index}][summary]`, String(line.description ?? ""));
    params.set(`products[${index}][qty]`, String(line.quantity ?? 1));
    params.set(`products[${index}][price]`, String(line.unitPrice ?? 0));
    params.set(`products[${index}][discount]`, "0");
    params.set(`products[${index}][order]`, String(index));
    if (rate === 0 || !tax) params.set(`products[${index}][exemption_reason]`, "M99");
    if (tax) {
      params.set(`products[${index}][taxes][0][tax_id]`, String(tax.tax_id));
      params.set(`products[${index}][taxes][0][value]`, String(tax.value ?? rate));
      params.set(`products[${index}][taxes][0][order]`, "0");
      params.set(`products[${index}][taxes][0][cumulative]`, "0");
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
  // Idempotency: an earlier attempt may have created the document and then failed to save it here.
  // Look it up by our_reference (the obra number) before creating anything new.
  const reference = String(body.order_number ?? "").trim();
  const total = Number(body.total ?? 0);
  let documentId = "";
  let reused = false;
  if (reference) {
    const prior = await findPriorDocument(ready.token, String(row.moloni_company_id), kind, reference, nif);
    if (prior) {
      const sameTotal = Math.abs(Number(prior.net_value ?? 0) - total) <= 0.05;
      const draft = Number(prior.status ?? 0) === 0;
      console.log("[issue] prior", JSON.stringify({ reference, id: prior.document_id, endpoint: prior._endpoint, status: prior.status, number: prior.number, net: prior.net_value, total, sameTotal }));
      if (sameTotal) {
        documentId = String(prior.document_id);
        reused = true;
      } else if (draft) {
        // Our own unfinished draft for this obra with old values: remove it and create a fresh one.
        await moloniPost(ready.token, String(prior._endpoint).replace("/getAll", "/delete"), new URLSearchParams({ company_id: String(row.moloni_company_id), document_id: String(prior.document_id) }));
        console.log("[issue] deleted stale draft", prior.document_id);
      } else {
        return { error: `Já existe no programa de faturação um documento final para a obra ${reference} (${formatNumber(prior, String(prior.document_id))}) com um total diferente (${Number(prior.net_value ?? 0).toFixed(2)} €). Não emiti outro para não duplicar: confirma esse documento antes de voltar a faturar.` };
      }
    }
  }
  if (!documentId) {
    const created = await moloniPost(ready.token, endpoint, params);
    documentId = String(created.document_id ?? created.documentId ?? "");
  }
  if (!documentId) return { error: "O programa de faturação não devolveu o documento." };
  const info = await moloniPost(ready.token, "documents/getOne", new URLSearchParams({ company_id: String(row.moloni_company_id), document_id: documentId })).catch(() => ({}));
  const isDraft = Number(info.status ?? (testMode ? 0 : 1)) === 0;
  // Numbers from a demo/test company are not AT documents and live in the same "FT2026/N" space as the
  // imported history, so they are stored with a «Teste» prefix and can never collide with it.
  const number = `${demoAccount ? "Teste " : ""}${formatNumber(info, documentId)}`;
  console.log("[issue] done", JSON.stringify({ reference, documentId, number, reused, isDraft, testMode, demoAccount }));
  let pdf: string | null = null;
  if (!isDraft) {
    const link = await moloniPost(ready.token, "documents/getPDFLink", new URLSearchParams({ company_id: String(row.moloni_company_id), document_id: documentId })).catch(() => ({}));
    pdf = typeof link.url === "string" ? link.url : null;
  }
  return {
    documentNumber: number,
    externalId: documentId,
    url: pdf,
    providerId: "moloni",
    providerLabel: demoAccount ? "Conta de teste" : testMode ? "Rascunho de teste" : "Fatura certificada",
    simulated: false,
    testMode,
    demoAccount,
    externalStatus: isDraft ? "rascunho" : "final",
    draft: isDraft,
    reused,
  };
}

function isDemoCompany(row: Record<string, unknown>) {
  const name = String(row.moloni_company_name ?? "");
  return /\b(demo|demonstra|teste?s?|test|exemplo|sandbox|fict[ií]cia)/i.test(name);
}

function setNameOf(item: Record<string, any>) {
  return String(item?.document_set?.name ?? item?.document_set_name ?? "").trim();
}

// Same shape as the imported history ("FT2026/204"). Drafts have no number yet (0), so they get a
// unique placeholder that names the external id; the real number is read again from the official PDF later.
function formatNumber(info: Record<string, any>, documentId: string) {
  const saft = String(info?.document_type?.saft_code ?? "").trim().toUpperCase();
  const set = setNameOf(info);
  const series = set && saft && !set.toUpperCase().startsWith(saft) ? `${saft}${set}` : set || saft;
  const number = Number(info?.number ?? 0);
  if (!number || Number(info?.status ?? 1) === 0) return `Rascunho ${series || "documento"} #${documentId}`.replace(/\s+/g, " ");
  return series ? `${series}/${number}` : String(number);
}

async function findPriorDocument(token: string, companyId: string, kind: string, reference: string, nif: string) {
  const endpoints = kind === "orcamento" ? ["estimates/getAll"] : ["invoices/getAll", "invoiceReceipts/getAll"];
  const year = String(new Date().getFullYear());
  for (const endpoint of endpoints) {
    const rows = await moloniList(token, endpoint, { company_id: companyId, our_reference: reference, year }).catch((error) => {
      console.log("[issue] prior-lookup-failed", endpoint, publicError(error instanceof Error ? error.message : "erro"));
      return [] as Array<Record<string, any>>;
    });
    // Only documents we created for this obra; ignore cancelled ones (status other than draft/closed).
    const hit = rows
      .filter((item) => String(item.our_reference ?? "").trim() === reference
        && String(item.entity_vat ?? "").replace(/\D/g, "") === nif.replace(/\D/g, "")
        && [0, 1].includes(Number(item.status ?? 0)))
      .sort((a, b) => Number(b.document_id) - Number(a.document_id))[0];
    if (hit) return { ...hit, _endpoint: endpoint };
  }
  return null;
}

const PDF_ENDPOINTS: Record<string, string> = {
  FT: "invoices/getAll",
  FR: "invoiceReceipts/getAll",
  RC: "receipts/getAll",
  NC: "creditNotes/getAll",
};

function parseDocumentNumber(value: string) {
  const text = value.trim().replace(/^teste\s+/i, "");
  const typed = text.match(/^(FT|FR|RC|NC)\s*([^/]*)\/(\d+)$/i);
  if (typed) {
    const type = typed[1].toUpperCase();
    const rest = typed[2].replace(/^[\s./-]+/, "");
    const year = (rest.match(/(\d{4})/) ?? text.match(/(\d{4})/) ?? [])[1] ?? "";
    return { type, series: rest ? `${type}${rest}` : type, number: typed[3], year };
  }
  const parts = text.split("/").filter(Boolean);
  const number = parts.length > 1 ? parts[parts.length - 1] : "";
  const series = parts.length > 1 ? parts.slice(0, -1).join("/") : text;
  const year = (series.match(/(\d{4})/) ?? [])[1] ?? "";
  return { type: "", series, number, year };
}

async function pdfLink(token: string, companyId: string, documentId: string) {
  const link = await moloniPost(token, "documents/getPDFLink", new URLSearchParams({ company_id: companyId, document_id: documentId }));
  return typeof link.url === "string" && link.url ? link.url : "";
}

function compact(value: string) {
  return value.toLowerCase().replace(/[\s._-]+/g, "");
}

function numberMatches(row: Record<string, unknown>, parsed: { type: string; series: string; number: string; year: string }) {
  // Strict: same document set (series) AND same number. Never accept a document from another series.
  const raw = String(row.number ?? "").trim();
  const setName = setNameOf(row);
  if (!raw || !setName) return false;
  if (raw !== parsed.number) return false;
  return compact(setName) === compact(parsed.series) || (parsed.type !== "" && compact(`${parsed.type}${setName}`) === compact(parsed.series));
}

function linkedTo(row: Record<string, unknown>, documentId: string) {
  const lists = ["associated_documents", "receipts", "child_documents", "related_documents"];
  for (const key of lists) {
    const value = row[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = String(record.associated_id ?? record.document_id ?? record.receipt_id ?? "");
      if (id && id === documentId) return true;
    }
  }
  return false;
}

async function queryDocuments(token: string, endpoint: string, fields: Record<string, string>) {
  try {
    const rows = await moloniList(token, endpoint, fields);
    console.log("[pdf] query", endpoint, JSON.stringify({ year: fields.year ?? "", set: fields.document_set_id ?? "", number: fields.number ?? "", offset: fields.offset ?? "0", count: rows.length, sample: rows.slice(0, 3).map((item) => ({ id: item.document_id, number: item.number, set: setNameOf(item) })) }));
    return rows;
  } catch (error) {
    console.log("[pdf] query-failed", endpoint, publicError(error instanceof Error ? error.message : "erro"));
    return [];
  }
}

async function searchDocuments(token: string, companyId: string, type: string, parsed: { type: string; series: string; number: string; year: string }, setIds: string[]) {
  const endpoint = PDF_ENDPOINTS[type];
  const bases: Record<string, string>[] = [
    { company_id: companyId, qty: "50", offset: "0", number: parsed.number },
    { company_id: companyId, qty: "50", offset: "0", number: `${parsed.series}/${parsed.number}` },
  ];
  if (parsed.year) for (const item of bases) item.year = parsed.year;
  for (const id of setIds) {
    bases.push({ company_id: companyId, qty: "50", offset: "0", number: parsed.number, document_set_id: id, ...(parsed.year ? { year: parsed.year } : {}) });
  }
  for (const fields of bases) {
    const rows = await queryDocuments(token, endpoint, fields);
    const hit = rows.find((item) => numberMatches(item, parsed));
    if (hit?.document_id) return hit;
  }
  if (!parsed.year) return null;
  for (let page = 0; page < 8; page += 1) {
    const rows = await queryDocuments(token, endpoint, { company_id: companyId, qty: "50", offset: String(page * 50), year: parsed.year });
    const hit = rows.find((item) => numberMatches(item, parsed));
    if (hit?.document_id) return hit;
    if (rows.length < 50) break;
  }
  return null;
}

async function findLinkedReceipt(token: string, companyId: string, invoice: Record<string, unknown>, year: string) {
  const invoiceId = String(invoice.document_id ?? "");
  if (linkedTo(invoice, invoiceId) && String(invoice.document_type ?? "").toUpperCase() === "RC") return invoice;
  const direct = ["associated_documents", "receipts", "child_documents", "related_documents"].flatMap((key) => Array.isArray(invoice[key]) ? invoice[key] as Record<string, unknown>[] : []);
  for (const item of direct) {
    const id = String(item.document_id ?? item.receipt_id ?? item.associated_id ?? "");
    if (id && id !== invoiceId) {
      const one = await moloniPost(token, "documents/getOne", new URLSearchParams({ company_id: companyId, document_id: id })).catch(() => ({}));
      console.log("[pdf] related", id, "keys", Object.keys(one).slice(0, 12).join(","));
      if (one.document_id) return one;
    }
  }
  for (let page = 0; page < 8; page += 1) {
    const fields: Record<string, string> = { company_id: companyId, qty: "50", offset: String(page * 50) };
    if (year) fields.year = year;
    const customer = String(invoice.customer_id ?? "");
    if (customer) fields.customer_id = customer;
    const rows = await queryDocuments(token, "receipts/getAll", fields);
    let inspected = 0;
    for (const row of rows) {
      if (linkedTo(row, invoiceId)) return row;
      if (!row.associated_documents && row.document_id && inspected < 40) {
        inspected += 1;
        const one = await moloniPost(token, "documents/getOne", new URLSearchParams({ company_id: companyId, document_id: String(row.document_id) })).catch(() => ({}));
        if (linkedTo(one, invoiceId)) return one;
      }
    }
    if (rows.length < 50) break;
  }
  return null;
}

async function lookupPdf(admin: Admin, companyId: string, body: Record<string, unknown>) {
  const ready = await requireToken(admin, companyId);
  if ("error" in ready) return { found: false, reason: "auth", error: ready.error };
  const moloniCompanyId = String(ready.data.moloni_company_id ?? "");
  const testMode = ready.data.test_mode !== false;
  console.log("[pdf] start", JSON.stringify({ kind: body.kind ?? "fatura", number: body.number ?? "", hasDocumentId: Boolean(body.document_id), hasInvoiceId: Boolean(body.invoice_document_id), testMode, hasCompany: Boolean(moloniCompanyId) }));
  if (!moloniCompanyId) return { found: false, reason: "no_company", error: "Escolhe a empresa em Integrações." };
  const knownId = String(body.document_id ?? "").trim();
  const parsed = parseDocumentNumber(String(body.number ?? ""));
  if (knownId && String(body.kind ?? "fatura") !== "recibo") {
    const one = await moloniPost(ready.token, "documents/getOne", new URLSearchParams({ company_id: moloniCompanyId, document_id: knownId })).catch(() => ({}));
    if (one.document_id && parsed.number && numberMatches(one, parsed)) {
      const url = await pdfLink(ready.token, moloniCompanyId, knownId).catch(() => "");
      console.log("[pdf] cached", knownId, Boolean(url));
      return url ? { found: true, reason: "ok", documentId: knownId, url } : { found: false, reason: "no_pdf" };
    }
    console.log("[pdf] cached-mismatch", knownId, setNameOf(one), String(one.number ?? ""));
  }
  console.log("[pdf] parsed", JSON.stringify(parsed));
  if (!parsed.number) return { found: false, reason: "no_number" };
  const sets = await moloniList(ready.token, "documentSets/getAll", { company_id: moloniCompanyId }).catch((error) => {
    console.log("[pdf] sets-failed", publicError(error instanceof Error ? error.message : "erro"));
    return [];
  });
  console.log("[pdf] sets", sets.map((item) => String(item.name ?? item.document_set_id)).join(" | ") || "(none)");
  const setIds = sets.map((item) => String(item.document_set_id ?? "")).filter(Boolean);
  const wantReceipt = String(body.kind ?? "fatura") === "recibo";
  const invoiceDocumentId = String(body.invoice_document_id ?? "").trim();
  if (wantReceipt && invoiceDocumentId) {
    const info = await moloniPost(ready.token, "documents/getOne", new URLSearchParams({ company_id: moloniCompanyId, document_id: invoiceDocumentId })).catch(() => ({}));
    console.log("[pdf] cached-invoice", invoiceDocumentId, "keys", Object.keys(info).slice(0, 20).join(","));
    if (info.document_id && numberMatches(info, parsed)) {
      const receipt = parsed.type === "FR" ? info : await findLinkedReceipt(ready.token, moloniCompanyId, info, parsed.year);
      if (receipt?.document_id) {
        const url = await pdfLink(ready.token, moloniCompanyId, String(receipt.document_id)).catch(() => "");
        if (url) return { found: true, reason: "ok", documentId: String(receipt.document_id), url, documentType: parsed.type === "FR" ? "FR" : "RC" };
      }
      console.log("[pdf] no linked receipt for", invoiceDocumentId);
    }
  }
  if (!wantReceipt) {
    const types = parsed.type ? [parsed.type] : ["FT", "FR", "NC", "RC"];
    for (const type of types) {
      const hit = await searchDocuments(ready.token, moloniCompanyId, type, { ...parsed, type: parsed.type || type }, setIds);
      if (!hit?.document_id) continue;
      const url = await pdfLink(ready.token, moloniCompanyId, String(hit.document_id)).catch(() => "");
      console.log("[pdf] hit", type, hit.document_id, hit.number, setNameOf(hit), Boolean(url));
      if (!url) return { found: false, reason: "no_pdf", documentId: String(hit.document_id), documentType: type };
      return { found: true, reason: "ok", documentId: String(hit.document_id), url, documentType: type };
    }
    return { found: false, reason: "no_match", detail: `sets=${sets.length}; number=${parsed.number}; year=${parsed.year}` };
  }
  const invoice = await searchDocuments(ready.token, moloniCompanyId, parsed.type || "FT", { ...parsed, type: parsed.type || "FT" }, setIds)
    ?? (!parsed.type ? await searchDocuments(ready.token, moloniCompanyId, "FR", { ...parsed, type: "FR" }, setIds) : null);
  if (!invoice?.document_id) return { found: false, reason: "no_invoice", detail: `number=${parsed.number}; year=${parsed.year}` };
  const info = await moloniPost(ready.token, "documents/getOne", new URLSearchParams({ company_id: moloniCompanyId, document_id: String(invoice.document_id) })).catch(() => invoice);
  console.log("[pdf] invoice", invoice.document_id, "keys", Object.keys(info).slice(0, 20).join(","));
  if (parsed.type === "FR") {
    const url = await pdfLink(ready.token, moloniCompanyId, String(invoice.document_id)).catch(() => "");
    return url ? { found: true, reason: "ok", documentId: String(invoice.document_id), url, documentType: "FR" } : { found: false, reason: "no_pdf" };
  }
  const receipt = await findLinkedReceipt(ready.token, moloniCompanyId, info, parsed.year);
  if (!receipt?.document_id) return { found: false, reason: "no_receipt", detail: `invoice=${invoice.document_id}` };
  const url = await pdfLink(ready.token, moloniCompanyId, String(receipt.document_id)).catch(() => "");
  console.log("[pdf] receipt", receipt.document_id, receipt.number, Boolean(url));
  return url ? { found: true, reason: "ok", documentId: String(receipt.document_id), url, documentType: "RC" } : { found: false, reason: "no_pdf" };
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
  if (!created.customer_id) {
    console.error("[prod] customers/insert no customer_id", JSON.stringify(created).slice(0, 500));
    throw new Error("O programa de faturação não devolveu o cliente criado.");
  }
  return String(created.customer_id);
}

async function ensureProduct(admin: Admin, companyId: string, token: string, row: Record<string, unknown>, taxes: Array<Record<string, any>>) {
  if (row.product_id) return String(row.product_id);
  const moloniCompanyId = String(row.moloni_company_id);
  const found = await moloniList(token, "products/getByReference", { company_id: moloniCompanyId, reference: "OFICINAPLAN", exact: "1" });
  const existing = found.find((item) => item.product_id);
  if (existing?.product_id) {
    await admin.from("moloni_connections").update({ product_id: String(existing.product_id) }).eq("company_id", companyId);
    return String(existing.product_id);
  }
  const categoryId = await ensureCategory(token, moloniCompanyId);
  const unitId = await ensureUnit(token, moloniCompanyId);
  const tax = taxes.find((item) => String(item.tax_id) === String(row.tax_id) && Number(item.value) > 0)
    ?? taxes.find((item) => Number(item.value) === 23)
    ?? taxes.find((item) => Number(item.value) > 0);
  const params = new URLSearchParams({
    company_id: moloniCompanyId,
    category_id: categoryId,
    type: "2",
    name: "Serviço de oficina",
    summary: "",
    reference: "OFICINAPLAN",
    ean: "",
    price: "0",
    unit_id: unitId,
    has_stock: "0",
    stock: "0",
    at_product_category: "S",
  });
  if (tax) {
    params.set("taxes[0][tax_id]", String(tax.tax_id));
    params.set("taxes[0][value]", String(tax.value ?? 23));
    params.set("taxes[0][order]", "0");
    params.set("taxes[0][cumulative]", "0");
    params.set("exemption_reason", "");
  } else {
    params.set("exemption_reason", "M99");
  }
  console.log("[prod] insert", JSON.stringify({ category: categoryId, unit: unitId, tax: tax ? String(tax.tax_id) : "", taxValue: tax?.value ?? null }));
  let created: Record<string, any>;
  try {
    created = await moloniPost(token, "products/insert", params);
  } catch (error) {
    // The reference may already exist (e.g. created by hand); reuse it instead of failing.
    const again = await moloniList(token, "products/getByReference", { company_id: moloniCompanyId, reference: "OFICINAPLAN" }).catch(() => []);
    const hit = again.find((item) => item.product_id);
    if (!hit?.product_id) throw error;
    created = hit;
  }
  if (!created.product_id) {
    console.error("[prod] insert no product_id", JSON.stringify(created).slice(0, 500));
    throw new Error("O programa de faturação não devolveu o artigo genérico criado.");
  }
  await admin.from("moloni_connections").update({ product_id: String(created.product_id) }).eq("company_id", companyId);
  return String(created.product_id);
}

async function ensureCategory(token: string, moloniCompanyId: string) {
  const list = await moloniList(token, "productCategories/getAll", { company_id: moloniCompanyId, parent_id: "0" });
  const pick = list.find((item) => /servi|oficina|geral/i.test(String(item.name ?? ""))) ?? list.find((item) => item.category_id);
  if (pick?.category_id) return String(pick.category_id);
  const created = await moloniPost(token, "productCategories/insert", new URLSearchParams({
    company_id: moloniCompanyId, parent_id: "0", name: "Serviços de oficina", description: "", pos_enabled: "0",
  }));
  if (!created.category_id) throw new Error("O programa de faturação não devolveu a categoria de artigos criada.");
  return String(created.category_id);
}

async function ensureUnit(token: string, moloniCompanyId: string) {
  const list = await moloniList(token, "measurementUnits/getAll", { company_id: moloniCompanyId });
  const pick = list.find((item) => /^(un|uni|unid|unidade)s?\.?$/i.test(String(item.short_name ?? "")) || /^unidade/i.test(String(item.name ?? "")))
    ?? list.find((item) => item.unit_id);
  if (pick?.unit_id) return String(pick.unit_id);
  const created = await moloniPost(token, "measurementUnits/insert", new URLSearchParams({ company_id: moloniCompanyId, name: "Unidade", short_name: "Un." }));
  if (!created.unit_id) throw new Error("O programa de faturação não devolveu a unidade de medida criada.");
  return String(created.unit_id);
}

async function requireToken(admin: Admin, companyId: string): Promise<{ token: string; data: Record<string, any> } | { error: string }> {
  const row = await rowOf(admin, companyId);
  if (!row?.refresh_token) return { error: "O programa de faturação não está ligado. Volta a escrever a palavra-passe em Integrações." };
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
    return { error: "A sessão do programa de faturação expirou. Escreve outra vez a palavra-passe para ligar." };
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
    throw new Error(payload.error_description || payload.error || "O programa de faturação recusou a ligação. Confirma o Developer ID, o segredo e a palavra-passe.");
  }
  return { access_token: String(payload.access_token), refresh_token: String(payload.refresh_token ?? ""), expires_in: Number(payload.expires_in ?? 3600) };
}

async function moloniList(token: string, path: string, fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  const payload = await moloniCall(token, path, body);
  const invalid = validationError(path, payload, body);
  if (invalid) throw invalid;
  const list = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? [payload] : [];
  const error = list.find((item) => item && (item.error || item.error_description) && !item.company_id && !item.document_id && !item.customer_id && !item.product_id && !item.tax_id && !item.payment_method_id && !item.document_set_id);
  if (error && list.length === 1) throw new Error(String(error.error_description || error.error));
  return list.filter((item) => item && !item.error);
}

async function moloniPost(token: string, path: string, body: URLSearchParams) {
  const payload = await moloniCall(token, path, body);
  const invalid = validationError(path, payload, body);
  if (invalid) throw invalid;
  if (Array.isArray(payload)) {
    const error = payload.find((item) => item && (item.error || item.error_description));
    if (error && !error.document_id && !error.customer_id && !error.product_id) throw new Error(String(error.error_description || error.error));
    return payload.find((item) => item && (item.document_id || item.customer_id || item.product_id || item.url || item.number)) ?? payload[0] ?? {};
  }
  if (payload?.error) throw new Error(String(payload.error_description || payload.error));
  return payload ?? {};
}

async function moloniCall(token: string, path: string, body: URLSearchParams) {
  const response = await fetch(`https://api.moloni.pt/v1/${path}/?human_errors=true&access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text().catch(() => "");
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    console.error(`[prod] ${path} http ${response.status}`, text.slice(0, 500));
    throw new Error(`O programa de faturação recusou o pedido (${path}, HTTP ${response.status}).`);
  }
  if (text && !text.trim().startsWith("[") && !text.trim().startsWith("{")) console.error(`[prod] ${path} non-json`, text.slice(0, 300));
  return payload;
}

function companyOption(item: Record<string, unknown>) {
  return { id: String(item.company_id), name: String(item.name ?? item.company_id) };
}
