import { notFound } from "next/navigation";
import { FolhaServicos } from "@/components/folha-servicos";
import { requireUser } from "@/lib/auth";
import { getOrder } from "@/lib/loaders";

export const metadata = { title: "Folha de serviços" };

export default async function ServicesSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ promessa?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const order = await getOrder(id);
  if (!order) notFound();
  return (
    <FolhaServicos
      autoPrint
      backHref={`/ordens/${order.id}`}
      documentId={order.id}
      number={order.number}
      enteredAt={order.createdAt.toISOString()}
      promiseDelivery={query.promessa ?? ""}
      userName={user.name}
      vehicle={order.vehicle ? {
        plate: order.vehicle.plate,
        brand: order.vehicle.brand,
        model: order.vehicle.model,
        year: order.vehicle.year,
        vin: order.vehicle.vin,
        version: order.vehicle.version,
        km: order.km,
      } : null}
      lines={order.lines.map((line) => ({
        description: line.description,
        ref: line.article?.ref ?? "",
        quantity: line.quantity,
      }))}
    />
  );
}
