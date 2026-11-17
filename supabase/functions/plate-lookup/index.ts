// Plate lookup cache. Deploy as Edge Function name: plate-lookup. JWT verification ON.
// The provider is still undecided. A key can be stored, but no paid lookup runs until a provider is chosen.
// A plate already stored is returned from the cache and is never queried again.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método inválido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);
    const admin = createClient(url, service);
    const body = await req.json();
    const companyId = String(body.company_id ?? "");
    const member = await membership(admin, userData.user.id, companyId);
    if (!member) return json({ error: "Sem permissão nesta oficina." }, 403);
    const action = String(body.action ?? "lookup");
    if (action === "status") return json(await status(admin, companyId));
    if (action === "save") {
      if (member.role !== "owner" && member.role !== "admin") return json({ error: "Só o administrador pode guardar a chave." }, 403);
      const moduleKey = String(body.module_key ?? "").trim();
      if (moduleKey.length < 4) return json({ error: "A chave é demasiado curta." });
      const { error } = await admin.from("plate_connections").upsert({
        company_id: companyId,
        provider: "a_definir",
        module_key: moduleKey,
        updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: "Não foi possível guardar a chave." }, 500);
      return json({ ok: true, ...(await status(admin, companyId)) });
    }
    if (action === "list") return json(await list(admin, companyId, Number(body.year), Number(body.month)));
    return json(await lookup(admin, companyId, String(body.plate ?? "")));
  } catch {
    return json({ error: "Não foi possível consultar a matrícula." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function membership(admin: ReturnType<typeof createClient>, userId: string, companyId: string) {
  if (!companyId) return null;
  const { data } = await admin.from("memberships").select("role, active, companies(status)").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
  const company = Array.isArray(data?.companies) ? data?.companies[0] : data?.companies;
  if (!data || data.active === false || !company || company.status !== "active") return null;
  return data;
}

function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function status(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data } = await admin.from("plate_connections").select("provider, module_key").eq("company_id", companyId).maybeSingle();
  const provider = data?.provider || "a_definir";
  const hasKey = Boolean(data?.module_key);
  return {
    provider: "a_definir",
    providerLabel: "A definir",
    hasKey,
    enabled: false,
    message: hasKey
      ? "A chave está guardada. A consulta fica desligada até escolhermos o fornecedor."
      : "O fornecedor da consulta de matrículas ainda está por definir.",
    storedProvider: provider,
  };
}

async function lookup(admin: ReturnType<typeof createClient>, companyId: string, rawPlate: string) {
  const plate = normalizePlate(rawPlate);
  if (plate.length < 5) return { error: "Indica a matrícula." };
  const { data: cached } = await admin.from("plate_lookups").select("payload, looked_up_at").eq("company_id", companyId).eq("plate", plate).maybeSingle();
  if (cached?.payload) return { ok: true, cached: true, plate, vehicle: cached.payload, lookedUpAt: cached.looked_up_at };
  const current = await status(admin, companyId);
  if (!current.enabled) return { error: current.message, disabled: true };
  return { error: "A consulta de matrículas ainda não tem fornecedor." };
}

async function list(admin: ReturnType<typeof createClient>, companyId: string, year: number, month: number) {
  const { data } = await admin.from("plate_lookups").select("plate, looked_up_at, payload").eq("company_id", companyId).order("looked_up_at", { ascending: false });
  const rows = (data ?? []).filter((row) => {
    const date = new Date(row.looked_up_at);
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  }).map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    return {
      plate: row.plate,
      lookedUpAt: row.looked_up_at,
      brand: String(payload.brand ?? ""),
      model: String(payload.model ?? ""),
    };
  });
  return { ok: true, rows };
}
