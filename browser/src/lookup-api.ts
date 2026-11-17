import { readCloudUser, supabase } from "@/browser/src/cloud";

function companyId() {
  return readCloudUser()?.companyId ?? "";
}

async function call(name: string, body: Record<string, unknown>) {
  const db = supabase();
  if (!db) return { error: "O servidor ainda não está configurado." };
  const { data, error } = await db.functions.invoke(name, { body: { company_id: companyId(), ...body } });
  if (error) return { error: "Esta ligação ainda não está publicada no servidor." };
  return (data ?? {}) as Record<string, unknown>;
}

export async function nifStatus() {
  const result = await call("nif-lookup", { action: "status" });
  return { configured: result.configured === true, error: typeof result.error === "string" ? result.error : "" };
}

export async function saveNifKey(apiKey: string) {
  const result = await call("nif-lookup", { action: "save", api_key: apiKey });
  return { ok: result.ok === true, error: typeof result.error === "string" ? result.error : "" };
}

export async function lookupNif(nif: string) {
  const result = await call("nif-lookup", { action: "lookup", nif });
  if (typeof result.error === "string") return { ok: false as const, error: result.error };
  return {
    ok: true as const,
    name: String(result.name ?? ""),
    address: String(result.address ?? ""),
    postalCode: String(result.postalCode ?? ""),
    city: String(result.city ?? ""),
  };
}

export async function plateStatus() {
  const result = await call("plate-lookup", { action: "status" });
  return {
    providerLabel: String(result.providerLabel ?? "A definir"),
    hasKey: result.hasKey === true,
    enabled: result.enabled === true,
    message: String(result.message ?? ""),
    error: typeof result.error === "string" ? result.error : "",
  };
}

export async function savePlateKey(moduleKey: string) {
  const result = await call("plate-lookup", { action: "save", module_key: moduleKey });
  return { ok: result.ok === true, error: typeof result.error === "string" ? result.error : "", message: String(result.message ?? "") };
}

export async function lookupPlateRemote(plate: string) {
  const result = await call("plate-lookup", { action: "lookup", plate });
  if (typeof result.error === "string") return { found: false as const, message: result.error, disabled: result.disabled === true };
  const vehicle = result.vehicle as Record<string, unknown> | undefined;
  if (!vehicle) return { found: false as const, message: "Sem dados para esta matrícula." };
  return { found: true as const, cached: result.cached === true, vehicle };
}

export async function listPlateLookups(year: number, month: number) {
  const result = await call("plate-lookup", { action: "list", year, month });
  const rows = Array.isArray(result.rows) ? result.rows as Array<{ plate: string; lookedUpAt: string; brand: string; model: string }> : [];
  return { rows, error: typeof result.error === "string" ? result.error : "" };
}
