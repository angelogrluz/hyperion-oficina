const SESSION_KEY = "hcl_browser_session";

export type LoginState = { error?: string } | null;

function basePath() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

export function readSession(): { email: string; name: string } | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { email: string; name: string };
  } catch {
    return null;
  }
}

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (email !== "admin@hyperioncarlab.pt" || password !== "oficina") {
    return { error: "E-mail ou palavra-passe incorretos." };
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email, name: "Rita Almeida" }));
  const from = String(formData.get("from") ?? "/");
  const path = from.startsWith("/") && !from.startsWith("//") ? from : "/";
  window.location.assign(`${basePath()}${path}`);
  return null;
}

export async function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.assign(`${import.meta.env.BASE_URL}entrar`);
}
