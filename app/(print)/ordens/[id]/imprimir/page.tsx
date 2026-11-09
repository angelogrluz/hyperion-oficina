import { notFound } from "next/navigation";
import { FolhaPrint } from "@/components/folha-print";
import { requireUser } from "@/lib/auth";
import { lineAmounts, sumTotals } from "@/lib/domain";
import { formatMediumDate } from "@/lib/format";
import { getOrder } from "@/lib/loaders";

export const metadata = { title: "Imprimir folha de obra" };

export default async function PrintOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();
  const money = order.lines.map((line) => ({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    unitCost: line.unitCost,
    vatRate: line.vatRate,
    discountPercent: line.discountPercent,
  }));
  const totals = sumTotals(money);
  return (
    <FolhaPrint
      autoPrint
      backHref={`/ordens/${order.id}`}
      documentId={order.id}
      number={order.number}
      dateLabel={formatMediumDate(order.dateIn)}
      client={order.client}
      vehicle={order.vehicle ? {
        plate: order.vehicle.plate,
        brand: order.vehicle.brand,
        model: order.vehicle.model,
        year: order.vehicle.year,
        vin: order.vehicle.vin,
        fuel: order.vehicle.fuel,
        km: order.km,
        kmOut: order.kmOut,
        oil: order.vehicle.oil,
      } : null}
      problem={order.problem}
      lines={order.lines.map((line, index) => ({
        kind: line.kind === "mao_de_obra" ? "mao_de_obra" : "peca",
        description: line.description,
        ref: line.article?.ref ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: lineAmounts(money[index]).total,
      }))}
      totals={{ base: totals.base, vat: totals.vat, total: totals.total }}
    />
  );
}
