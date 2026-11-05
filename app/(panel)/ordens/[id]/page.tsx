import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentEditor } from "@/components/document-editor";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { editorCatalog, editorLines } from "@/lib/editor-data";
import { lisbonISODate } from "@/lib/format";
import { orderStatusLabel } from "@/lib/labels";
import { getOrder } from "@/lib/loaders";

export const metadata = { title: "Ordem de reparação" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, catalog] = await Promise.all([getOrder(id), editorCatalog()]);
  if (!order) notFound();
  const locked = order.status === "faturada";
  return (
    <div>
      <PageHeader
        eyebrow={orderStatusLabel(order.status)}
        title={order.number}
        description={order.invoiceNumber ? `Documento simulado ${order.invoiceNumber}` : "Pode imprimir ou exportar PDF em qualquer estado."}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={order.status} label={orderStatusLabel(order.status)} />
            <Link href={`/ordens/${order.id}/imprimir`} className="inline-flex h-10 items-center rounded-lg bg-card px-3 text-sm ring-1 ring-foreground/10">Imprimir</Link>
            <a href={`/api/ordens/${order.id}/pdf`} className="inline-flex h-10 items-center rounded-lg bg-card px-3 text-sm ring-1 ring-foreground/10">Exportar PDF</a>
          </div>
        }
      />
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
        invoice={order.invoiceNumber ? { number: order.invoiceNumber, provider: order.invoiceProvider ?? "Simulação" } : null}
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
