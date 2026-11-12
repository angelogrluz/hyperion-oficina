const KEY = "hyperion-oficina-nav";

function read(): string[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordPath(path: string) {
  if (!path || path.startsWith("/entrar")) return;
  const stack = read();
  if (stack.at(-1) === path) return;
  stack.push(path);
  sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-30)));
}

export function goBack(): string | null {
  const stack = read();
  if (stack.length < 2) return null;
  stack.pop();
  sessionStorage.setItem(KEY, JSON.stringify(stack));
  return stack.at(-1) ?? null;
}
