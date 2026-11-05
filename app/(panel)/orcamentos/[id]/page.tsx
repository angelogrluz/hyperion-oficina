import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentEditor } from "@/components/document-editor";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { editorCatalog, editorLines } from "@/lib/editor-data";
import { lisbonISODate } from "@/lib/format";
import { quoteStatusLabel } from "@/lib/labels";
import { getQuote } from "@/lib/loaders";

export const metadata = { title: "Orçamento" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quote, catalog] = await Promise.all([getQuote(id), editorCatalog()]);
  if (!quote) notFound();
  const locked = quote.status === "convertido";
  return (
    <div>
      <PageHeader
        title={quote.number}
        description="Orçamento com as mesmas linhas de uma ordem de reparação."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={quote.status} label={quoteStatusLabel(quote.status)} />
            <Link href={`/orcamentos/${quote.id}/imprimir`} className="inline-flex h-10 items-center rounded-lg bg-card px-3 text-sm ring-1 ring-foreground/10">Imprimir</Link>
            <a href={`/api/orcamentos/${quote.id}/pdf`} className="inline-flex h-10 items-center rounded-lg bg-card px-3 text-sm ring-1 ring-foreground/10">Exportar PDF</a>
          </div>
        }
      />
      <DocumentEditor
        key={`${quote.id}-${quote.updatedAt.toISOString()}`}
        mode="quote"
        documentId={quote.id}
        number={quote.number}
        savedStatus={quote.status}
        locked={locked}
        labourRate={catalog.labourRate}
        clients={catalog.clients}
        vehicles={catalog.vehicles}
        articles={catalog.articles}
        orderHref={quote.order ? `/ordens/${quote.order.id}` : null}
        initial={{
          clientId: quote.clientId,
          vehicleId: quote.vehicleId,
          dateIn: lisbonISODate(quote.date),
          dateOut: "",
          validUntil: quote.validUntil ? lisbonISODate(quote.validUntil) : "",
          km: String(quote.km),
          problem: quote.problem,
          notes: quote.notes,
          status: quote.status,
          lines: editorLines(quote.lines),
        }}
      />
    </div>
  );
}
