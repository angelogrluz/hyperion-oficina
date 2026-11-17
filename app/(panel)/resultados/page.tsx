import { prisma } from "@/lib/db";
import { sumTotals } from "@/lib/domain";
import { formatEUR, lisbonParts, shiftMonth, zonedDateTime } from "@/lib/format";

export const metadata = { title: "Resultados da Empresa" };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export default async function ResultsPage() {
  const parts = lisbonParts();
  const start = zonedDateTime(`${parts.year}-${pad(parts.month)}-01`, "00:00");
  const next = shiftMonth(parts.year, parts.month, 1);
  const end = zonedDateTime(`${next.year}-${pad(next.month)}-01`, "00:00");
  const [invoiced, openCount, clients] = await Promise.all([
    prisma.repairOrder.findMany({ where: { status: "faturada", invoiceIssuedAt: { gte: start, lt: end } }, include: { lines: true } }),
    prisma.repairOrder.count({ where: { status: { in: ["aberta", "em_curso", "concluida"] } } }),
    prisma.client.count(),
  ]);
  const totals = sumTotals(invoiced.flatMap((order) => order.lines));
  const rows = [
    ["Faturação", formatEUR(totals.total)],
    ["Base sem IVA", formatEUR(totals.base)],
    ["IVA", formatEUR(totals.vat)],
    ["Margem bruta", formatEUR(totals.margin)],
    ["Documentos do mês", String(invoiced.length)],
    ["Obras em curso", String(openCount)],
    ["Clientes", String(clients)],
  ];
  return (
    <section className="max-w-3xl rounded-xl border border-[var(--line)] bg-white">
      <h1 className="border-b border-[var(--line)] px-4 py-3 text-lg font-semibold">Resultados da Empresa</h1>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-[var(--line)]">
              <td className="px-4 py-2">{label}</td>
              <td className="px-4 py-2 text-right font-medium text-[var(--glow)] tabular-nums">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-[var(--muted-text)]">Valores do mês corrente. A faturação certificada continua em simulação.</p>
    </section>
  );
}
