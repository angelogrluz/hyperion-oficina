"use client";

import { lineKindLabel } from "@/lib/line-kinds";

import { useEffect, useSyncExternalStore } from "react";
import { CompanyBlock, CompanyFooter } from "@/components/company-block";
import { PrintButton } from "@/components/print-button";
import { readSymptoms, subscribeSymptoms } from "@/lib/browser-cache";
import { formatEUR, formatQty } from "@/lib/format";

export type FolhaPrintLine = {
  kind: "mao_de_obra" | "peca" | "servico" | "servico_externo";
  description: string;
  ref?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type FolhaParty = {
  name: string;
  nif: string;
  address: string;
  postalCode?: string;
  city?: string;
  phone: string;
  email: string;
} | null;

export type FolhaVehicle = {
  plate: string;
  brand: string;
  model: string;
  year: number | null;
  vin: string;
  fuel: string;
  km: number;
  kmOut: number | null;
  oil: string;
} | null;

export function FolhaPrint({
  autoPrint = false,
  backHref,
  documentId,
  number,
  dateLabel,
  client,
  vehicle,
  problem,
  lines,
  totals,
}: {
  autoPrint?: boolean;
  backHref: string;
  documentId: string;
  number: string;
  dateLabel: string;
  client: FolhaParty;
  vehicle: FolhaVehicle;
  problem: string;
  lines: FolhaPrintLine[];
  totals: { base: number; vat: number; total: number };
}) {
  const symptoms = useSyncExternalStore(subscribeSymptoms, () => readSymptoms(documentId), () => readSymptoms(""));

  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  return (
    <main className="min-h-screen bg-stone-200 px-4 py-6 text-black print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <a href={backHref} className="text-sm font-medium text-[var(--glow)]">Voltar à folha</a>
        <PrintButton />
      </div>
      <article data-testid="folha-impressa" className="print-keep mx-auto max-w-[210mm] bg-white px-8 py-8 text-[12px] shadow-sm print:shadow-none">
        <div className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-4">
          <CompanyBlock showIban />
          <div className="text-right">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[var(--glow)] uppercase">Folha de obra</p>
            <p className="mt-1 text-xl font-bold">{number}</p>
            <p className="text-neutral-600">Entrada: {dateLabel}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <section className="border border-neutral-300 p-3">
            <p className="text-[10px] font-semibold tracking-wide uppercase">Cliente</p>
            {client ? (
              <>
                <p className="mt-1 font-bold">{client.name}</p>
                <p>NIF {client.nif || "—"}</p>
                <p>{client.address || "Sem morada"}</p>
                {client.postalCode || client.city ? <p>{[client.postalCode, client.city].filter(Boolean).join(" ")}</p> : null}
                <p>{[client.phone, client.email].filter(Boolean).join(" · ") || "—"}</p>
              </>
            ) : (
              <p className="mt-1">Sem cliente</p>
            )}
          </section>
          <section className="border border-neutral-300 p-3">
            <p className="text-[10px] font-semibold tracking-wide uppercase">Viatura</p>
            {vehicle ? (
              <>
                <p className="mt-1 font-mono text-base font-bold">{vehicle.plate}</p>
                <p>{[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "—"}{vehicle.year ? ` · ${vehicle.year}` : ""}</p>
                <p>{vehicle.fuel || "—"} · {formatQty(vehicle.km)} km</p>
                {vehicle.kmOut != null ? <p>Kms saída: {formatQty(vehicle.kmOut)}</p> : null}
                <p>{vehicle.vin ? `VIN ${vehicle.vin}` : "VIN não indicado"}</p>
                {vehicle.oil ? <p>Óleo do motor: {vehicle.oil}</p> : null}
              </>
            ) : (
              <p className="mt-1">Sem viatura</p>
            )}
          </section>
        </div>

        <h2 className="mt-4 text-[10px] font-semibold tracking-wide uppercase">Sintomas/Requisitos</h2>
        {symptoms.length === 0 ? (
          <p className="mt-1 text-neutral-600">Sem sintomas registados.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {symptoms.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <span aria-hidden>{item.done ? "☑" : "☐"}</span>
                <span className={item.done ? "line-through" : ""}>{item.text}</span>
              </li>
            ))}
          </ul>
        )}

        <table className="mt-4 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-y border-neutral-400 text-left uppercase">
              <th className="py-1 font-semibold">Descrição</th>
              <th className="py-1 text-right font-semibold">Qtd.</th>
              <th className="py-1 text-right font-semibold">Preço</th>
              <th className="py-1 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-2 text-neutral-600">Sem linhas lançadas.</td>
              </tr>
            ) : (
              lines.map((line, index) => (
                <tr key={`${line.description}-${index}`} className="border-b border-neutral-200">
                  <td className="py-1">
                    {line.ref ? <span className="mr-2 font-mono text-[10px]">{line.ref}</span> : null}
                    {line.description}
                    <span className="ml-2 text-[10px] text-neutral-500">{lineKindLabel(line.kind).toLowerCase()}</span>
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatQty(line.quantity)}{line.kind === "mao_de_obra" ? " h" : ""}
                  </td>
                  <td className="py-1 text-right tabular-nums">{formatEUR(line.unitPrice)}</td>
                  <td className="py-1 text-right tabular-nums">{formatEUR(line.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-3 ml-auto w-56 space-y-1 text-[12px]">
          <div className="flex justify-between"><span>Base s/ IVA</span><span className="tabular-nums">{formatEUR(totals.base)}</span></div>
          <div className="flex justify-between"><span>IVA</span><span className="tabular-nums">{formatEUR(totals.vat)}</span></div>
          <div className="flex justify-between border-t border-neutral-400 pt-1 font-bold">
            <span>Total</span><span className="tabular-nums">{formatEUR(totals.total)}</span>
          </div>
        </div>

        <h2 className="mt-6 text-[10px] font-semibold tracking-wide uppercase">Observações</h2>
        <p className="mt-1 min-h-8 whitespace-pre-wrap">{problem.trim() || "—"}</p>

        <div className="mt-14 grid grid-cols-2 gap-12 text-[11px]">
          <div>
            <div className="h-10" />
            <div className="border-t border-neutral-500 pt-1">Assinatura do cliente</div>
          </div>
          <div>
            <div className="h-10" />
            <div className="border-t border-neutral-500 pt-1">Assinatura da oficina</div>
          </div>
        </div>
        <CompanyFooter />
      </article>
    </main>
  );
}
