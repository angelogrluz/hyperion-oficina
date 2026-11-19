import { supabase } from "@/browser/src/cloud";
import type { MoloniIssued } from "@/lib/moloni/service";

export type MoloniStatus = {
  connected: boolean;
  status: "ligado" | "desligado";
  needsPassword?: boolean;
  username?: string;
  developerId?: string;
  moloniCompanyId?: string | null;
  moloniCompanyName?: string | null;
  seriesFatura?: string | null;
  seriesFaturaRecibo?: string | null;
  seriesOrcamento?: string | null;
  taxId?: string | null;
  payments?: Record<string, string>;
  issueAs?: "fatura" | "fatura_recibo";
  testMode?: boolean;
  hasSecret?: boolean;
  companies?: Array<{ id: string; name: string }>;
  series?: Array<{ id: string; name: string }>;
  taxes?: Array<{ id: string; name: string; value: number }>;
  paymentMethods?: Array<{ id: string; name: string }>;
  error?: string;
  catalogErrors?: string[];
};

function generic(message: string) {
  return message.replace(/Moloni/g, "o programa de faturação");
}

async function call(body: Record<string, unknown>): Promise<MoloniStatus> {
  const db = supabase();
  if (!db) return { connected: false, status: "desligado", error: "O servidor ainda não está configurado." };
  const action = String(body.action ?? "");
  let result: { data: unknown; error: unknown };
  try {
    result = await Promise.race([
      db.functions.invoke("moloni", { body }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 60_000)),
    ]) as { data: unknown; error: unknown };
  } catch {
    console.error("[faturação]", action, "sem resposta em 60 s");
    return { connected: false, status: "desligado", error: "O servidor de faturação não respondeu a tempo. Tenta outra vez." };
  }
  const { data, error } = result;
  if (error) {
    const httpStatus = (error as { context?: { status?: number } })?.context?.status;
    console.error("[faturação]", action, "falhou", httpStatus ?? "", error);
    return { connected: false, status: "desligado", error: `Falha ao falar com o servidor de faturação${httpStatus ? ` (HTTP ${httpStatus})` : ""}. Tenta outra vez.` };
  }
  const payload = (data ?? { connected: false, status: "desligado" }) as MoloniStatus;
  if (payload.error) payload.error = generic(payload.error);
  return payload;
}

const statusCache = new Map<string, { at: number; value: MoloniStatus }>();

export function moloniStatus(companyId: string) {
  return call({ action: "status", company_id: companyId }).then((value) => {
    statusCache.set(companyId, { at: Date.now(), value: value as MoloniStatus });
    return value;
  });
}

/** Recent status (≤ 2 min) without another round trip; used right before issuing. */
function recentStatus(companyId: string) {
  const hit = statusCache.get(companyId);
  return hit && Date.now() - hit.at < 120_000 && hit.value.connected ? Promise.resolve(hit.value) : moloniStatus(companyId);
}

export function moloniConnect(companyId: string, input: { developerId: string; clientSecret: string; username: string; password: string }) {
  return call({
    action: "connect",
    company_id: companyId,
    developer_id: input.developerId,
    client_secret: input.clientSecret,
    username: input.username,
    password: input.password,
  });
}

export function moloniCatalog(companyId: string) {
  return call({ action: "catalog", company_id: companyId });
}

export function moloniSave(companyId: string, input: Record<string, unknown>) {
  return call({ action: "save", company_id: companyId, ...input });
}

/** Read-only: how documents are set to print (connected company and, optionally, another of the account). */
export async function moloniDiagnose(companyId: string, otherCompanyId?: string) {
  const db = supabase();
  if (!db) return { error: "Sem sessão." } as { error?: string; report?: unknown; companies?: Array<{ id: string; name: string }> };
  const { data, error } = await db.functions.invoke("moloni", { body: { action: "diagnose", company_id: companyId, other_company_id: otherCompanyId || undefined } });
  if (error) return { error: "Não foi possível ler as definições." };
  return data as { error?: string; report?: unknown; companies?: Array<{ id: string; name: string }> };
}

export function moloniDisconnect(companyId: string) {
  return call({ action: "disconnect", company_id: companyId });
}

