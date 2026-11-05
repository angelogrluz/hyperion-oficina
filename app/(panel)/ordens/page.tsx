import Link from "next/link";
import { OrderListTable } from "@/components/order-list-table";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { formatMediumDate } from "@/lib/format";
import { orderTotal } from "@/lib/job-status";
import { orderStatusLabel } from "@/lib/labels";

export const metadata = { title: "Folhas de obra" };

export default async function OrdersPage() {
  const orders = await prisma.repairOrder.findMany({
    include: { client: true, vehicle: true, lines: true },
    orderBy: { dateIn: "desc" },
  });
  return (
    <div>
      <PageHeader
        title="Folhas de obra"
        description="Lista densa. Os cabeçalhos ordenam e filtram."
        action={<Link href="/ordens/nova" className="inline-flex h-9 items-center rounded-lg bg-[#0b8f9c] px-3 text-sm font-medium text-white">Nova obra</Link>}
      />
      <OrderListTable
        rows={orders.map((order) => ({
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
  );
}
