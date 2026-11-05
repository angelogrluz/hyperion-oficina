import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Plate } from "@/components/plate";
import { SimulationBanner } from "@/components/simulation-banner";
import { StatusPill } from "@/components/status-pill";
import { TableShell, Td, Th } from "@/components/table-shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { salePrice, sumTotals } from "@/lib/domain";
import { formatEUR, formatLongDate, formatMediumDate, formatQty, greeting, lisbonISODate, lisbonParts, lisbonTime, shiftMonth, zonedDateTime } from "@/lib/format";
import { orderStatusLabel } from "@/lib/labels";

export const metadata = { title: "Painel" };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const parts = lisbonParts(now);
  const monthStart = zonedDateTime(`${parts.year}-${pad(parts.month)}-01`, "00:00");
  const next = shiftMonth(parts.year, parts.month, 1);
  const monthEnd = zonedDateTime(`${next.year}-${pad(next.month)}-01`, "00:00");
  const today = parts.iso;
  const tomorrowDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  const dayStart = zonedDateTime(today, "00:00");
  const dayEnd = zonedDateTime(tomorrow, "00:00");

  const [openOrders, invoiced, articles, appointments] = await Promise.all([
    prisma.repairOrder.findMany({
      where: { status: { in: ["aberta", "em_curso", "concluida"] } },
      include: { client: true, vehicle: true, lines: true },
      orderBy: { dateIn: "asc" },
    }),
    prisma.repairOrder.findMany({
      where: { status: "faturada", invoiceIssuedAt: { gte: monthStart, lt: monthEnd } },
      include: { lines: true },
    }),
    prisma.article.findMany({ where: { active: true } }),
    prisma.appointment.findMany({
      where: { startsAt: { gte: dayStart, lt: dayEnd } },
      include: { client: true, vehicle: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const monthTotals = sumTotals(invoiced.flatMap((order) => order.lines));
  const marginRatio = monthTotals.base > 0 ? Math.round((monthTotals.margin / monthTotals.base) * 100) : 0;
  const lowStock = articles
    .filter((article) => article.minStock > 0 && article.stockQty <= article.minStock)
    .sort((a, b) => a.stockQty / a.minStock - b.stockQty / b.minStock);
  const counts = {
    aberta: openOrders.filter((order) => order.status === "aberta").length,
    em_curso: openOrders.filter((order) => order.status === "em_curso").length,
    concluida: openOrders.filter((order) => order.status === "concluida").length,
  };

  return (
    <div>
      <PageHeader
        eyebrow={formatLongDate(now)}
        title={`${greeting(now)}, ${user.name.split(" ")[0]}`}
        description="Ordens por fechar, faturação do mês e o que está em falta no stock."
        action={
          <Link href="/ordens/nova" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            Nova ordem
          </Link>
        }
      />
      <SimulationBanner />
      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Abertas" value={String(counts.aberta)} hint={`${counts.em_curso} em curso · ${counts.concluida} por faturar`} />
        <Stat label="Em curso" value={String(counts.em_curso)} hint="Viaturas na oficina" />
        <Stat label="Faturação do mês" value={formatEUR(monthTotals.total)} hint={`${formatEUR(monthTotals.base)} sem IVA`} />
        <Stat label="Margem bruta" value={formatEUR(monthTotals.margin)} hint={monthTotals.base ? `${marginRatio}% da base · mão de obra a custo zero` : "Ainda sem ordens faturadas este mês"} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Ordens por fechar</h2>
          {openOrders.length === 0 ? (
            <EmptyState title="Não há ordens abertas." text="Quando entrar uma viatura, crie a ordem de reparação." />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Ordem</Th>
                  <Th>Cliente</Th>
                  <Th>Viatura</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {openOrders.map((order) => {
                  const total = sumTotals(order.lines).total;
                  return (
                    <tr key={order.id} className="relative border-t border-border hover:bg-accent/40">
                      <Td>
                        <Link href={`/ordens/${order.id}`} className="font-medium after:absolute after:inset-0">
                          {order.number}
                        </Link>
                        <p className="text-xs text-muted-foreground">{formatMediumDate(order.dateIn)}</p>
                      </Td>
                      <Td>{order.client.name}</Td>
                      <Td><Plate value={order.vehicle.plate} /></Td>
                      <Td><StatusPill status={order.status} label={orderStatusLabel(order.status)} /></Td>
                      <Td className="text-right tabular-nums">{formatEUR(total)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          )}
        </section>
        <div className="grid gap-6">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Hoje na agenda</h2>
            {appointments.length === 0 ? (
              <EmptyState title="Sem marcações hoje." text="O calendário está em Agenda." />
            ) : (
              <ul className="grid gap-2">
                {appointments.map((item) => (
                  <li key={item.id} className="rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/10">
                    <p className="text-sm font-medium">{lisbonTime(item.startsAt)} · {item.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.client.name}
                      {item.vehicle ? ` · ${item.vehicle.plate}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/agenda?d=${today}`} className="mt-2 inline-block text-sm font-medium text-primary">
              Abrir a agenda
            </Link>
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Stock baixo</h2>
            {lowStock.length === 0 ? (
              <EmptyState title="Stock acima dos mínimos." text="Os alertas aparecem quando a quantidade chega ao mínimo." />
            ) : (
              <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
                {lowStock.map((article) => (
                  <li key={article.id} className="relative px-3 py-2 text-sm">
                    <Link href={`/artigos/${article.id}`} className="font-mono font-medium after:absolute after:inset-0">
                      {article.ref}
                    </Link>
                    <p className="text-muted-foreground">{article.description}</p>
                    <p className="tabular-nums">
                      {formatQty(article.stockQty)} / mín. {formatQty(article.minStock)} · PVP {formatEUR(salePrice(article.costPrice, article.marginPercent))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Dia de oficina: {lisbonISODate(now)}. A margem da mão de obra conta o preço de venda, sem custo de técnico.</p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </article>
  );
}
