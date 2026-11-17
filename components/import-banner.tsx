"use client";

import { useEffect, useState } from "react";
import { cloudActive, importAlreadyDone, markImported, readDeviceStash, saveCompanyState } from "@/browser/src/cloud";
import { forgetCloudMemory, readDeviceSnapshot } from "@/browser/src/store";

export function ImportBanner() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!cloudActive() || importAlreadyDone() || sessionStorage.getItem("oficinaplan-import-skip") === "1") return;
    void readDeviceSnapshot().then((snap) => {
      const stash = readDeviceStash();
      if (snap || stash) setOpen(true);
    });
  }, []);

  if (!open) return message ? <p className="mb-2 bg-[#e7f7f8] px-3 py-2 text-[16px]">{message}</p> : null;

  return (
    <div data-testid="importar-dispositivo" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#00a9fd] bg-[#e7f7f8] px-3 py-3 text-[16px]">
      <p>Encontrámos dados deste dispositivo. Queres copiá-los para a tua oficina na nuvem?</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          className="h-10 rounded-lg bg-[#00a9fd] px-3 font-semibold text-white"
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
        <button type="button" className="h-10 rounded-lg border px-3" onClick={() => { sessionStorage.setItem("oficinaplan-import-skip", "1"); setOpen(false); }}>Agora não</button>
      </div>
    </div>
  );
}
