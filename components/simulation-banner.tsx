"use client";

import { useBillingState } from "@/browser/src/billing-status";

export function SimulationBanner() {
  const billing = useBillingState();
  // Only once the connection is known: no flash for connected workshops.
  if (!billing.loaded || billing.mode !== "simulacao") return null;
  return (
    <div className="-mx-2 -mt-2 mb-2 bg-[#fff6d4] px-3 py-1.5 text-[17px] leading-snug text-[#6b5a20]">
      Simulação (sem validade fiscal). Os documentos emitidos por «Faturar» não são certificados pela Autoridade Tributária.
    </div>
  );
}
