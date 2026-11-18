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

const UNKNOWN = "Não foi possível confirmar a ligação à faturação; volta a ser verificada ao faturar.";
const initial: BillingState = { loaded: false, mode: "simulacao", companyName: "", demoAccount: false, payments: {}, error: "" };
let state: BillingState = initial;
let loadedFor = "";
let loadedAt = 0;
let inflight: Promise<void> | null = null;
let retries = 0;
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
  // Never wait forever (a reload can leave the first call hanging): give up after 12 s and retry later.
  const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 12_000));
  inflight = Promise.race([moloniStatus(companyId), timeout]).then((status) => {
    const companyName = String(status.moloniCompanyName ?? "");
    const demoAccount = isDemoCompanyName(companyName);
    loadedFor = companyId;
    loadedAt = Date.now();
    retries = 0;
    emit({
      loaded: true,
      mode: status.connected ? (status.testMode === false ? "real" : "teste") : "simulacao",
      companyName,
      demoAccount,
      payments: status.payments ?? {},
      error: status.connected ? "" : String(status.error ?? ""),
    });
  }).catch(() => {
    loadedFor = "";
    emit({ ...state, loaded: true, error: UNKNOWN });
    if (retries < 2) {
      retries += 1;
      window.setTimeout(() => { void refreshBillingState(true); }, 2000);
    }
  }).finally(() => { inflight = null; });
  return inflight;
}

export function useBillingState() {
  const value = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => state,
    () => initial,
  );
  useEffect(() => {
    void refreshBillingState();
    // The session may not be ready on the very first call after a reload: check again shortly.
    const retry = window.setTimeout(() => { if (!state.loaded || state.error === UNKNOWN) void refreshBillingState(true); }, 4000);
    return () => window.clearTimeout(retry);
  }, []);
  return value;
}

/** Short sentence for footers and dialogs. */
export function billingSummary(billing: BillingState) {
  if (!billing.loaded) return "A confirmar a faturação…";
  if (billing.error === UNKNOWN) return UNKNOWN;
  if (billing.mode === "simulacao") return "Faturação simulada, sem validade fiscal.";
  const company = billing.companyName ? `«${billing.companyName}»` : "a empresa ligada";
  if (billing.demoAccount) return `Faturação ligada a ${company} (conta de teste, sem validade fiscal).`;
  if (billing.mode === "teste") return `Faturação ligada a ${company} em modo de teste (rascunhos).`;
  return `Faturação certificada em ${company}.`;
}
