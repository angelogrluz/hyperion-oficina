"use client";

import { useMemo, useState } from "react";
import { lineAmounts, round2 } from "@/lib/domain";
import { formatEUR, lisbonParts } from "@/lib/format";

type Order = { status: string; invoiceNumber: string | null; invoiceIssuedAt: string | null; dateOut: string | null; updatedAt: string; lines: Array<{ quantity: number; unitPrice: number; discountPercent?: number; vatRate: number }> };
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
    <section data-testid="resultados" className="max-w-3xl rounded-xl border border-[#d5ebed] bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#d5ebed] px-4 py-3">
        <div>
          <h1 className="text-[22px] font-semibold">Resultados</h1>
          <p className="text-[15px] text-[#4d6d73]">Estimativa de IVA do trimestre. O valor oficial é o da declaração do contabilista.</p>
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
          <tr className="border-t border-[#d5ebed]"><td className="px-4 py-3">IVA liquidado nas faturas</td><td data-testid="iva-liquidado" className="px-4 py-3 text-right font-semibold tabular-nums">{formatEUR(totals.salesVat)}</td></tr>
          <tr className="border-t border-[#d5ebed]"><td className="px-4 py-3">IVA dedutível nas compras</td><td data-testid="iva-dedutivel" className="px-4 py-3 text-right font-semibold tabular-nums">{formatEUR(totals.purchaseVat)}</td></tr>
          <tr className="border-t border-[#d5ebed] bg-[#e7f7f8]"><td className="px-4 py-3 font-semibold">IVA a pagar (estimativa)</td><td data-testid="iva-pagar" className="px-4 py-3 text-right text-[20px] font-semibold tabular-nums text-[#0b8f9c]">{formatEUR(totals.due)}</td></tr>
        </tbody>
      </table>
    </section>
  );
}
