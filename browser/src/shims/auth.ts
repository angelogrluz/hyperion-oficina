import { pinMatches, readUsers, writeCurrentUserId, type RoleId } from "@/lib/user-settings";
import { cloudConfigured, readCloudUser, signOut } from "../cloud";

const SESSION_KEY = "hcl_browser_session";

export type Session = { userId: string; name: string; role: RoleId; email?: string };
export type LoginState = { error?: string } | null;

function basePath() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

export function readSession(): Session | null {
  if (cloudConfigured()) {
    const user = readCloudUser();
    if (!user || user.role === "tecnico") return null;
    return { userId: user.userId, name: user.email, role: "admin", email: user.email };
  }
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed.userId || !parsed.role || !parsed.name || parsed.role === "mecanico") return null;
    return { userId: parsed.userId, name: parsed.name, role: parsed.role };
  } catch {
    return null;
  }
}

function officeNameMatch(user: { name: string; login: string }, query: string) {
  const full = user.name.trim().toLocaleLowerCase("pt-PT");
  const first = full.split(/\s+/)[0] ?? "";
  const login = user.login.trim().toLocaleLowerCase("pt-PT");
  return query === full || (first !== "" && query === first) || (login !== "" && query === login);
}

export function loginWithNamePin(name: string, pin: string): { error: string } | { session: Session } {
  const query = name.trim().toLocaleLowerCase("pt-PT");
  const user = readUsers().find((item) => item.active && officeNameMatch(item, query));
  if (!user || user.role === "mecanico") return { error: "Utilizador ou PIN incorretos." };
  if (!user.pin) return { error: "Este utilizador ainda não tem PIN. Peça a um administrador para o definir." };
  if (!pinMatches(user.id, pin)) return { error: "Utilizador ou PIN incorretos." };
  const session = { userId: user.id, name: user.name, role: user.role };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  writeCurrentUserId(user.id);
  return { session };
}

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const result = loginWithNamePin(String(formData.get("name") ?? ""), String(formData.get("pin") ?? ""));
  if ("error" in result) return { error: result.error };
  window.location.assign(`${basePath()}/`);
  return null;
}

export async function logout() {
  if (cloudConfigured()) await signOut();
  localStorage.removeItem(SESSION_KEY);
  window.location.assign(`${import.meta.env.BASE_URL}entrar`);
}
