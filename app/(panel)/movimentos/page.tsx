import { StockMovements } from "@/components/stock-movements";
import { prisma } from "@/lib/db";

export const metadata = { title: "Movimentos de stock" };

export default async function MovementsPage() {
  const [articles, purchases, orders] = await Promise.all([
    prisma.article.findMany({ where: { active: true }, orderBy: { ref: "asc" } }),
    prisma.purchase.findMany({ include: { supplier: true, lines: true } }),
    prisma.repairOrder.findMany({ include: { client: true, vehicle: true, lines: true } }),
  ]);

  return (
    <StockMovements
      data={{
        articles: articles.map((article) => ({
          id: article.id,
          ref: article.ref,
          description: article.description,
          family: article.family,
          isOil: article.isOil,
          stockQty: article.stockQty,
        })),
        purchases: purchases.map((purchase) => ({
          id: purchase.id,
          date: purchase.date.toISOString(),
          createdAt: purchase.createdAt.toISOString(),
          documentType: purchase.documentType,
          invoiceNumber: purchase.invoiceNumber,
          voided: purchase.voided,
          supplierName: purchase.supplier.name,
        })),
        purchaseLines: purchases.flatMap((purchase) => purchase.lines.map((line) => ({
          id: line.id,
          purchaseId: line.purchaseId,
          articleId: line.articleId,
          tipologia: line.tipologia,
          ref: line.ref,
          quantity: line.quantity,
          cost: line.cost,
          position: line.position,
        }))),
        orders: orders.map((order) => ({
          id: order.id,
          number: order.number,
          dateIn: order.dateIn.toISOString(),
          createdAt: order.createdAt.toISOString(),
          invoiceNumber: order.invoiceNumber,
          clientName: order.client?.name ?? "",
          plate: order.vehicle?.plate ?? "",
        })),
        lines: orders.flatMap((order) => order.lines.map((line) => ({
          id: line.id,
          orderId: line.orderId,
          articleId: line.articleId,
          ref: "",
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          position: line.position,
          stockEntryPurchaseId: null,
        }))),
      }}
    />
  );
}