export async function issueCloudDocument(input: {
  companyId: string;
  kind: "fatura" | "orcamento";
  orderId?: string;
  orderNumber: string;
  paymentMethod?: string;
  total: number;
  customer: Record<string, string>;
  lines: Array<Record<string, number | string>>;
}): Promise<MoloniIssued | null> {
  const db = supabase();
  if (!db || !input.companyId) return null;
  const status = await recentStatus(input.companyId);
  if (status.error && !status.connected) return null;
  if (!status.connected) return null;
  const { data, error } = await db.functions.invoke("moloni", {
    body: {
      action: "issue",
      company_id: input.companyId,
      kind: input.kind,
      order_id: input.orderId,
      order_number: input.orderNumber,
      payment_method: input.paymentMethod,
      total: input.total,
      customer: input.customer,
      lines: input.lines,
    },
  });
  if (error) throw new Error("Não foi possível falar com o programa de faturação.");
  const payload = data as (MoloniIssued & { error?: string; testMode?: boolean; demoAccount?: boolean }) | null;
  if (!payload || payload.error) throw new Error(generic(payload?.error || "O programa de faturação recusou o documento."));
  return {
    ...payload,
    providerLabel: payload.demoAccount ? "Conta de teste" : payload.testMode ? "Rascunho de teste" : "Fatura certificada",
    // A document created in the connected account is never a simulation, even in a demo («conta de teste»)
    // company or as a test draft: its official PDF exists there. «simulated» is only for local mock invoices.
    simulated: false,
  };
}

export async function officialDocumentPdf(input: {
  companyId: string;
  number: string;
  kind: "fatura" | "recibo";
  documentId?: string | null;
  invoiceDocumentId?: string | null;
}): Promise<{ found: boolean; url?: string; documentId?: string; documentType?: string; error?: string; reason?: string }> {
  // The function returns the official PDF bytes; a just-issued document may need a few seconds.
  for (let attempt = 0; ; attempt += 1) {
    const result = await fetchOfficialPdf(input);
    if (result.reason !== "pending" || attempt >= 2) return result;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

function pdfObjectUrl(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  window.setTimeout(() => URL.revokeObjectURL(url), 30 * 60_000);
  return url;
}

/** Opens a tab right away (inside the click, so it is not blocked) and points it at the PDF when ready. */
export function pdfTab() {
  const tab = typeof window === "undefined" ? null : window.open("", "_blank");
  if (tab) {
    try {
      tab.document.title = "A abrir o documento…";
      tab.document.body.innerHTML = '<p style="font:16px system-ui,sans-serif;padding:24px;color:#333">A abrir o documento…</p>';
    } catch {
      /* cross-origin about:blank is not expected; ignore */
    }
  }
  return {
    show(url: string) {
      if (tab && !tab.closed) tab.location.href = url;
      else openDocumentUrl(url);
    },
    close() {
      if (tab && !tab.closed) tab.close();
    },
  };
}

export function openDocumentUrl(url: string) {
  // blob: URLs are our own PDF copy (same origin); external links open isolated.
  return url.startsWith("blob:") ? window.open(url, "_blank") : window.open(url, "_blank", "noopener");
}

async function fetchOfficialPdf(input: {
  companyId: string;
  number: string;
  kind: "fatura" | "recibo";
  documentId?: string | null;
  invoiceDocumentId?: string | null;
}): Promise<{ found: boolean; url?: string; documentId?: string; documentType?: string; error?: string; reason?: string }> {
  const db = supabase();
  if (!db || !input.companyId) return { found: false, reason: "no_session" };
  const { data, error } = await db.functions.invoke("moloni", {
    body: {
      action: "pdf",
      as: "pdf",
      company_id: input.companyId,
      number: input.number,
      kind: input.kind,
      document_id: input.kind === "fatura" ? input.documentId || undefined : undefined,
      invoice_document_id: input.kind === "recibo" ? input.invoiceDocumentId || undefined : undefined,
    },
  });
  if (error) {
    console.info("[oficinaplan] documento", "invoke_error");
    return { found: false, reason: "invoke_error", error: "A consulta do documento ainda não está publicada. Abre a vista da aplicação." };
  }
  const payload = (data ?? {}) as { found?: boolean; pdf?: string; documentId?: string; documentType?: string; error?: string; reason?: string; detail?: string };
  console.info("[oficinaplan] documento", payload.reason ?? (payload.found ? "ok" : "no_match"), payload.detail ?? "");
  if (payload.error) return { found: false, reason: payload.reason, error: generic(payload.error) };
  if (!payload.found || !payload.pdf) return { found: false, reason: payload.reason ?? "no_match" };
  return { found: true, url: pdfObjectUrl(payload.pdf), documentId: payload.documentId, documentType: payload.documentType };
}
