"use client";

import { useState, useSyncExternalStore } from "react";
import { readEcolubRate, subscribeEcolubRate, writeEcolubRate } from "@/lib/ecolub-settings";
import { ecolubDefaults } from "@/src/config";
import { parseDecimal } from "@/lib/domain";

export function EcolubSettings() {
  const rate = useSyncExternalStore(subscribeEcolubRate, readEcolubRate, () => ecolubDefaults.rate);
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(rate).replace(".", ",");
  return (
    <label className="grid max-w-xs gap-1 text-sm">
      Taxa ECOLUB (€ por litro)
      <input
        data-testid="ecolub-rate"
        value={shown}
        inputMode="decimal"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = parseDecimal((draft ?? shown).trim());
          if (parsed !== null && parsed >= 0) writeEcolubRate(parsed);
          setDraft(null);
        }}
        className="h-10 rounded-lg border border-[var(--line)] px-3"
      />
      <span className="text-xs text-[var(--muted-text)]">Valor de origem: 0,09 € por litro. IVA 23% e margem 0%.</span>
    </label>
  );
}
