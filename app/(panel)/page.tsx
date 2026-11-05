import { JobBoard } from "@/components/job-board";
import { EmptyState } from "@/components/empty-state";
import { SimulationBanner } from "@/components/simulation-banner";
import { prisma } from "@/lib/db";
import { formatMediumDate } from "@/lib/format";
import { jobPresentation, orderTotal } from "@/lib/job-status";

export const metadata = { title: "Obras em curso" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const estado = (await searchParams).estado ?? "";
  const orders = await prisma.repairOrder.findMany({
    where: estado && estado !== "hoje" ? { status: estado } : { status: { not: "faturada" } },
    include: { vehicle: true, lines: true },
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
        <div className="mt-4">
          <JobBoard
            jobs={visible.map((order) => {
              const status = jobPresentation(order.status);
              return {
                id: order.id,
                href: `/ordens/${order.id}`,
                plate: order.vehicle.plate,
                model: `${order.vehicle.brand} ${order.vehicle.model}`,
                status: status.label,
                approved: status.approved,
                total: orderTotal(order.lines),
                date: formatMediumDate(order.dateIn),
              };
            })}
          />
        </div>
      )}
    </div>
  );
}
