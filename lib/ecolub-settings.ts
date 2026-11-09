import { ecolubDefaults } from "@/src/config";

const KEY = "hyperion-oficina-ecolub-rate";
const listeners = new Set<() => void>();

export function readEcolubRate() {
  if (typeof localStorage === "undefined") return ecolubDefaults.rate;
  const raw = localStorage.getItem(KEY);
  if (raw == null || raw === "") return ecolubDefaults.rate;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : ecolubDefaults.rate;
}

export function writeEcolubRate(rate: number) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, String(rate));
  for (const listener of listeners) listener();
}

export function subscribeEcolubRate(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
