import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getQuote, getWorkshop } from "@/lib/loaders";
import { renderDocumentPdf } from "@/lib/pdf";
import { quoteToPrintable } from "@/lib/printable";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Não autenticado", { status: 401 });
  const { id } = await context.params;
  const [quote, workshop] = await Promise.all([getQuote(id), getWorkshop()]);
  if (!quote || !workshop) return new NextResponse("Não encontrado", { status: 404 });
  const pdf = await renderDocumentPdf(quoteToPrintable(quote), workshop);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.number}.pdf"`,
    },
  });
}
