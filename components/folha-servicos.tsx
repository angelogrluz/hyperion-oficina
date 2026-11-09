"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CarSide } from "@/components/car-side";
import { companyLogoSrc } from "@/components/company-block";
import { PrintButton } from "@/components/print-button";
import { readSymptoms, subscribeSymptoms } from "@/lib/browser-cache";
import { formatMediumDate, formatQty, lisbonTime } from "@/lib/format";
import { company } from "@/src/config";

export type ServicoLine = {
  description: string;
  ref?: string | null;
  quantity: number;
};

function clock(date: Date) {
  const [hour, minute] = lisbonTime(date).split(":");
  return `${formatMediumDate(date)} às ${hour}h${minute}m`;
}

function promessaLabel(value: string) {
  const match = value.trim().match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return value.trim();
  return `${match[1]} às ${match[2]}h${match[3]}m`;
}

export function FolhaServicos({
  autoPrint = false,
  backHref,
  documentId,
  number,
  enteredAt,
  promiseDelivery,
  userName,
  vehicle,
  lines,
}: {
  autoPrint?: boolean;
  backHref: string;
  documentId: string;
  number: string;
  enteredAt: string;
  promiseDelivery: string;
  userName: string;
  vehicle: {
    plate: string;
    brand: string;
    model: string;
    year: number | null;
    vin: string;
    version: string;
    km: number;
  } | null;
  lines: ServicoLine[];
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
        <a href={backHref} className="text-sm font-medium text-[#0b8f9c]">Voltar à folha</a>
        <PrintButton />
      </div>
      <article data-testid="folha-servicos" className="mx-auto flex min-h-[277mm] max-w-[210mm] flex-col bg-white px-5 py-4 text-[12px] shadow-sm print:min-h-[260mm] print:shadow-none">
        <header className="grid grid-cols-[1.2fr_auto_1fr] items-start gap-3">
          <div>
            <p className="text-[15px] font-semibold">Folha de Serviços</p>
            <p className="text-[22px] leading-tight font-bold">Nº: {number}</p>
            <p className="mt-1 text-[12px] font-semibold">Hyperion Reparação Automóvel Unip. Lda</p>
            <p>NIF: {company.nif}</p>
          </div>
          <img src={companyLogoSrc()} alt="Hyperion" className="h-14 w-auto bg-white object-contain" />
          <div className="grid gap-2">
            <div className="border border-black px-2 py-1">
              <p className="text-[10px]">Data e hora de entrada:</p>
              <p className="font-semibold">{clock(new Date(enteredAt))}</p>
            </div>
            <div className="border border-black px-2 py-1">
              <p className="text-[10px]">Promessa de entrega:</p>
              <p className="min-h-4 font-semibold">{promiseDelivery ? promessaLabel(promiseDelivery) : ""}</p>
            </div>
          </div>
        </header>

        <section className="mt-3 grid grid-cols-[1fr_1fr_150px] border border-black">
          <div>
            <Field label="Matrícula" value={vehicle?.plate ?? ""} />
            <Field label="Tipo veículo" value={vehicle?.brand ?? ""} />
            <Field label="Primeiro Registo" value={vehicle?.year ? String(vehicle.year) : ""} />
            <Field label="Kms ENTRADA" value={vehicle ? formatQty(vehicle.km) : ""} last />
          </div>
          <div className="border-l border-black">
            <Field label="Nº de Chassi" value={vehicle?.vin ?? ""} />
            <Field label="Tipo veículo" value={vehicle?.model ?? ""} />
            <Field label="Cilindrada" value={vehicle?.version ?? ""} last />
          </div>
          <div className="flex items-center justify-center border-l border-black">
            <CarSide color="#9aa7ad" className="h-16 w-36" />
          </div>
        </section>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <p className="font-bold underline">Sintomas - Serviços a efetuar:</p>
          <p>Rececionado por: {userName}</p>
        </div>
        {symptoms.length ? (
          <ol className="mt-1 space-y-0.5">
            {symptoms.map((item, index) => (
              <li key={item.id} className="break-words">
                {index + 1}) {item.text}
              </li>
            ))}
          </ol>
        ) : null}

        <h2 className="mt-3 text-[13px] font-semibold">Tabela de serviços</h2>
        <table className="mt-1 w-full border-collapse border border-black text-[12px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-0.5 text-left font-semibold">Descrição</th>
              <th className="w-24 border border-black px-1 py-0.5 text-left font-semibold">Ref.</th>
              <th className="w-14 border border-black px-1 py-0.5 text-right font-semibold">Qtd.</th>
              <th className="w-8 border border-black px-1 py-0.5 text-center font-semibold">C</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.description}-${index}`}>
                <td className="border border-black px-1 py-1">{line.description}</td>
                <td className="border border-black px-1 py-1 font-mono">{line.ref ?? ""}</td>
                <td className="border border-black px-1 py-1 text-right tabular-nums">{formatQty(line.quantity)}</td>
                <td className="border border-black px-1 py-1 text-center"><input type="checkbox" aria-label={`Concluído ${line.description}`} className="size-3.5" /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-auto flex items-end justify-between gap-4 pt-4">
          <div className="flex flex-wrap gap-3">
            {["Esguicho", "Anticong.", "Óleo", "Ar", "Pressão pneus", "Luzes"].map((label) => (
              <label key={label} className="flex items-center gap-1">
                <input type="checkbox" className="size-3.5" />
                {label}
              </label>
            ))}
          </div>
          <p>Ass. Técnico: ____________________</p>
        </footer>
      </article>
    </main>
  );
}

function Field({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`px-2 py-1 ${last ? "" : "border-b border-black"}`}>
      <p className="text-[9px] tracking-wide uppercase">{label}</p>
      <p className="min-h-4 font-semibold">{value}</p>
    </div>
  );
}
