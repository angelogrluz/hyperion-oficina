import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TableShell, Td, Th } from "@/components/table-shell";
import { prisma } from "@/lib/db";
import { formatEUR, formatMediumDate } from "@/lib/format";
import { orderTotal } from "@/lib/job-status";

export const metadata = { title: "Listagem de Documentos" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const filtro = (await searchParams).filtro ?? "liquidar";
  const orders = await prisma.repairOrder.findMany({
    where: { invoiceNumber: { not: null } },
    include: { client: true, vehicle: true, lines: true },
    orderBy: { invoiceIssuedAt: "desc" },
  });
  const visible = filtro === "todos" ? orders : orders.filter((order) => order.status === "faturada");
  const total = visible.reduce((sum, order) => sum + orderTotal(order.lines), 0);

  return (
    <div>
      <PageHeader title="Listagem de Documentos" description="Faturas emitidas pelo adaptador. Nesta versão são todas simuladas e ficam por liquidar." />
      <div className="mb-3 flex gap-3 text-sm">
        <Link href="/documentos" className={filtro !== "todos" ? "font-semibold text-[#0b8f9c]" : ""}>Por liquidar</Link>
        <Link href="/documentos?filtro=todos" className={filtro === "todos" ? "font-semibold text-[#0b8f9c]" : ""}>Todos</Link>
      </div>
      <TableShell>
        <thead>
          <tr><Th>N.º doc.</Th><Th>Data</Th><Th>Cliente</Th><Th>Viatura</Th><Th className="text-right">Total</Th></tr>
        </thead>
        <tbody>
          {visible.map((order) => (
            <tr key={order.id} className="relative border-t border-border hover:bg-[#e7f7f8]">
              <Td><Link href={`/ordens/${order.id}`} className="font-medium text-[#0b8f9c] after:absolute after:inset-0">{order.invoiceNumber}</Link></Td>
              <Td>{order.invoiceIssuedAt ? formatMediumDate(order.invoiceIssuedAt) : "—"}</Td>
              <Td>{order.client?.name ?? "Sem cliente"}</Td>
              <Td>{order.vehicle?.plate ?? "—"}</Td>
              <Td className="text-right tabular-nums">{formatEUR(orderTotal(order.lines))}</Td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      <p className="mt-3 text-right text-sm font-semibold">Total {formatEUR(total)}</p>
    </div>
  );
}
