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
  companies?: Array<{ id: string; name: string }>;
  series?: Array<{ id: string; name: string }>;
  taxes?: Array<{ id: string; name: string; value: number }>;
  paymentMethods?: Array<{ id: string; name: string }>;
  error?: string;
};

async function call(body: Record<string, unknown>): Promise<MoloniStatus> {
  const db = supabase();
  if (!db) return { connected: false, status: "desligado", error: "O servidor ainda não está configurado." };
  const { data, error } = await db.functions.invoke("moloni", { body });
  if (error) return { connected: false, status: "desligado", error: "A função Moloni ainda não está publicada no servidor." };
  return (data ?? { connected: false, status: "desligado" }) as MoloniStatus;
}

export function moloniStatus(companyId: string) {
  return call({ action: "status", company_id: companyId });
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

export function moloniDisconnect(companyId: string) {
  return call({ action: "disconnect", company_id: companyId });
}

export async function issueCloudDocument(input: {
  companyId: string;
  kind: "fatura" | "orcamento";
  orderNumber: string;
  paymentMethod?: string;
  total: number;
  customer: Record<string, string>;
  lines: Array<Record<string, number | string>>;
}): Promise<MoloniIssued | null> {
  const db = supabase();
  if (!db || !input.companyId) return null;
  const status = await moloniStatus(input.companyId);
  if (status.error && !status.connected) return null;
  if (!status.connected) return null;
  const { data, error } = await db.functions.invoke("moloni", {
    body: {
      action: "issue",
      company_id: input.companyId,
      kind: input.kind,
      order_number: input.orderNumber,
      payment_method: input.paymentMethod,
      total: input.total,
      customer: input.customer,
      lines: input.lines,
    },
  });
  if (error) throw new Error("Não foi possível falar com a Moloni.");
  const payload = data as (MoloniIssued & { error?: string }) | null;
  if (!payload || payload.error) throw new Error(payload?.error || "A Moloni recusou o documento.");
  return payload;
}
