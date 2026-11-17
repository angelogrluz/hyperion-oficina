import { readCloudUser } from "@/browser/src/cloud";
import { cloudBlankMode } from "@/lib/cloud-session";

const USERS_KEY = "hyperion-oficina-utilizadores";
const MATRIX_KEY = "hyperion-oficina-permissoes";
const CURRENT_KEY = "hyperion-oficina-utilizador-atual";
const listeners = new Set<() => void>();

export const ROLES = [
  { id: "admin", label: "Administrador" },
  { id: "gestor", label: "Gestor" },
  { id: "rececionista", label: "Rececionista" },
  { id: "mecanico", label: "Mecânico" },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

export const PERMISSION_GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Obras / Folhas de obra", items: [["obras.ver", "Ver"], ["obras.editar", "Criar / editar"], ["obras.apagar", "Apagar linhas"], ["obras.aprovar", "Aprovar"], ["obras.fechar", "Fechar processo"]] },
  { title: "Orçamentos", items: [["orcamentos.ver", "Ver"], ["orcamentos.criar", "Criar"]] },
  { title: "Faturação", items: [["faturacao.faturar", "Faturar"], ["faturacao.ver", "Ver faturas"]] },
  { title: "Preços, custos e margens", items: [["precos.ver", "Ver custos e margens"], ["precos.alterar", "Alterar preços"]] },
  { title: "Clientes e viaturas", items: [["clientes.ver", "Ver"], ["clientes.editar", "Editar"], ["clientes.contactos", "Ver contactos"]] },
  { title: "Compras a fornecedores", items: [["compras", "Aceder"]] },
  { title: "Movimentos de stock", items: [["movimentos", "Aceder"]] },
  { title: "Artigos / Stock", items: [["artigos.ver", "Ver"], ["artigos.editar", "Editar"]] },
  { title: "Relatórios", items: [["relatorios", "Ver relatórios e estatísticas"]] },
  { title: "Configurações", items: [["config.empresa", "Dados da empresa"], ["config.precos", "Preços e taxas"], ["config.utilizadores", "Utilizadores e permissões"]] },
  { title: "Oficina", items: [["oficina", "Modo oficina"], ["tecnicos", "Página Técnicos"], ["pontos", "Página de Pontos"]] },
];

export const PERMISSION_IDS = PERMISSION_GROUPS.flatMap((group) => group.items.map(([id]) => id));

export type WorkshopUser = {
  id: string;
  name: string;
  login: string;
  email: string;
  role: RoleId;
  active: boolean;
  technician: boolean;
  clocksIn: boolean;
  pin: string;
  linked?: boolean;
};

export type PermissionMatrix = Record<Exclude<RoleId, "admin">, Record<string, boolean>>;

export const installationUsers: WorkshopUser[] = [
  { id: "u-angelo", name: "Angelo Luz", login: "angelo", email: "", role: "admin", active: true, technician: true, clocksIn: false, pin: "1234" },
  { id: "u-joao", name: "João", login: "joao", email: "", role: "mecanico", active: true, technician: true, clocksIn: true, pin: "1111" },
  { id: "u-bernardo", name: "Bernardo", login: "bernardo", email: "", role: "mecanico", active: true, technician: true, clocksIn: true, pin: "2222" },
];

function allTrue() {
  return Object.fromEntries(PERMISSION_IDS.map((id) => [id, true]));
}

export function defaultMatrix(): PermissionMatrix {
  const gestor = allTrue();
  gestor["config.utilizadores"] = false;
  const rececionista = Object.fromEntries(PERMISSION_IDS.map((id) => [id, false]));
  for (const id of ["obras.ver", "obras.editar", "orcamentos.ver", "orcamentos.criar", "clientes.ver", "clientes.editar", "clientes.contactos", "oficina", "tecnicos", "pontos"]) {
    rececionista[id] = true;
  }
  const mecanico = Object.fromEntries(PERMISSION_IDS.map((id) => [id, false]));
  for (const id of ["oficina", "pontos", "obras.ver"]) mecanico[id] = true;
  return { gestor, rececionista, mecanico };
}

function notify() {
  listeners.forEach((listener) => listener());
}

const cache = new Map<string, { raw: string; value: unknown }>();

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  const raw = localStorage.getItem(key) ?? "";
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value = fallback;
  if (raw) {
    try { value = JSON.parse(raw) as T; } catch { value = fallback; }
  }
  cache.set(key, { raw, value });
  return value;
}

let usersSnap = installationUsers;
let usersRaw = "\0";

const emptyUser: WorkshopUser = {
  id: "", name: "", login: "", email: "", role: "mecanico", active: true, technician: false, clocksIn: false, pin: "",
};

