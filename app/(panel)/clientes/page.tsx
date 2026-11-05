import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SearchBox } from "@/components/search-box";
import { TableShell, Td, Th } from "@/components/table-shell";
import { prisma } from "@/lib/db";
import { includesSearch } from "@/lib/domain";

export const metadata = { title: "Clientes" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q ?? "";
  const clients = await prisma.client.findMany({
    include: { _count: { select: { vehicles: true, orders: true } } },
    orderBy: { name: "asc" },
  });
  const visible = clients.filter((client) =>
    includesSearch(`${client.name} ${client.nif} ${client.phone} ${client.email} ${client.address}`, q),
  );

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Particulares e empresas com NIF, contacto e morada."
        action={<Link href="/clientes/novo" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Novo cliente</Link>}
      />
      <SearchBox placeholder="Nome, NIF, telefone ou e-mail" defaultValue={q} />
      {visible.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado." text="Crie o primeiro ou altere a pesquisa." />
      ) : (
        <TableShell>
          <thead>
            <tr><Th>Nome</Th><Th>NIF</Th><Th>Telefone</Th><Th>E-mail</Th><Th className="text-right">Viaturas</Th></tr>
          </thead>
          <tbody>
            {visible.map((client) => (
              <tr key={client.id} className="relative border-t border-border hover:bg-accent/40">
                <Td>
                  <Link href={`/clientes/${client.id}`} className="font-medium after:absolute after:inset-0">{client.name}</Link>
                </Td>
                <Td className="tabular-nums">{client.nif}</Td>
                <Td>{client.phone || "—"}</Td>
                <Td>{client.email || "—"}</Td>
                <Td className="text-right tabular-nums">{client._count.vehicles}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
