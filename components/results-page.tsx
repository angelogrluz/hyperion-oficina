"use client";

import { useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import { lineAmounts, round2 } from "@/lib/domain";
import { formatEUR, lisbonParts } from "@/lib/format";
import { readCompanySettings, subscribeCompanySettings } from "@/lib/company-settings";

type Order = { status: string; invoiceNumber: string | null; invoiceIssuedAt: string | null; dateOut: string | null; updatedAt: string; lines: Array<{ quantity: number; unitPrice: number; unitCost?: number; discountPercent?: number; vatRate: number }> };
type Purchase = { id: string; date: string; voided: boolean };
type PurchaseLine = { purchaseId: string; quantity: number; cost: number; vatRate: number };

function quarterOf(date: Date) {
  const parts = lisbonParts(date);
  return { year: parts.year, quarter: Math.floor((parts.month - 1) / 3) + 1 };
}

function range(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3 + 1;
  const start = new Date(Date.UTC(year, startMonth - 1, 1));
  const end = new Date(Date.UTC(year, startMonth + 2, 1));
  return { start, end };
}

function inRange(value: string | null, start: Date, end: Date) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= start.getTime() && time < end.getTime();
}

export function ResultsPage({ orders, purchases, purchaseLines }: { orders: Order[]; purchases: Purchase[]; purchaseLines: PurchaseLine[] }) {
  const now = quarterOf(new Date());
  const [year, setYear] = useState(now.year);
  const [quarter, setQuarter] = useState(now.quarter);
  const targets = useSyncExternalStore(subscribeCompanySettings, () => readCompanySettings().targets?.[String(year)], () => undefined);
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const start = new Date(Date.UTC(year, index, 1));
      const end = new Date(Date.UTC(year, index + 1, 1));
      let revenue = 0;
      let base = 0;
      let margin = 0;
      for (const order of orders) {
        if (!order.invoiceNumber) continue;
        const when = order.invoiceIssuedAt || order.dateOut || order.updatedAt;
        if (!inRange(when, start, end)) continue;
        for (const line of order.lines) {
          const amounts = lineAmounts({ quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost ?? 0, discountPercent: line.discountPercent ?? 0, vatRate: line.vatRate });
          revenue += amounts.total;
          base += amounts.base;
          margin += amounts.margin;
        }
      }
      return { revenue: round2(revenue), marginPct: base > 0 ? round2((margin / base) * 100) : 0, targetRevenue: targets?.months[index]?.revenue ?? 0, targetMargin: targets?.months[index]?.margin ?? 0 };
    });
  }, [orders, year, targets]);
  const totals = useMemo(() => {
    const { start, end } = range(year, quarter);
    let salesVat = 0;
    let purchaseVat = 0;
    for (const order of orders) {
      if (!order.invoiceNumber) continue;
      const when = order.invoiceIssuedAt || order.dateOut || order.updatedAt;
      if (!inRange(when, start, end)) continue;
      for (const line of order.lines) salesVat += lineAmounts({ quantity: line.quantity, unitPrice: line.unitPrice, unitCost: 0, discountPercent: line.discountPercent ?? 0, vatRate: line.vatRate }).vat;
    }
    const openPurchases = new Set(purchases.filter((item) => !item.voided && inRange(item.date, start, end)).map((item) => item.id));
    for (const line of purchaseLines) {
      if (!openPurchases.has(line.purchaseId)) continue;
      purchaseVat += round2(line.quantity * line.cost * (line.vatRate / 100));
    }
    return { salesVat: round2(salesVat), purchaseVat: round2(purchaseVat), due: round2(salesVat - purchaseVat) };
  }, [orders, purchases, purchaseLines, year, quarter]);

  return (
    <section data-testid="resultados" className="max-w-3xl rounded-xl border border-[var(--line)] bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h1 className="text-[22px] font-semibold">Resultados</h1>
          <p className="text-[15px] text-[var(--muted-text)]">Estimativa de IVA do trimestre. O valor oficial é o da declaração do contabilista.</p>
        </div>
        <div className="flex gap-2">
          <label className="text-[14px]">Ano
            <input data-testid="resultado-ano" type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || year)} className="mt-1 block h-10 w-24 rounded-lg border px-2" />
          </label>
          <label className="text-[14px]">Trimestre
            <select data-testid="resultado-trimestre" value={quarter} onChange={(event) => setQuarter(Number(event.target.value))} className="mt-1 block h-10 rounded-lg border px-2">
              {[1, 2, 3, 4].map((item) => <option key={item} value={item}>{item}.º trimestre</option>)}
            </select>
          </label>
        </div>
      </div>
      <table className="w-full text-[17px]">
        <tbody>
          <tr className="border-t border-[var(--line)]"><td className="px-4 py-3">IVA liquidado nas faturas</td><td data-testid="iva-liquidado" className="px-4 py-3 text-right font-semibold tabular-nums">{formatEUR(totals.salesVat)}</td></tr>
          <tr className="border-t border-[var(--line)]"><td className="px-4 py-3">IVA dedutível nas compras</td><td data-testid="iva-dedutivel" className="px-4 py-3 text-right font-semibold tabular-nums">{formatEUR(totals.purchaseVat)}</td></tr>
          <tr className="border-t border-[var(--line)] bg-[var(--mist)]"><td className="px-4 py-3 font-semibold">IVA a pagar (estimativa)</td><td data-testid="iva-pagar" className="px-4 py-3 text-right text-[20px] font-semibold tabular-nums text-[var(--glow)]">{formatEUR(totals.due)}</td></tr>
        </tbody>
      </table>
      <div className="border-t border-[var(--line)] px-4 py-3">
        <h2 className="text-[18px] font-semibold">Objetivos de {year}</h2>
        <p className="text-[14px] text-[var(--muted-text)]">A faturação é o total faturado. A margem bruta compara o preço sem IVA com o custo.</p>
        <table className="mt-2 w-full text-[15px]">
          <thead><tr className="text-left text-[var(--muted-text)]"><th className="py-1">Mês</th><th className="text-right">Faturação</th><th className="text-right">Objetivo</th><th className="text-right">Margem</th><th className="text-right">Objetivo</th></tr></thead>
          <tbody>
            {months.map((month, index) => (
              <tr key={index} className="border-t border-[var(--line)]">
                <td className="py-1">{["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][index]}</td>
                <td className="text-right tabular-nums">{formatEUR(month.revenue)}</td>
                <td className="text-right tabular-nums">{formatEUR(month.targetRevenue)}</td>
                <td className="text-right tabular-nums">{month.marginPct.toLocaleString("pt-PT")}%</td>
                <td className="text-right tabular-nums">{month.targetMargin.toLocaleString("pt-PT")}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
