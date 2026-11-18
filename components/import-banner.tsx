"use client";

import { useEffect, useState } from "react";
import { cloudActive, importAlreadyDone, markImported, readCloudUser, readDeviceStash, saveCompanyState } from "@/browser/src/cloud";
import { forgetCloudMemory, readDeviceSnapshot, readSnapshot } from "@/browser/src/store";

// «Agora não» is remembered per workshop on this device (not just for the tab).
const dismissKey = () => `oficinaplan-import-dismissed:${readCloudUser()?.companyId ?? ""}`;

export function ImportBanner() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!cloudActive() || importAlreadyDone() || localStorage.getItem(dismissKey()) === "1") return;
    let alive = true;
    void Promise.all([readDeviceSnapshot(), readSnapshot()]).then(([snap, cloud]) => {
      if (!alive) return;
      const deviceHasData = Boolean(snap && (snap.orders.length || snap.clients.length));
      // Only offer when the cloud workshop is still empty: importing replaces what is there.
      const cloudEmpty = !cloud.orders.length && !cloud.clients.length && !cloud.vehicles.length;
      if (deviceHasData && cloudEmpty) setOpen(true);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  if (!open) return message ? <p className="mb-2 bg-[var(--mist)] px-3 py-2 text-[16px]">{message}</p> : null;

  return (
    <div data-testid="importar-dispositivo" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--glow)] bg-[var(--mist)] px-3 py-3 text-[16px]">
      <p>Encontrámos dados deste dispositivo. Queres copiá-los para a tua oficina na nuvem?</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          className="h-10 rounded-lg bg-[var(--glow)] px-3 font-semibold text-white"
          onClick={() => {
            setPending(true);
            void readDeviceSnapshot().then(async (snap) => {
              const stash = readDeviceStash();
              const parse = (key: string) => {
                const raw = stash?.[key];
                if (!raw) return null;
                try { return JSON.parse(raw) as unknown; } catch { return raw; }
              };
              await saveCompanyState({
                clients: snap?.clients ?? [],
                vehicles: snap?.vehicles ?? [],
                articles: snap?.articles ?? [],
                suppliers: snap?.suppliers ?? [],
                orders: snap?.orders ?? [],
                quotes: snap?.quotes ?? [],
                lines: snap?.lines ?? [],
                purchases: snap?.purchases ?? [],
                purchaseLines: snap?.purchaseLines ?? [],
                appointments: snap?.appointments ?? [],
                invoiceLogs: snap?.invoiceLogs ?? [],
                settings: stash ? {
                  company: parse("hyperion-oficina-empresa") ?? {},
                  prices: parse("hyperion-oficina-precos") ?? {},
                  users: parse("hyperion-oficina-utilizadores") ?? [],
                  permissions: parse("hyperion-oficina-permissoes") ?? {},
                  billing: parse("hyperion-oficina-faturacao") ?? {},
                  plateLookup: parse("hyperion-oficina-matricula") ?? {},
                  serviceTypes: parse("hyperion-oficina-tipos-servico") ?? [],
                  internalServices: parse("hyperion-oficina-servicos-internos") ?? [],
                  ecolub: stash["hyperion-oficina-ecolub-rate"] ?? null,
                  assignments: parse("hyperion-oficina-tecnicos") ?? [],
                  workLogs: parse("hyperion-oficina-tempos") ?? [],
                  punches: parse("hyperion-oficina-pontos") ?? [],
                  symptoms: parse("hyperion-oficina-sintomas") ?? {},
                } : undefined,
              });
              markImported();
              forgetCloudMemory();
              setMessage("Dados importados. A cópia neste dispositivo mantém-se.");
              setOpen(false);
              window.location.reload();
            }).catch((error: unknown) => {
              setPending(false);
              setMessage(error instanceof Error ? error.message : "Não foi possível importar.");
            });
          }}
        >
          {pending ? "A importar…" : "Importar dados deste dispositivo"}
        </button>
        <button type="button" className="h-10 rounded-lg border px-3" onClick={() => { localStorage.setItem(dismissKey(), "1"); setOpen(false); }}>Agora não</button>
      </div>
    </div>
  );
}
