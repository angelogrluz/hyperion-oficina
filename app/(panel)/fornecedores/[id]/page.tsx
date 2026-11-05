import { notFound } from "next/navigation";
import { deleteSupplier, saveSupplier } from "@/app/actions/records";
import { DeleteButton } from "@/components/delete-button";
import { PageHeader } from "@/components/page-header";
import { SaveForm } from "@/components/save-form";
import { SupplierFields } from "@/components/supplier-fields";
import { prisma } from "@/lib/db";
import { formatEUR, formatMediumDate } from "@/lib/format";
import { lineAmounts } from "@/lib/domain";

export const metadata = { title: "Fornecedor" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { purchases: { include: { lines: true }, orderBy: { date: "desc" }, take: 8 } },
  });
  if (!supplier) notFound();
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <PageHeader title={supplier.name} description={supplier.nif ? `NIF ${supplier.nif}` : "Sem NIF"} />
        <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <SaveForm action={saveSupplier.bind(null, supplier.id)}>
            <SupplierFields supplier={supplier} />
          </SaveForm>
          <div className="mt-4">
            <DeleteButton action={deleteSupplier.bind(null, supplier.id)} confirmText="Eliminar este fornecedor?" redirectTo="/fornecedores" />
          </div>
        </div>
      </div>
      <aside className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="mb-3 font-medium">Últimas compras</h2>
        <ul className="grid gap-3 text-sm">
          {supplier.purchases.map((purchase) => {
            const total = purchase.lines.reduce((sum, line) => sum + lineAmounts({ quantity: line.quantity, unitPrice: line.cost, unitCost: 0, vatRate: line.vatRate }).total, 0);
            return (
              <li key={purchase.id} className={purchase.voided ? "text-muted-foreground line-through" : ""}>
                <p className="font-medium">{purchase.invoiceNumber}</p>
                <p>{formatMediumDate(purchase.date)} · {formatEUR(total)}</p>
              </li>
            );
          })}
          {supplier.purchases.length === 0 ? <li className="text-muted-foreground">Ainda sem compras.</li> : null}
        </ul>
      </aside>
    </div>
  );
}
