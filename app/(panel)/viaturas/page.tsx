import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Plate } from "@/components/plate";
import { SearchBox } from "@/components/search-box";
import { TableShell, Td, Th } from "@/components/table-shell";
import { prisma } from "@/lib/db";
import { includesSearch } from "@/lib/domain";
import { formatQty } from "@/lib/format";

export const metadata = { title: "Viaturas" };

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q ?? "";
  const vehicles = await prisma.vehicle.findMany({ include: { client: true }, orderBy: { plate: "asc" } });
  const visible = vehicles.filter((vehicle) =>
    includesSearch(`${vehicle.plate} ${vehicle.brand} ${vehicle.model} ${vehicle.vin} ${vehicle.client?.name ?? ""}`, q),
  );
  return (
    <div>
      <PageHeader
        title="Viaturas"
        description="Cada matrícula fica ligada a um cliente."
        action={<Link href="/viaturas/nova" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Nova viatura</Link>}
      />
      <SearchBox placeholder="Matrícula, marca, modelo ou cliente" defaultValue={q} />
      {visible.length === 0 ? <EmptyState title="Nenhuma viatura encontrada." text="Registe a matrícula no formato AA-00-AA." /> : (
        <TableShell>
          <thead><tr><Th>Matrícula</Th><Th>Viatura</Th><Th>Cliente</Th><Th>Combustível</Th><Th className="text-right">Km</Th></tr></thead>
          <tbody>
            {visible.map((vehicle) => (
              <tr key={vehicle.id} className="relative border-t border-border hover:bg-accent/40">
                <Td><Link href={`/viaturas/${vehicle.id}`} className="after:absolute after:inset-0"><Plate value={vehicle.plate} /></Link></Td>
                <Td>{vehicle.brand} {vehicle.model}{vehicle.version ? ` ${vehicle.version}` : ""} · {vehicle.year}</Td>
                <Td>{vehicle.client?.name ?? "Sem cliente"}</Td>
                <Td>{vehicle.fuel}</Td>
                <Td className="text-right tabular-nums">{formatQty(vehicle.km)}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
