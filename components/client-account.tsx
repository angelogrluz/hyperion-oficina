"use client";

import { useState } from "react";
import { lineAmounts, round2 } from "@/lib/domain";
import { formatEUR, formatMediumDate } from "@/lib/format";

type Invoice = {
  id: string;
  number: string;
  issuedAt: string;
  total: number;
  paid: boolean;
  plate: string;
};

function shareText(invoice: Invoice, kind: "fatura" | "recibo") {
  const title = kind === "fatura" ? "2.ª via da fatura" : "2.ª via do recibo";
  return `${title} ${invoice.number} de ${formatMediumDate(new Date(invoice.issuedAt))}, ${formatEUR(invoice.total)}. Cópia interna, não certificada.`;
}

export function ClientAccount({ client, invoices }: { client: { id: string; name: string; nif: string; phone: string; email: string }; invoices: Invoice[] }) {
  const [openOnly, setOpenOnly] = useState(false);
  const rows = invoices.filter((invoice) => !openOnly || !invoice.paid);
  const due = round2(invoices.filter((invoice) => !invoice.paid).reduce((sum, invoice) => sum + invoice.total, 0));
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-[26px] font-semibold">{client.name}</h1>
        <p className="text-[16px] text-[#4d6d73]">NIF {client.nif || "—"} · {client.phone || "sem telefone"} · {client.email || "sem e-mail"}</p>
      </div>
      <section data-testid="conta-corrente" className="rounded-xl border border-[#d5ebed] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d5ebed] px-4 py-3">
          <div>
            <h2 className="text-[20px] font-semibold">Conta corrente</h2>
            <p className="text-[16px]">Em dívida: <span data-testid="saldo" className="font-semibold">{formatEUR(due)}</span></p>
          </div>
          <label className="flex items-center gap-2 text-[16px]">
            <input data-testid="por-pagar" type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} />
            Por pagar
          </label>
        </div>
        <table className="w-full text-[16px]">
          <thead>
            <tr className="text-left text-[14px] text-[#4d6d73]">
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Número</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Pago</th>
              <th className="px-3 py-2 text-right">Em dívida</th>
              <th className="px-3 py-2">2.ª via</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-4 text-[#8d939c]">Ainda não há faturas neste filtro.</td></tr> : rows.map((invoice) => {
              const text = encodeURIComponent(shareText(invoice, "fatura"));
              const receipt = encodeURIComponent(shareText(invoice, "recibo"));
              const phone = client.phone.replace(/\D/g, "");
              return (
                <tr key={invoice.id} data-testid="conta-linha" className="border-t border-[#eaeaf2]">
                  <td className="px-3 py-2">{formatMediumDate(new Date(invoice.issuedAt))}</td>
                  <td className="px-3 py-2">{invoice.number}<span className="block text-[13px] text-[#8d939c]">{invoice.plate}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatEUR(invoice.total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{invoice.paid ? formatEUR(invoice.total) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{invoice.paid ? formatEUR(0) : formatEUR(invoice.total)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2 text-[14px]">
                      <a className="rounded border border-[#00a9fd] px-2 py-1 text-[#00a9fd]" href={`${import.meta.env.BASE_URL}ordens/${invoice.id}/fatura?imprimir=1`}>Imprimir fatura</a>
                      <a className="rounded border px-2 py-1" href={`mailto:${client.email}?subject=${encodeURIComponent(`Fatura ${invoice.number}`)}&body=${text}`}>E-mail</a>
                      <a className="rounded border px-2 py-1" href={`https://wa.me/${phone}?text=${text}`}>WhatsApp</a>
                      {invoice.paid ? (
                        <>
                          <a className="rounded border border-[#00a9fd] px-2 py-1 text-[#00a9fd]" href={`${import.meta.env.BASE_URL}ordens/${invoice.id}/recibo?imprimir=1`}>Imprimir recibo</a>
                          <a className="rounded border px-2 py-1" href={`mailto:${client.email}?subject=${encodeURIComponent(`Recibo ${invoice.number}`)}&body=${receipt}`}>E-mail recibo</a>
                          <a className="rounded border px-2 py-1" href={`https://wa.me/${phone}?text=${receipt}`}>WhatsApp recibo</a>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function invoiceTotal(lines: Array<{ quantity: number; unitPrice: number; discountPercent?: number; vatRate: number }>) {
  return round2(lines.reduce((sum, line) => sum + lineAmounts({ quantity: line.quantity, unitPrice: line.unitPrice, unitCost: 0, discountPercent: line.discountPercent ?? 0, vatRate: line.vatRate }).total, 0));
}
