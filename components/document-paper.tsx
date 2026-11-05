import { formatEUR, formatPercent, formatQty } from "@/lib/format";
import type { PrintableDocument, WorkshopProfile } from "@/lib/printable";

export function DocumentPaper({ doc, workshop }: { doc: PrintableDocument; workshop: WorkshopProfile }) {
  return (
    <article className="mx-auto max-w-[210mm] bg-white px-8 py-8 text-neutral-900 shadow-sm ring-1 ring-black/10 print:shadow-none print:ring-0">
      <div className="flex items-start justify-between gap-6 border-b border-neutral-200 pb-4">
        <div>
          <p className="text-xl font-semibold tracking-tight">{workshop.tradeName}</p>
          <p className="text-sm text-neutral-500">Oficina de reparação automóvel</p>
          <p className="mt-2 text-sm">
            {workshop.address}
            <br />
            {workshop.postalCode} {workshop.city}
            <br />
            NIF {workshop.nif} · {workshop.phone}
            <br />
            {workshop.email}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold tracking-[0.16em] text-[#c4622d] uppercase">{doc.title}</p>
          <p className="mt-1 text-2xl font-semibold">{doc.number}</p>
          <p className="text-sm text-neutral-500">{doc.statusLabel}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 p-3">
          <p className="text-[11px] font-semibold tracking-wide text-[#c4622d] uppercase">Cliente</p>
          <p className="mt-1 font-medium">{doc.client.name}</p>
          <p className="text-sm text-neutral-600">NIF {doc.client.nif}</p>
          <p className="text-sm text-neutral-600">{doc.client.address || "Sem morada"}</p>
          <p className="text-sm text-neutral-600">{[doc.client.phone, doc.client.email].filter(Boolean).join(" · ")}</p>
        </section>
        <section className="rounded-lg border border-neutral-200 p-3">
          <p className="text-[11px] font-semibold tracking-wide text-[#c4622d] uppercase">Viatura</p>
          <p className="mt-1 font-mono font-semibold">{doc.vehicle.plate}</p>
          <p className="text-sm text-neutral-600">
            {doc.vehicle.brand} {doc.vehicle.model} · {doc.vehicle.year}
          </p>
          <p className="text-sm text-neutral-600">
            {doc.vehicle.fuel} · {formatQty(doc.km)} km
          </p>
          <p className="text-sm text-neutral-600">{doc.vehicle.vin ? `VIN ${doc.vehicle.vin}` : "VIN não indicado"}</p>
        </section>
      </div>

      <p className="mt-4 text-sm text-neutral-600">
        {doc.primaryDateLabel}: {doc.primaryDate}
        <span className="px-3">·</span>
        {doc.secondaryDateLabel}: {doc.secondaryDate}
      </p>

      <h2 className="mt-4 text-xs font-semibold tracking-wide text-[#c4622d] uppercase">{doc.problemLabel}</h2>
      <p className="mt-1 text-sm">{doc.problem}</p>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-neutral-200 text-left text-xs tracking-wide text-neutral-500 uppercase">
            <th className="py-2 font-medium">Descrição</th>
            <th className="py-2 text-right font-medium">Qtd</th>
            <th className="py-2 text-right font-medium">Preço</th>
            <th className="py-2 text-right font-medium">IVA</th>
            <th className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-3 text-neutral-500">
                Sem linhas lançadas.
              </td>
            </tr>
          ) : (
            doc.lines.map((line, index) => (
              <tr key={`${line.description}-${index}`} className="border-b border-neutral-100">
                <td className="py-2">
                  {line.ref ? <span className="mr-2 font-mono text-xs">{line.ref}</span> : null}
                  {line.description}
                  {line.kind === "mao_de_obra" ? <span className="ml-2 text-xs text-neutral-500">mão de obra</span> : null}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatQty(line.quantity)}
                  {line.kind === "mao_de_obra" ? " h" : ""}
                </td>
                <td className="py-2 text-right tabular-nums">{formatEUR(line.unitPrice)}</td>
                <td className="py-2 text-right tabular-nums">{formatPercent(line.vatRate)}</td>
                <td className="py-2 text-right tabular-nums">{formatEUR(line.total)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Base s/ IVA</span>
          <span className="tabular-nums">{formatEUR(doc.totals.base)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">IVA</span>
          <span className="tabular-nums">{formatEUR(doc.totals.vat)}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatEUR(doc.totals.total)}</span>
        </div>
      </div>

      {doc.invoice ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-semibold">
            {doc.invoice.simulated ? "Fatura simulada" : "Fatura"} {doc.invoice.number}
          </p>
          <p>
            {doc.invoice.provider}. Este número não tem validade fiscal e não foi comunicado à Autoridade Tributária.
          </p>
        </div>
      ) : null}

      {doc.notes ? <p className="mt-4 text-sm text-neutral-600">Notas: {doc.notes}</p> : null}

      <div className="mt-10 grid grid-cols-2 gap-8 text-sm text-neutral-500">
        <div className="border-t border-neutral-300 pt-2">O cliente</div>
        <div className="border-t border-neutral-300 pt-2">A oficina</div>
      </div>
      <p className="mt-8 text-center text-[11px] text-neutral-500">
        Documento interno de oficina. A faturação certificada não está ativa. Um número de fatura em modo de simulação
        não substitui uma fatura emitida por software certificado pela AT.
      </p>
    </article>
  );
}
