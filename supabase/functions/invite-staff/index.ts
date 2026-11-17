// Invite a staff member into an existing workshop.
// Deploy from the Supabase dashboard (Edge Functions → Deploy new function → name: invite-staff).
// Paste this file as index.ts. The platform injects SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
// Optional secret SITE_URL (default https://app.oficinaplan.com). Set it to https://oficinaplan.com after the apex domain is live.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED = new Set(["admin", "gestor", "rececionista", "mecanico"]);
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
    const site = (Deno.env.get("SITE_URL") ?? "https://app.oficinaplan.com").replace(/\/$/, "");
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Sessão em falta." }, 401);
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "");
    const name = String(body.name ?? "").trim();
    const companyId = String(body.company_id ?? "");
    if (!email || !email.includes("@")) return json({ error: "E-mail inválido." }, 400);
    if (!ALLOWED.has(role)) return json({ error: "Função inválida." }, 400);
    if (!companyId) return json({ error: "Oficina em falta." }, 400);
    const admin = createClient(url, service);
    const { data: membership } = await admin
      .from("memberships")
      .select("role, active, companies(status, slug)")
      .eq("user_id", userData.user.id)
      .eq("company_id", companyId)
      .maybeSingle();
    const company = Array.isArray(membership?.companies) ? membership?.companies[0] : membership?.companies;
    if (!membership || membership.active === false || !company || company.status !== "active") {
      return json({ error: "Sem permissão para convidar nesta oficina." }, 403);
    }
    if (membership.role !== "owner" && membership.role !== "admin") {
      return json({ error: "Só o administrador pode convidar." }, 403);
    }
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error: inviteError } = await admin.from("staff_invites").insert({
      company_id: companyId,
      email,
      role,
      name: name || email,
      token,
      created_by: userData.user.id,
    });
    if (inviteError) return json({ error: "Não foi possível criar o convite." }, 500);
    const redirectTo = `${site}/${company.slug ?? ""}`;
    const { error: mailError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { invite_token: token, full_name: name },
    });
    if (mailError) {
      const message = mailError.message.toLowerCase();
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        return json({ ok: true, existing: true, message: "Esta pessoa já tem conta. Quando entrar no link da oficina, o acesso fica ligado." });
      }
      return json({ error: "Não foi possível enviar o convite. Confirma o e-mail." }, 400);
    }
    return json({ ok: true, message: "Convite enviado." });
  } catch {
    return json({ error: "Não foi possível enviar o convite." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
