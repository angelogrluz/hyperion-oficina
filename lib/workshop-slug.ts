export const RESERVED_SLUGS = [
  "admin",
  "entrar",
  "registar",
  "api",
  "www",
  "app",
  "oficina",
  "assets",
  "modo-oficina",
  "administracao",
  "static",
  "login",
  "signup",
  "registo",
] as const;

const PUBLIC_PATHS = new Set(["/entrar", "/registar", "/admin"]);

let activeSlug = "";

export function setActiveSlug(slug: string | null) {
  activeSlug = slug?.trim().toLowerCase() ?? "";
}

export function getActiveSlug() {
  return activeSlug;
}

export function suggestSlug(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (base.length < 2) return "";
  if ((RESERVED_SLUGS as readonly string[]).includes(base)) return "";
  return base;
}

export function slugError(slug: string) {
  const value = slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return "Usa só letras minúsculas, números e hífens.";
  if (value.length < 2 || value.length > 40) return "O endereço deve ter entre 2 e 40 caracteres.";
  if ((RESERVED_SLUGS as readonly string[]).includes(value)) return "Este endereço está reservado.";
  return "";
}

export function slugMatches(user: { slug?: string | null; companyName?: string | null }, slug: string) {
  const wanted = slug.trim().toLowerCase();
  if (user.slug) return user.slug === wanted;
  const name = user.companyName ?? "";
  if (name.toLowerCase().includes("hyperion") && wanted === "hyperion") return true;
  return suggestSlug(name) === wanted;
}

export function workshopPath(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const path = cut === -1 ? href : href.slice(0, cut);
  const tail = cut === -1 ? "" : href.slice(cut);
  if (PUBLIC_PATHS.has(path) || path.startsWith("/admin/") || path.startsWith("/entrar")) return href;
  if (!activeSlug) return href;
  if (path === `/${activeSlug}` || path.startsWith(`/${activeSlug}/`)) return href;
  if (path === "/") return `/${activeSlug}${tail}`;
  return `/${activeSlug}${path}${tail}`;
}

export function stripWorkshopPrefix(pathname: string) {
  if (!activeSlug) return pathname;
  if (pathname === `/${activeSlug}`) return "/";
  if (pathname.startsWith(`/${activeSlug}/`)) return pathname.slice(activeSlug.length + 1) || "/";
  return pathname;
}

export const OFFICE_ROLES = new Set(["owner", "admin", "gestor", "rececionista"]);
