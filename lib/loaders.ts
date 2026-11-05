import { prisma } from "@/lib/db";

const documentInclude = {
  client: true,
  vehicle: true,
  lines: { orderBy: { position: "asc" as const }, include: { article: true } },
};

export function getOrder(id: string) {
  return prisma.repairOrder.findUnique({ where: { id }, include: documentInclude });
}

export function getQuote(id: string) {
  return prisma.quote.findUnique({
    where: { id },
    include: { ...documentInclude, order: true },
  });
}

export function getWorkshop() {
  return prisma.workshop.findUnique({ where: { id: "default" } });
}
