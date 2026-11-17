// Staff usernames and PINs. Deploy as Edge Function name: staff-access.
// JWT verification OFF: the login happens before there is a session.
// The platform injects SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
// PIN choice: staff use a 6-digit PIN, which is the Supabase password (minimum 6). No padding.
// The owner username is admin and keeps the existing password. This function never updates that password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ROLES = new Set(["admin", "gestor", "rececionista", "mecanico"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método inválido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(url, service);
    const body = await req.json();
    const action = String(body.action ?? "");
    if (action === "login") return json(await login(admin, url, anon, body));
    if (action === "forgot") return json(await forgot(admin, url, body));
    const caller = await callerUser(url, anon, req);
    if (!caller) return json({ error: "Sessão inválida." }, 401);
    if (action === "save") return json(await saveStaff(admin, caller.id, body));
    if (action === "deactivate" || action === "activate") return json(await setActive(admin, caller.id, body, action === "activate"));
    return json({ error: "Pedido inválido." }, 400);
  } catch {
    return json({ error: "Não foi possível concluir o pedido." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function callerUser(url: string, anon: string, req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return null;
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

async function companyBySlug(admin: ReturnType<typeof createClient>, slug: string) {
  const wanted = slug.trim().toLowerCase();
  const { data } = await admin.from("companies").select("id, status, slug").eq("slug", wanted).maybeSingle();
  return data;
}

async function ownerAccount(admin: ReturnType<typeof createClient>, companyId: string) {
  const { data } = await admin.from("memberships").select("user_id, active").eq("company_id", companyId).eq("role", "owner").order("created_at").limit(1).maybeSingle();
  return data;
}

async function login(admin: ReturnType<typeof createClient>, url: string, anon: string, body: Record<string, unknown>) {
  const slug = String(body.slug ?? "");
  const username = String(body.username ?? "").trim().toLowerCase();
  const secret = String(body.secret ?? "");
  const company = await companyBySlug(admin, slug);
  if (!company || company.status === "suspended") return { error: "Esta oficina não está disponível." };
  if (!username || !secret) return { error: "Utilizador ou PIN incorretos." };
  let userId = "";
  let active = true;
  if (username === "admin") {
    const owner = await ownerAccount(admin, company.id);
    if (!owner) return { error: "Utilizador ou PIN incorretos." };
    userId = owner.user_id;
    active = owner.active !== false;
  } else {
    const { data } = await admin.from("staff_accounts").select("user_id, active, kind").eq("company_id", company.id).eq("username", username).maybeSingle();
    if (!data || data.kind === "owner") return { error: "Utilizador ou PIN incorretos." };
    userId = data.user_id;
    active = data.active !== false;
  }
  if (!active) return { error: "O teu acesso a esta oficina está desativado." };
  const user = await admin.auth.admin.getUserById(userId);
  const email = user.data.user?.email ?? "";
  if (!email) return { error: "Utilizador ou PIN incorretos." };
  const signer = createClient(url, anon);
  const signed = await signer.auth.signInWithPassword({ email, password: secret });
  if (signed.error || !signed.data.session) return { error: "Utilizador ou PIN incorretos." };
  return {
    access_token: signed.data.session.access_token,
    refresh_token: signed.data.session.refresh_token,
    username,
  };
}

async function forgot(admin: ReturnType<typeof createClient>, url: string, body: Record<string, unknown>) {
  const company = await companyBySlug(admin, String(body.slug ?? ""));
  const username = String(body.username ?? "").trim().toLowerCase();
  if (!company || username !== "admin") return { message: "Se este utilizador for o administrador, enviámos um e-mail para repor a palavra-passe." };
  const owner = await ownerAccount(admin, company.id);
  const user = owner ? await admin.auth.admin.getUserById(owner.user_id) : null;
  const email = user?.data.user?.email ?? "";
  if (email && !email.endsWith("@staff.oficinaplan.invalid")) {
    const site = (Deno.env.get("SITE_URL") ?? "https://oficinaplan.com").replace(/\/$/, "");
    await admin.auth.resetPasswordForEmail(email, { redirectTo: `${site}/${company.slug}` });
  }
  return { message: "Se este utilizador for o administrador, enviámos um e-mail para repor a palavra-passe." };
}

async function assertManager(admin: ReturnType<typeof createClient>, callerId: string, companyId: string) {
  const { data } = await admin.from("memberships").select("role, active, companies(status)").eq("user_id", callerId).eq("company_id", companyId).maybeSingle();
  const company = Array.isArray(data?.companies) ? data?.companies[0] : data?.companies;
  if (!data || data.active === false || !company || company.status !== "active") return "Sem permissão nesta oficina.";
  if (data.role !== "owner" && data.role !== "admin") return "Só o administrador pode gerir a equipa.";
  return "";
}

async function saveStaff(admin: ReturnType<typeof createClient>, callerId: string, body: Record<string, unknown>) {
  const companyId = String(body.company_id ?? "");
  const username = String(body.username ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const role = String(body.role ?? "");
  const pin = String(body.pin ?? "").trim();
  const existingId = String(body.user_id ?? "");
  const denied = await assertManager(admin, callerId, companyId);
  if (denied) return { error: denied };
  if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(username)) return { error: "O utilizador só pode ter letras minúsculas, números, ponto ou hífen." };
  if (username === "admin") return { error: "O utilizador Admin é o dono da oficina e já tem palavra-passe." };
  if (!name) return { error: "Indica o nome." };
  if (!ROLES.has(role)) return { error: "Função inválida." };
  const { data: taken } = await admin.from("staff_accounts").select("user_id").eq("company_id", companyId).eq("username", username).maybeSingle();
  if (taken && taken.user_id !== existingId) return { error: "Já existe um colaborador com este utilizador." };
  if (existingId) {
    const { data: row } = await admin.from("staff_accounts").select("user_id, kind").eq("company_id", companyId).eq("user_id", existingId).maybeSingle();
    if (!row || row.kind === "owner") return { error: "Não é possível alterar esta conta." };
    if (pin && !/^\d{6}$/.test(pin)) return { error: "O PIN tem de ter 6 dígitos." };
    if (pin) {
      const updated = await admin.auth.admin.updateUserById(existingId, { password: pin });
      if (updated.error) return { error: "Não foi possível atualizar o PIN." };
    }
    await admin.from("staff_accounts").update({ username }).eq("company_id", companyId).eq("user_id", existingId);
    await admin.from("memberships").update({ role }).eq("company_id", companyId).eq("user_id", existingId);
    return { ok: true, user_id: existingId };
  }
  if (!/^\d{6}$/.test(pin)) return { error: "O PIN tem de ter 6 dígitos." };
  const email = `staff.${username}.${companyId.replace(/-/g, "")}@staff.oficinaplan.invalid`;
  const token = crypto.randomUUID().replace(/-/g, "");
  await admin.from("staff_invites").insert({ company_id: companyId, email, role, name, token, created_by: callerId });
  const created = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { full_name: name, staff_username: username },
  });
  if (created.error || !created.data.user) {
    await admin.from("staff_invites").delete().eq("token", token);
    return { error: "Não foi possível criar o colaborador." };
  }
  const userId = created.data.user.id;
  await admin.from("memberships").insert({ user_id: userId, company_id: companyId, role, active: true });
  await admin.from("staff_accounts").insert({ company_id: companyId, username, user_id: userId, kind: "staff", active: true });
  await admin.from("staff_invites").update({ used_at: new Date().toISOString() }).eq("token", token);
  return { ok: true, user_id: userId };
}

async function setActive(admin: ReturnType<typeof createClient>, callerId: string, body: Record<string, unknown>, active: boolean) {
  const companyId = String(body.company_id ?? "");
  const userId = String(body.user_id ?? "");
  const denied = await assertManager(admin, callerId, companyId);
  if (denied) return { error: denied };
  if (userId === callerId) return { error: "Não podes desativar a tua própria conta." };
  const { data: row } = await admin.from("staff_accounts").select("kind").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  const { data: member } = await admin.from("memberships").select("role").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  if (row?.kind === "owner" || member?.role === "owner") return { error: "O dono da oficina não pode ser desativado aqui." };
  await admin.from("staff_accounts").update({ active }).eq("company_id", companyId).eq("user_id", userId);
  await admin.from("memberships").update({ active }).eq("company_id", companyId).eq("user_id", userId);
  return { ok: true };
}
