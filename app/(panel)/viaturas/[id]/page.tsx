import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteVehicle, saveVehicle } from "@/app/actions/records";
import { DeleteButton } from "@/components/delete-button";
import { PageHeader } from "@/components/page-header";
import { SaveForm } from "@/components/save-form";
import { StatusPill } from "@/components/status-pill";
import { VehicleFields } from "@/components/vehicle-fields";
import { prisma } from "@/lib/db";
import { orderStatusLabel } from "@/lib/labels";

export const metadata = { title: "Viatura" };

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [vehicle, clients] = await Promise.all([
    prisma.vehicle.findUnique({
      where: { id },
      include: { client: true, orders: { orderBy: { dateIn: "desc" }, take: 10 } },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!vehicle) notFound();
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <PageHeader title={vehicle.plate} description={`${vehicle.brand} ${vehicle.model}${vehicle.version ? ` ${vehicle.version}` : ""}${vehicle.engine ? ` · ${vehicle.engine}` : ""} · ${vehicle.client?.name ?? "Sem cliente"}`} />
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <SaveForm action={saveVehicle.bind(null, vehicle.id)}>
            <VehicleFields clients={clients} vehicle={vehicle} />
          </SaveForm>
          <div className="mt-4">
            <DeleteButton action={deleteVehicle.bind(null, vehicle.id)} confirmText="Eliminar esta viatura?" redirectTo="/viaturas" />
          </div>
        </div>
      </div>
      <aside className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="mb-3 font-medium">Histórico</h2>
        <ul className="grid gap-2 text-sm">
          {vehicle.orders.map((order) => (
            <li key={order.id} className="flex items-center justify-between gap-2">
              <Link href={`/ordens/${order.id}`} className="font-medium">{order.number}</Link>
              <StatusPill status={order.status} label={orderStatusLabel(order.status)} />
            </li>
          ))}
          {vehicle.orders.length === 0 ? <li className="text-muted-foreground">Sem ordens.</li> : null}
        </ul>
      </aside>
    </div>
  );
}
