import { prisma } from "@/lib/db";
import { lisbonParts } from "@/lib/format";

export async function editorCatalog() {
  const [clients, vehicles, articles, workshop] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({ orderBy: { plate: "asc" } }),
    prisma.article.findMany({ where: { active: true }, orderBy: { ref: "asc" } }),
    prisma.workshop.findUnique({ where: { id: "default" } }),
  ]);
  return {
    labourRate: workshop?.labourRate ?? 45,
    clients: clients.map((client) => ({ id: client.id, name: client.name, nif: client.nif })),
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      clientId: vehicle.clientId,
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      version: vehicle.version,
      year: vehicle.year,
      vin: vehicle.vin,
      engine: vehicle.engine,
      km: vehicle.km,
      fuel: vehicle.fuel,
    })),
    articles: articles.map((article) => ({
      id: article.id,
      ref: article.ref,
      description: article.description,
      costPrice: article.costPrice,
      marginPercent: article.marginPercent,
      vatRate: article.vatRate,
      stockQty: article.stockQty,
    })),
    today: lisbonParts().iso,
  };
}

export function editorLines(
  lines: Array<{
    id: string;
    kind: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    discountPercent?: number;
    vatRate: number;
    articleId: string | null;
    article: { ref: string } | null;
  }>,
) {
  return lines.map((line) => ({
    key: line.id,
    kind: line.kind === "mao_de_obra" ? ("mao_de_obra" as const) : ("peca" as const),
    description: line.description,
    quantity: String(line.quantity).replace(".", ","),
    unitPrice: String(line.unitPrice).replace(".", ","),
    unitCost: String(line.unitCost).replace(".", ","),
    discount: String(line.discountPercent ?? 0).replace(".", ","),
    vatRate: String(line.vatRate).replace(".", ","),
    articleId: line.articleId,
    ref: line.article?.ref ?? "",
  }));
}

export function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
