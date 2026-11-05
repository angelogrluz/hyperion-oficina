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
import { QUOTE_STATUSES, quoteStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Orçamentos" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const estado = params.estado ?? "";
  const quotes = await prisma.quote.findMany({
    where: estado ? { status: estado } : undefined,
    include: { client: true, vehicle: true, lines: true },
    orderBy: { date: "desc" },
  });
  const visible = quotes.filter((quote) => includesSearch(`${quote.number} ${quote.client.name} ${quote.vehicle.plate} ${quote.problem}`, q));
  return (
    <div>
      <PageHeader
        title="Orçamentos"
        description="A mesma estrutura de uma ordem. Um orçamento aceite converte-se numa OR."
        action={<Link href="/orcamentos/novo" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Novo orçamento</Link>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Filter href="/orcamentos" active={!estado}>Todos</Filter>
        {QUOTE_STATUSES.map((status) => (
          <Filter key={status.value} href={`/orcamentos?estado=${status.value}`} active={estado === status.value}>{status.label}</Filter>
        ))}
      </div>
      <SearchBox placeholder="Número, cliente ou matrícula" defaultValue={q} />
      {visible.length === 0 ? <EmptyState title="Nenhum orçamento encontrado." text="Prepare um orçamento antes de abrir a ordem." /> : (
        <TableShell>
          <thead><tr><Th>Número</Th><Th>Data</Th><Th>Cliente</Th><Th>Viatura</Th><Th>Estado</Th><Th className="text-right">Total</Th></tr></thead>
          <tbody>
            {visible.map((quote) => (
              <tr key={quote.id} className="relative border-t border-border hover:bg-accent/40">
                <Td><Link href={`/orcamentos/${quote.id}`} className="font-medium after:absolute after:inset-0">{quote.number}</Link></Td>
                <Td>{formatMediumDate(quote.date)}</Td>
                <Td>{quote.client.name}</Td>
                <Td><Plate value={quote.vehicle.plate} /></Td>
                <Td><StatusPill status={quote.status} label={quoteStatusLabel(quote.status)} /></Td>
                <Td className="text-right tabular-nums">{formatEUR(sumTotals(quote.lines).total)}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}

function Filter({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return <Link href={href} className={cn("rounded-full px-3 py-1 text-sm", active ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-foreground/10")}>{children}</Link>;
}
