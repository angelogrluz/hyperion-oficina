const KEY = "hyperion-oficina-tipos-servico";
const listeners = new Set<() => void>();

export type ServiceType = { id: string; name: string; minutes: number; active: boolean };

export const defaultServiceTypes: ServiceType[] = [
  { id: "tipo-revisao", name: "Revisão", minutes: 60, active: true },
  { id: "tipo-travoes", name: "Travões", minutes: 90, active: true },
  { id: "tipo-diagnostico", name: "Diagnóstico", minutes: 45, active: true },
  { id: "tipo-mecanica", name: "Mecânica geral", minutes: 120, active: true },
];

let rawCache = "\0";
let snap = defaultServiceTypes;

export function readServiceTypes(): ServiceType[] {
  if (typeof localStorage === "undefined") return defaultServiceTypes;
  const raw = localStorage.getItem(KEY) ?? "";
  if (raw === rawCache) return snap;
  rawCache = raw;
  if (!raw) {
    snap = defaultServiceTypes;
    return snap;
  }
  try {
    const parsed = JSON.parse(raw) as ServiceType[];
    snap = parsed.length ? parsed.map((item) => ({ ...item, minutes: Number(item.minutes) || 60, active: item.active !== false })) : defaultServiceTypes;
  } catch {
    snap = defaultServiceTypes;
  }
  return snap;
}

export function writeServiceTypes(items: ServiceType[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
  void import("@/browser/src/cloud").then((cloud) => cloud.afterLocalWrite());
  rawCache = "\0";
  listeners.forEach((listener) => listener());
}

export function subscribeServiceTypes(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
