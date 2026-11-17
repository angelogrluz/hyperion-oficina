// NIF.pt lookup. Deploy as Edge Function name: nif-lookup. JWT verification ON.
// Each workshop stores its own key. The browser never reads the key.
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
    if (action === "status") {
      const { data } = await admin.from("nif_connections").select("company_id").eq("company_id", companyId).maybeSingle();
      return json({ configured: Boolean(data) });
    }
    if (action === "save") {
      if (member.role !== "owner" && member.role !== "admin") return json({ error: "Só o administrador pode guardar a chave." }, 403);
      const apiKey = String(body.api_key ?? "").trim();
      if (apiKey.length < 8) return json({ error: "A chave é demasiado curta." });
      const { error } = await admin.from("nif_connections").upsert({ company_id: companyId, api_key: apiKey, updated_at: new Date().toISOString() });
      if (error) return json({ error: "Não foi possível guardar a chave." }, 500);
      return json({ ok: true, configured: true });
    }
    const nif = String(body.nif ?? "").replace(/\D/g, "");
    if (nif.length !== 9) return json({ error: "O NIF tem de ter 9 dígitos." });
    const { data: connection } = await admin.from("nif_connections").select("api_key").eq("company_id", companyId).maybeSingle();
    if (!connection?.api_key) return json({ error: "Ainda não há chave de pesquisa de NIF nesta oficina." });
    const response = await fetch(`https://www.nif.pt/?json=1&q=${encodeURIComponent(nif)}&key=${encodeURIComponent(connection.api_key)}`);
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || payload.result === "error") return json({ error: "A pesquisa de NIF não devolveu dados. Confirma a chave e o NIF." });
    const records = payload.records as Record<string, Record<string, unknown>> | Array<Record<string, unknown>> | undefined;
    const record = Array.isArray(records) ? records[0] : records?.[nif] ?? (records ? Object.values(records)[0] : null);
    if (!record) return json({ error: "Não encontrámos este NIF." });
    const pc4 = String(record.pc4 ?? "");
    const pc3 = String(record.pc3 ?? "");
    const postal = record.postal_code || record.pc || (pc4 && pc3 ? `${pc4}-${pc3}` : pc4);
    return json({
      ok: true,
      name: String(record.title || record.name || record.alias || ""),
      address: String(record.address || record.address_line || ""),
      postalCode: String(postal ?? ""),
      city: String(record.city || record.place || record.municipality || ""),
    });
  } catch {
    return json({ error: "Não foi possível pesquisar o NIF." }, 500);
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
