import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SearchBox } from "@/components/search-box";
import { TableShell, Td, Th } from "@/components/table-shell";
import { prisma } from "@/lib/db";
import { includesSearch, priceWithVat, salePrice } from "@/lib/domain";
import { formatEUR, formatPercent, formatQty } from "@/lib/format";

export const metadata = { title: "Artigos" };

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q ?? "";
  const articles = await prisma.article.findMany({ where: { active: true }, orderBy: { ref: "asc" } });
  const visible = articles.filter((article) => includesSearch(`${article.ref} ${article.description} ${article.family}`, q));
  return (
    <div>
      <PageHeader
        title="Artigos"
        description="O PVP calcula-se sozinho: custo × (1 + margem). Óleos a 30%, restantes a 40%, eco taxa a 0%."
        action={<Link href="/artigos/novo" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Novo artigo</Link>}
      />
      <SearchBox placeholder="Referência, descrição ou família" defaultValue={q} />
      {visible.length === 0 ? <EmptyState title="Nenhum artigo encontrado." text="Crie um artigo ou lance-o numa compra a fornecedor." /> : (
        <TableShell>
          <thead>
            <tr>
              <Th>REF</Th><Th>Descrição</Th><Th>Família</Th><Th className="text-right">Custo</Th><Th className="text-right">Margem</Th><Th className="text-right">PVP s/ IVA</Th><Th className="text-right">PVP c/ IVA</Th><Th className="text-right">Stock</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((article) => {
              const pvp = salePrice(article.costPrice, article.marginPercent);
              const low = article.minStock > 0 && article.stockQty <= article.minStock;
              return (
                <tr key={article.id} className="relative border-t border-border hover:bg-accent/40">
                  <Td><Link href={`/artigos/${article.id}`} className="font-mono font-medium after:absolute after:inset-0">{article.ref}</Link></Td>
                  <Td>{article.description}</Td>
                  <Td>{article.family}</Td>
                  <Td className="text-right tabular-nums">{formatEUR(article.costPrice)}</Td>
                  <Td className="text-right tabular-nums">{formatPercent(article.marginPercent)}</Td>
                  <Td className="text-right tabular-nums">{formatEUR(pvp)}</Td>
                  <Td className="text-right tabular-nums">{formatEUR(priceWithVat(pvp, article.vatRate))}</Td>
                  <Td className={`text-right tabular-nums ${low ? "font-semibold text-amber-800" : ""}`}>{formatQty(article.stockQty)}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
