import type { ReactNode } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Plate } from "@/components/plate";
import { SearchBox } from "@/components/search-box";
import { StatusPill } from "@/components/status-pill";
import { TableShell, Td, Th } from "@/components/table-shell";
import { prisma } from "@/lib/db";
import { includesSearch, sumTotals } from "@/lib/domain";
import { formatEUR, formatMediumDate } from "@/lib/format";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Ordens de reparação" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const estado = params.estado ?? "";
  const orders = await prisma.repairOrder.findMany({
    where: estado ? { status: estado } : undefined,
    include: { client: true, vehicle: true, lines: true },
    orderBy: { dateIn: "desc" },
  });
  const visible = orders.filter((order) =>
    includesSearch(`${order.number} ${order.client?.name ?? ""} ${order.vehicle?.plate ?? ""} ${order.problem}`, q),
  );
  return (
    <div>
      <PageHeader
        title="Ordens de reparação"
        description="Da entrada da viatura até à fatura simulada."
        action={<Link href="/ordens/nova" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Nova ordem</Link>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Filter href="/ordens" active={!estado}>Todas</Filter>
        {ORDER_STATUSES.map((status) => (
          <Filter key={status.value} href={`/ordens?estado=${status.value}`} active={estado === status.value}>{status.label}</Filter>
        ))}
      </div>
      <SearchBox placeholder="Número, cliente, matrícula ou problema" defaultValue={q} />
      {visible.length === 0 ? <EmptyState title="Nenhuma ordem encontrada." text="Abra uma ordem quando a viatura entrar." /> : (
        <TableShell>
          <thead><tr><Th>Número</Th><Th>Entrada</Th><Th>Cliente</Th><Th>Viatura</Th><Th>Estado</Th><Th className="text-right">Total</Th></tr></thead>
          <tbody>
            {visible.map((order) => (
              <tr key={order.id} className="relative border-t border-border hover:bg-accent/40">
                <Td><Link href={`/ordens/${order.id}`} className="font-medium after:absolute after:inset-0">{order.number}</Link></Td>
                <Td>{formatMediumDate(order.dateIn)}</Td>
                <Td>{order.client?.name ?? "Sem cliente"}</Td>
                <Td>{order.vehicle ? <Plate value={order.vehicle.plate} /> : "—"}</Td>
                <Td><StatusPill status={order.status} label={orderStatusLabel(order.status)} /></Td>
                <Td className="text-right tabular-nums">{formatEUR(sumTotals(order.lines).total)}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}

function Filter({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={cn("rounded-full px-3 py-1 text-sm", active ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-foreground/10")}>
      {children}
    </Link>
  );
}
