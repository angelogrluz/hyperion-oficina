"use client";

import { useState } from "react";
import { emptyYearTarget, spreadTarget, type CompanySettings, type YearTarget } from "@/lib/company-settings";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function AnnualTargets({ company, onSave }: { company: CompanySettings; onSave: (patch: Partial<CompanySettings>) => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const current = company.targets?.[String(year)] ?? emptyYearTarget();
  const [revenue, setRevenue] = useState(String(current.revenue || ""));
  const [margin, setMargin] = useState(String(current.margin || ""));

  function write(next: YearTarget) {
    onSave({ targets: { ...company.targets, [String(year)]: next } });
  }

  return (
    <div className="grid gap-3" data-testid="objetivos-anuais">
      <label className="text-[15px]">Ano
        <input type="number" value={year} onChange={(event) => {
          const next = Number(event.target.value) || year;
          setYear(next);
          const stored = company.targets?.[String(next)] ?? emptyYearTarget();
          setRevenue(stored.revenue ? String(stored.revenue) : "");
          setMargin(stored.margin ? String(stored.margin) : "");
        }} className="mt-1 block h-10 w-28 rounded-lg border px-2" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[15px]">Faturação anual (€)
          <input value={revenue} inputMode="decimal" onChange={(event) => setRevenue(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2" />
        </label>
        <label className="text-[15px]">Margem bruta anual (%)
          <input value={margin} inputMode="decimal" onChange={(event) => setMargin(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2" />
        </label>
      </div>
      <button type="button" className="h-10 w-fit rounded-lg bg-[var(--ink)] px-3 font-semibold text-white" onClick={() => {
        const next = spreadTarget(number(revenue), number(margin));
        write(next);
      }}>Distribuir por igual</button>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[15px]">
          <thead><tr className="text-[var(--muted-text)]"><th className="py-2">Mês</th><th>Faturação (€)</th><th>Margem bruta (%)</th></tr></thead>
          <tbody>
            {current.months.map((month, index) => (
              <tr key={MONTHS[index]} className="border-t border-[var(--line)]">
                <td className="py-2">{MONTHS[index]}</td>
                <td><input value={month.revenue || ""} inputMode="decimal" onChange={(event) => {
                  const months = current.months.map((item, itemIndex) => itemIndex === index ? { ...item, revenue: number(event.target.value) } : item);
                  write({ ...current, revenue: number(revenue), margin: number(margin), months });
                }} className="h-10 w-32 rounded-lg border px-2" /></td>
                <td><input value={month.margin || ""} inputMode="decimal" onChange={(event) => {
                  const months = current.months.map((item, itemIndex) => itemIndex === index ? { ...item, margin: number(event.target.value) } : item);
                  write({ ...current, revenue: number(revenue), margin: number(margin), months });
                }} className="h-10 w-28 rounded-lg border px-2" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function number(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
