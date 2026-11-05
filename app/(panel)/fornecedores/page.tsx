import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SearchBox } from "@/components/search-box";
import { TableShell, Td, Th } from "@/components/table-shell";
import { prisma } from "@/lib/db";
import { includesSearch } from "@/lib/domain";

export const metadata = { title: "Fornecedores" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q ?? "";
  const suppliers = await prisma.supplier.findMany({ include: { _count: { select: { purchases: true } } }, orderBy: { name: "asc" } });
  const visible = suppliers.filter((supplier) => includesSearch(`${supplier.name} ${supplier.nif} ${supplier.phone} ${supplier.email}`, q));
  return (
    <div>
      <PageHeader
        title="Fornecedores"
        description="Quem vende peças, óleos e consumíveis à oficina."
        action={<Link href="/fornecedores/novo" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Novo fornecedor</Link>}
      />
      <SearchBox placeholder="Nome, NIF ou telefone" defaultValue={q} />
      {visible.length === 0 ? <EmptyState title="Nenhum fornecedor encontrado." text="Crie o fornecedor antes de lançar a fatura." /> : (
        <TableShell>
          <thead><tr><Th>Nome</Th><Th>NIF</Th><Th>Telefone</Th><Th className="text-right">Compras</Th></tr></thead>
          <tbody>
            {visible.map((supplier) => (
              <tr key={supplier.id} className="relative border-t border-border hover:bg-accent/40">
                <Td><Link href={`/fornecedores/${supplier.id}`} className="font-medium after:absolute after:inset-0">{supplier.name}</Link></Td>
                <Td className="tabular-nums">{supplier.nif || "—"}</Td>
                <Td>{supplier.phone || "—"}</Td>
                <Td className="text-right tabular-nums">{supplier._count.purchases}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
