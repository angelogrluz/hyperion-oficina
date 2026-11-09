import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentPaper } from "@/components/document-paper";
import { PrintButton } from "@/components/print-button";
import { requireUser } from "@/lib/auth";
import { getQuote } from "@/lib/loaders";
import { quoteToPrintable } from "@/lib/printable";

export const metadata = { title: "Imprimir orçamento" };

export default async function PrintQuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) notFound();
  const doc = quoteToPrintable(quote);
  doc.sheetNumber = quote.order?.number;
  return (
    <main className="min-h-screen bg-stone-200 px-4 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between">
        <Link href={`/orcamentos/${quote.id}`} className="text-sm font-medium">Voltar ao orçamento</Link>
        <div className="flex gap-2">
          <a href={`/api/orcamentos/${quote.id}/pdf`} className="inline-flex h-10 items-center rounded-lg bg-white px-3 text-sm ring-1 ring-black/10">Exportar PDF</a>
          <PrintButton />
        </div>
      </div>
      <DocumentPaper doc={doc} />
    </main>
  );
}
