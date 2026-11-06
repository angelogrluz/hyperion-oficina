import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { renderDocumentPdf } from "@/lib/pdf";
import { orderToPrintable } from "@/lib/printable";
import { getOrder, getWorkshop } from "@/lib/loaders";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Não autenticado", { status: 401 });
  const { id } = await context.params;
  const [order, workshop] = await Promise.all([getOrder(id), getWorkshop()]);
  if (!order || !workshop || !order.client || !order.vehicle) return new NextResponse("Não encontrado", { status: 404 });
  const pdf = await renderDocumentPdf(orderToPrintable({ ...order, client: order.client, vehicle: order.vehicle }), workshop);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${order.number}.pdf"`,
    },
  });
}
