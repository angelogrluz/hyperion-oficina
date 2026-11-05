import { OrderListTable } from "@/components/order-list-table";
import { EmptyState } from "@/components/empty-state";
import { SimulationBanner } from "@/components/simulation-banner";
import { prisma } from "@/lib/db";
import { formatMediumDate } from "@/lib/format";
import { orderTotal } from "@/lib/job-status";
import { orderStatusLabel } from "@/lib/labels";

export const metadata = { title: "Obras em curso" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const estado = (await searchParams).estado ?? "";
  const orders = await prisma.repairOrder.findMany({
    where: estado && estado !== "hoje" ? { status: estado } : { status: { not: "faturada" } },
    include: { client: true, vehicle: true, lines: true },
    orderBy: { dateIn: "desc" },
  });
  const visible = estado === "hoje"
    ? orders.filter((order) => formatMediumDate(order.dateIn) === formatMediumDate(new Date()))
    : orders;

  return (
    <div>
      <SimulationBanner />
      {visible.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Sem obras neste filtro." text="Crie uma obra nova a partir da barra de ferramentas." />
        </div>
      ) : (
        <div className="mt-3">
          <OrderListTable
            rows={visible.map((order) => ({
              id: order.id,
              href: `/ordens/${order.id}`,
              number: order.number,
              date: formatMediumDate(order.dateIn),
              plate: order.vehicle.plate,
              vehicle: `${order.vehicle.brand} ${order.vehicle.model}`,
              client: order.client.name,
              status: orderStatusLabel(order.status),
              total: orderTotal(order.lines),
            }))}
          />
        </div>
      )}
    </div>
  );
}
