import { supabase } from "@/browser/src/cloud";

export async function signInWithUsername(slug: string, username: string, secret: string) {
  const db = supabase();
  if (!db) return { error: "O servidor ainda não está configurado." };
  const { data, error } = await db.functions.invoke("staff-access", {
    body: { action: "login", slug, username, secret },
  });
  if (error || !data || data.error) {
    return { error: data?.error || "O acesso por utilizador ainda não está publicado no servidor." };
  }
  const session = await db.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  if (session.error || !session.data.session) return { error: "Não foi possível abrir a sessão." };
  const { bootCloud } = await import("@/browser/src/cloud");
  const user = await bootCloud();
  if (!user) return { error: "A conta entrou, mas ainda não tem oficina." };
  return { user };
}

export async function forgotOwnerPassword(slug: string, username: string) {
  const db = supabase();
  if (!db) return { error: "O servidor ainda não está configurado." };
  const { data, error } = await db.functions.invoke("staff-access", { body: { action: "forgot", slug, username } });
  if (error) return { error: "Não foi possível enviar o pedido." };
  return { message: data?.message || "Se este utilizador for o administrador, enviámos um e-mail para repor a palavra-passe." };
}

export async function saveStaffAccess(input: { companyId: string; username: string; name: string; role: string; pin: string; userId?: string }) {
  const db = supabase();
  if (!db) return { error: "O servidor ainda não está configurado." };
  const { data, error } = await db.functions.invoke("staff-access", {
    body: {
      action: "save",
      company_id: input.companyId,
      username: input.username,
      name: input.name,
      role: input.role,
      pin: input.pin,
      user_id: input.userId ?? "",
    },
  });
  if (error) return { error: "A gestão de colaboradores ainda não está publicada no servidor." };
  if (data?.error) return { error: String(data.error) };
  return { userId: String(data?.user_id ?? "") };
}

export async function setStaffActive(companyId: string, userId: string, active: boolean) {
  const db = supabase();
  if (!db) return { error: "O servidor ainda não está configurado." };
  const { data, error } = await db.functions.invoke("staff-access", {
    body: { action: active ? "activate" : "deactivate", company_id: companyId, user_id: userId },
  });
  if (error) return { error: "Não foi possível atualizar o acesso." };
  if (data?.error) return { error: String(data.error) };
  return { ok: true as const };
}
