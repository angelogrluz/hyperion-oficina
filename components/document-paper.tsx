"use client";

import { useSyncExternalStore } from "react";
import { CompanyBlock, CompanyFooter } from "@/components/company-block";
import { installationCompany, readCompanySettings, subscribeCompanySettings } from "@/lib/company-settings";
import { round2 } from "@/lib/domain";
import { formatEUR, formatQty } from "@/lib/format";
import type { PrintableDocument } from "@/lib/printable";

function dashDate(value: string) {
  const match = value.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (!match) return value;
  return `${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}-${match[3]}`;
}

function taxGroups(doc: PrintableDocument) {
  const groups = new Map<number, { base: number; vat: number }>();
  for (const line of doc.lines) {
    const current = groups.get(line.vatRate) ?? { base: 0, vat: 0 };
    current.base = round2(current.base + line.base);
    current.vat = round2(current.vat + (line.total - line.base));
    groups.set(line.vatRate, current);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

function taxLabel(rate: number) {
  return rate === 23 ? "Normal (Continente)- Taxa de Iva 23%" : `Taxa de IVA ${formatQty(rate)}%`;
}

export function DocumentPaper({ doc }: { doc: PrintableDocument }) {
  const company = useSyncExternalStore(subscribeCompanySettings, readCompanySettings, () => installationCompany);
  const issued = dashDate(doc.primaryDate);
  const groups = taxGroups(doc);
  const quote = doc.kind === "quote";
  const title = quote ? "Orçamento" : doc.title || "Fatura";
  const yourRef = doc.sheetNumber || "—";
  const linked = doc.relatedNumber || "—";
  const addressLines = [doc.client.address, [doc.client.postalCode, doc.client.city].filter(Boolean).join(" ")].filter(Boolean);

  return (
    <article data-testid="documento-moloni" className="print-keep mx-auto max-w-[210mm] bg-white px-6 py-6 text-[11px] leading-snug text-black shadow-sm ring-1 ring-black/10 print:shadow-none print:ring-0">
      <div className="grid grid-cols-2 items-start gap-6">
        <CompanyBlock />
        <div>
          <p className="text-right text-[10px]">Original</p>
          <p className="text-right text-[15px] font-bold">{title} N.º {doc.number}</p>
          <p className="text-right">Data de Emissão: {issued}</p>
          <div className="mt-6">
            <p className="font-bold">{doc.client.name}</p>
            {addressLines.length ? addressLines.map((line) => <p key={line}>{line}</p>) : <p>Sem morada</p>}
            <p>Portugal</p>
          </div>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse border border-neutral-500 text-[10px]">
        <thead>
          <tr className="bg-neutral-100 text-left">
            {["Contribuinte", "Cliente", "V/ Ref.ª", "Enc./Orç.", "Moeda", "Prazo de venc.", "Data Vencimento", "Pág."].map((label) => (
              <th key={label} className="border border-neutral-400 px-1 py-1 font-semibold">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {[doc.client.nif || "—", doc.client.nif || "—", yourRef, linked, "EUR", "Pronto Pgto.", issued, "1/1"].map((value, index) => (
              <td key={index} className="border border-neutral-400 px-1 py-1">{value}</td>
            ))}
          </tr>
        </tbody>
      </table>

      <table className="mt-3 w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-y border-neutral-600 text-left">
            <th className="py-1 pr-2 font-semibold">Ref.ª Artigo</th>
            <th className="py-1 pr-2 font-semibold">Designação</th>
            <th className="py-1 text-right font-semibold">Qtd.</th>
            <th className="py-1 text-right font-semibold">Uni.</th>
            <th className="py-1 text-right font-semibold">Preço</th>
            <th className="py-1 text-right font-semibold">Imposto</th>
            <th className="py-1 text-right font-semibold">Total Líquido</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-2 text-neutral-600">Sem linhas lançadas.</td>
            </tr>
          ) : (
            doc.lines.map((line, index) => (
              <tr key={`${line.description}-${index}`} className="align-top">
                <td className="py-1 pr-2 font-mono">{line.ref || (line.kind === "mao_de_obra" ? "MO" : "—")}</td>
                <td className="py-1 pr-2">
                  <p>{line.description}</p>
                  <p className="text-neutral-600">{line.kind === "mao_de_obra" ? "MO" : "Prod"}</p>
                </td>
                <td className="py-1 text-right tabular-nums">{formatQty(line.quantity)}</td>
                <td className="py-1 text-right">{line.kind === "mao_de_obra" ? "h" : "Unid"}</td>
                <td className="py-1 text-right tabular-nums">{formatEUR(line.unitPrice)}</td>
                <td className="py-1 text-right tabular-nums">{formatQty(line.vatRate)}%</td>
                <td className="py-1 text-right tabular-nums">{formatEUR(line.total)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p className="mt-4 text-[10px]">
        {quote
          ? `Este documento não serve de fatura e foi criado a ${issued}.`
          : "Cópia interna, não certificada. A fatura oficial fica para a fase cloud, quando a Moloni estiver ligada."}
      </p>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_220px] items-start gap-4">
        <table className="w-full border-collapse text-[10px]">
          <caption className="mb-1 text-left font-bold">Resumo de Impostos</caption>
          <thead>
            <tr className="border-b border-neutral-500 text-left">
              <th className="py-1 font-semibold">Designação</th>
              <th className="py-1 text-right font-semibold">Valor</th>
              <th className="py-1 text-right font-semibold">Incidência</th>
              <th className="py-1 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-1">Sem imposto.</td>
              </tr>
            ) : (
              groups.map(([rate, group]) => (
                <tr key={rate}>
                  <td className="py-1">{taxLabel(rate)}</td>
                  <td className="py-1 text-right tabular-nums">{formatQty(rate)}%</td>
                  <td className="py-1 text-right tabular-nums">{formatEUR(group.base)}</td>
                  <td className="py-1 text-right tabular-nums">{formatEUR(group.vat)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="border border-neutral-500 p-2 text-[11px]">
          <div className="flex justify-between gap-3"><span>Total Ilíq.</span><span className="tabular-nums">{formatEUR(doc.totals.base)}</span></div>
          {groups.map(([rate, group]) => (
            <div key={rate} className="mt-1 flex justify-between gap-3">
              <span>{taxLabel(rate)}</span>
              <span className="tabular-nums">{formatEUR(group.vat)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between gap-3 border-t border-neutral-400 pt-1 text-[13px] font-bold">
            <span>Total a pagar</span>
            <span className="tabular-nums">{formatEUR(doc.totals.total)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="font-bold">Observações</p>
        <p>Matrícula: {doc.vehicle.plate}</p>
        <p>Marca: {doc.vehicle.brand}</p>
        <p>Modelo: {doc.vehicle.model}</p>
        <p>Kms: {formatQty(doc.km)}</p>
      </div>

      <div className="mt-4">
        <p className="font-bold">Informação Bancária</p>
        {company.bank.trim() ? <p>{company.bank}</p> : null}
        {company.iban.trim() ? <p>{company.iban}</p> : null}
        {doc.paymentMethod ? <p className="mt-1">Modo de pagamento: {doc.paymentMethod}</p> : null}
      </div>
      <CompanyFooter />
    </article>
  );
}
