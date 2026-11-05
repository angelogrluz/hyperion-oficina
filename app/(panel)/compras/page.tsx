import { PurchaseGrid } from "@/components/purchase-grid";
import { PageHeader } from "@/components/page-header";
import { VoidPurchaseButton } from "@/components/void-purchase";
import { prisma } from "@/lib/db";
import { lineAmounts } from "@/lib/domain";
import { formatEUR, formatMediumDate, formatQty, lisbonParts } from "@/lib/format";

export const metadata = { title: "Compras" };

export default async function PurchasesPage() {
  const [articles, suppliers, purchases] = await Promise.all([
    prisma.article.findMany({ where: { active: true }, orderBy: { ref: "asc" } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.purchase.findMany({
      include: { supplier: true, lines: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Compras a fornecedores"
        description="Grelha rápida para lançar a fatura. Ao gravar, o stock sobe e o preço de custo é a média ponderada. Uma linha de óleo pode acrescentar a ECOLUB a 0,09 € por litro, com margem 0%."
      />
      <PurchaseGrid
        today={lisbonParts().iso}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        articles={articles.map((article) => ({
          id: article.id,
          ref: article.ref,
          description: article.description,
          family: article.family,
          costPrice: article.costPrice,
          marginPercent: article.marginPercent,
          vatRate: article.vatRate,
          stockQty: article.stockQty,
          isOil: article.isOil,
        }))}
      />
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Lançamentos recentes</h2>
        <div className="grid gap-3">
          {purchases.map((purchase) => {
            const total = purchase.lines.reduce((sum, line) => sum + lineAmounts({ quantity: line.quantity, unitPrice: line.cost, unitCost: 0, vatRate: line.vatRate }).total, 0);
            return (
              <article key={purchase.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-medium ${purchase.voided ? "text-muted-foreground line-through" : ""}`}>
                      {purchase.invoiceNumber} · {purchase.supplier.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatMediumDate(purchase.date)} · {purchase.documentType} · {purchase.paymentMethod} · {formatEUR(total)}
                      {purchase.voided ? " · anulada" : ""}
                    </p>
                  </div>
                  {purchase.voided ? null : <VoidPurchaseButton id={purchase.id} />}
                </div>
                <ul className="mt-2 text-sm text-muted-foreground">
                  {purchase.lines.map((line) => (
                    <li key={line.id}>
                      <span className="font-mono text-foreground">{line.ref}</span> {line.description} · {formatQty(line.quantity)} × {formatEUR(line.cost)}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
