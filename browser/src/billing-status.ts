import { useEffect, useSyncExternalStore } from "react";
import { cloudActive, readCloudUser } from "@/browser/src/cloud";
import { moloniStatus } from "@/browser/src/moloni";

/** What invoicing will do right now, known before the Faturar dialog opens. */
export type BillingState = {
  loaded: boolean;
  mode: "simulacao" | "teste" | "real";
  companyName: string;
  demoAccount: boolean;
  payments: Record<string, string>;
  error: string;
};

const initial: BillingState = { loaded: false, mode: "simulacao", companyName: "", demoAccount: false, payments: {}, error: "" };
let state: BillingState = initial;
let loadedFor = "";
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: BillingState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function isDemoCompanyName(name: string) {
  return /\b(demo|demonstra|teste?s?|test|exemplo|sandbox|fict[ií]cia)/i.test(name);
}

export function refreshBillingState(force = false) {
  const companyId = readCloudUser()?.companyId ?? "";
  if (!companyId || !cloudActive()) {
    if (state.loaded && state.mode === "simulacao" && !state.companyName) return Promise.resolve();
    emit({ ...initial, loaded: true });
    return Promise.resolve();
  }
  if (!force && loadedFor === companyId && Date.now() - loadedAt < 5 * 60_000) return Promise.resolve();
  if (inflight) return inflight;
  inflight = moloniStatus(companyId).then((status) => {
    const companyName = String(status.moloniCompanyName ?? "");
    const demoAccount = isDemoCompanyName(companyName);
    loadedFor = companyId;
    loadedAt = Date.now();
    emit({
      loaded: true,
      mode: status.connected ? (status.testMode === false ? "real" : "teste") : "simulacao",
      companyName,
      demoAccount,
      payments: status.payments ?? {},
      error: status.connected ? "" : String(status.error ?? ""),
    });
  }).catch(() => {
    emit({ ...initial, loaded: true, error: "Não foi possível confirmar a ligação ao programa de faturação." });
  }).finally(() => { inflight = null; });
  return inflight;
}

export function useBillingState() {
  const value = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => state,
    () => initial,
  );
  useEffect(() => { void refreshBillingState(); }, []);
  return value;
}

/** Short sentence for footers and dialogs. */
export function billingSummary(billing: BillingState) {
  if (!billing.loaded) return "A confirmar a faturação…";
  if (billing.mode === "simulacao") return "Faturação simulada, sem validade fiscal.";
  const company = billing.companyName ? `«${billing.companyName}»` : "a empresa ligada";
  if (billing.demoAccount) return `Faturação ligada a ${company} (conta de teste, sem validade fiscal).`;
  if (billing.mode === "teste") return `Faturação ligada a ${company} em modo de teste (rascunhos).`;
  return `Faturação certificada em ${company}.`;
}
