import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteClient, saveClient } from "@/app/actions/records";
import { DeleteButton } from "@/components/delete-button";
import { PageHeader } from "@/components/page-header";
import { Plate } from "@/components/plate";
import { SaveForm } from "@/components/save-form";
import { StatusPill } from "@/components/status-pill";
import { ClientFields } from "@/components/client-fields";
import { prisma } from "@/lib/db";
import { orderStatusLabel } from "@/lib/labels";

export const metadata = { title: "Cliente" };

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      vehicles: { orderBy: { plate: "asc" } },
      orders: { include: { vehicle: true }, orderBy: { dateIn: "desc" }, take: 8 },
    },
  });
  if (!client) notFound();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <PageHeader title={client.name} description={`NIF ${client.nif}`} />
          <Link href={`/ordens/nova?cliente=${client.id}`} className="inline-flex h-10 items-center rounded-lg bg-[var(--glow)] px-4 text-sm font-medium text-white">Criar Nova Obra</Link>
        </div>
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <SaveForm action={saveClient.bind(null, client.id)}>
            <ClientFields client={client} />
          </SaveForm>
          <div className="mt-4">
            <DeleteButton action={deleteClient.bind(null, client.id)} confirmText="Eliminar este cliente?" redirectTo="/clientes" />
          </div>
        </div>
      </div>
      <aside className="grid gap-4">
        <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Viaturas</h2>
            <Link href={`/viaturas/nova?cliente=${client.id}`} className="text-sm font-medium text-primary">Nova</Link>
          </div>
          <ul className="grid gap-2">
            {client.vehicles.map((vehicle) => (
              <li key={vehicle.id}>
                <Link href={`/viaturas/${vehicle.id}`} className="flex items-center justify-between gap-2 text-sm">
                  <Plate value={vehicle.plate} />
                  <span>{vehicle.brand} {vehicle.model}</span>
                </Link>
              </li>
            ))}
            {client.vehicles.length === 0 ? <li className="text-sm text-muted-foreground">Ainda sem viaturas.</li> : null}
          </ul>
        </section>
        <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="mb-3 font-medium">Ordens recentes</h2>
          <ul className="grid gap-2 text-sm">
            {client.orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-2">
                <Link href={`/ordens/${order.id}`} className="font-medium">{order.number}</Link>
                <StatusPill status={order.status} label={orderStatusLabel(order.status)} />
              </li>
            ))}
            {client.orders.length === 0 ? <li className="text-muted-foreground">Sem ordens.</li> : null}
          </ul>
        </section>
      </aside>
    </div>
  );
}
