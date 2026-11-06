import { notFound } from "next/navigation";
import { DocumentEditor } from "@/components/document-editor";
import { requireUser } from "@/lib/auth";
import { editorCatalog, editorLines } from "@/lib/editor-data";
import { lisbonISODate } from "@/lib/format";
import { getOrder } from "@/lib/loaders";

export const metadata = { title: "Ordem de reparação" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, catalog, user] = await Promise.all([getOrder(id), editorCatalog(), requireUser()]);
  if (!order) notFound();
  const locked = order.status === "faturada";
  return (
    <div>
      <DocumentEditor
        key={`${order.id}-${order.updatedAt.toISOString()}`}
        mode="order"
        documentId={order.id}
        number={order.number}
        savedStatus={order.status}
        locked={locked}
        labourRate={catalog.labourRate}
        clients={catalog.clients}
        vehicles={catalog.vehicles}
        articles={catalog.articles}
        suppliers={catalog.suppliers}
        invoice={order.invoiceNumber ? { number: order.invoiceNumber, provider: order.invoiceProvider ?? "Simulação" } : null}
        userName={user.name}
        printHref={`/ordens/${order.id}/imprimir`}
        initial={{
          clientId: order.clientId,
          vehicleId: order.vehicleId,
          dateIn: lisbonISODate(order.dateIn),
          dateOut: order.dateOut ? lisbonISODate(order.dateOut) : "",
          validUntil: "",
          km: String(order.km),
          problem: order.problem,
          notes: order.notes,
          status: order.status,
          lines: editorLines(order.lines),
        }}
      />
    </div>
  );
}