export function readUsers(): WorkshopUser[] {
  const stored = typeof localStorage === "undefined" ? "" : localStorage.getItem(USERS_KEY) ?? "";
  const cloud = cloudBlankMode();
  const raw = `${cloud ? "c" : "l"}:${stored}`;
  if (raw === usersRaw) return usersSnap;
  usersRaw = raw;
  const demo = cloud ? [] : installationUsers;
  if (!stored) {
    usersSnap = demo;
    return usersSnap;
  }
  try {
    const parsed = JSON.parse(stored) as WorkshopUser[];
    if (!parsed.length) {
      usersSnap = demo;
      return usersSnap;
    }
    const defaults = new Map(installationUsers.map((user) => [user.id, user.pin]));
    let persist = false;
    usersSnap = parsed.map((user) => {
      const storedPin = typeof user.pin === "string" ? user.pin : "";
      const pin = cloud ? storedPin : (storedPin.trim() ? storedPin : (defaults.get(user.id) ?? ""));
      if (pin !== storedPin) persist = true;
      return {
        ...(cloud ? emptyUser : installationUsers[0]),
        ...user,
        role: ROLES.some((role) => role.id === user.role) ? user.role : "mecanico",
        pin,
        technician: Boolean(user.technician),
        clocksIn: Boolean(user.clocksIn),
        active: user.active !== false,
      };
    });
    if (persist && !cloud && typeof localStorage !== "undefined") {
      const patched = parsed.map((user) => {
        const storedPin = typeof user.pin === "string" ? user.pin : "";
        const pin = storedPin.trim() ? storedPin : (defaults.get(user.id) ?? "");
        return pin === storedPin ? user : { ...user, pin };
      });
      const nextRaw = JSON.stringify(patched);
      localStorage.setItem(USERS_KEY, nextRaw);
      usersRaw = `${cloud ? "c" : "l"}:${nextRaw}`;
    }
  } catch {
    usersSnap = demo;
  }
  return usersSnap;
}

export function writeUsers(users: WorkshopUser[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  notify();
  void import("@/browser/src/cloud").then((cloud) => cloud.afterLocalWrite());
}

let matrixSnap = defaultMatrix();
let matrixRaw = "\0";

export function readMatrix(): PermissionMatrix {
  const raw = typeof localStorage === "undefined" ? "" : localStorage.getItem(MATRIX_KEY) ?? "";
  if (raw === matrixRaw) return matrixSnap;
  matrixRaw = raw;
  const base = defaultMatrix();
  if (raw) {
    try {
      const stored = JSON.parse(raw) as Partial<PermissionMatrix>;
      for (const role of ["gestor", "rececionista", "mecanico"] as const) base[role] = { ...base[role], ...stored[role] };
    } catch { /* keep defaults */ }
  }
  matrixSnap = base;
  return matrixSnap;
}

export function writeMatrix(matrix: PermissionMatrix) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MATRIX_KEY, JSON.stringify(matrix));
  notify();
  void import("@/browser/src/cloud").then((cloud) => cloud.afterLocalWrite());
}

export function readCurrentUserId() {
  if (typeof localStorage === "undefined") return "u-angelo";
  return localStorage.getItem(CURRENT_KEY) || "u-angelo";
}

export function writeCurrentUserId(id: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CURRENT_KEY, id);
  notify();
}

function companyOwnerSignedIn() {
  const cloud = readCloudUser();
  return cloud?.companyStatus === "active" && cloud.role === "owner";
}

export function currentUser() {
  const users = readUsers();
  return users.find((user) => user.id === readCurrentUserId() && user.active)
    ?? users.find((user) => user.role === "admin" && user.active)
    ?? users[0]
    ?? (companyOwnerSignedIn() ? ownerPlaceholder() : undefined);
}

function ownerPlaceholder(): WorkshopUser {
  const cloud = readCloudUser();
  return {
    id: cloud?.userId ?? "owner",
    name: "Admin",
    login: "admin",
    email: cloud?.email ?? "",
    role: "admin",
    active: true,
    technician: false,
    clocksIn: false,
    pin: "",
  };
}

export function can(permission: string, user = currentUser()) {
  if (companyOwnerSignedIn()) return true;
  if (!user?.active) return false;
  if (user.role === "admin") return true;
  return Boolean(readMatrix()[user.role]?.[permission]);
}

export function pinMatches(userId: string, pin: string) {
  const user = readUsers().find((item) => item.id === userId);
  return Boolean(user?.pin && user.pin === pin.trim());
}

export function subscribeAccess(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
