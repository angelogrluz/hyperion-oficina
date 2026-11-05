import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { salePrice } from "@/lib/domain";
import { postPurchases, voidPurchase } from "@/lib/stock";

async function main() {
const oil = await prisma.article.findUniqueOrThrow({ where: { ref: "OLEO-5W30" } });
const ecolub = await prisma.article.findUniqueOrThrow({ where: { ref: "ECOLUB" } });
assert.equal(oil.isOil, true);
assert.equal(oil.marginPercent, 30);
assert.equal(salePrice(oil.costPrice, oil.marginPercent), 8.84);
assert.equal(ecolub.marginPercent, 0);
assert.equal(salePrice(ecolub.costPrice, ecolub.marginPercent), 0.09);

const supplier = await prisma.supplier.findFirstOrThrow();
const before = oil.stockQty;
const beforeEco = ecolub.stockQty;
const result = await prisma.$transaction((tx) =>
  postPurchases(tx, [
    {
      date: "2026-11-05",
      supplierId: supplier.id,
      documentType: "Fatura",
      invoiceNumber: "SMOKE-1",
      paymentMethod: "Numerário",
      ref: "OLEO-5W30",
      description: "ÓLEO MOTOR 5W30 (L)",
      quantity: 2,
      cost: 7,
      vat: 23,
      margin: 30,
      family: "Óleo",
      isOil: true,
    },
  ]),
);
const after = await prisma.article.findUniqueOrThrow({ where: { ref: "OLEO-5W30" } });
assert.equal(after.stockQty, before + 2);
assert.equal(after.costPrice, Number(((before * oil.costPrice + 2 * 7) / (before + 2)).toFixed(2)));
await prisma.$transaction((tx) => voidPurchase(tx, result.purchaseIds[0]));
await prisma.article.update({ where: { ref: "OLEO-5W30" }, data: { costPrice: oil.costPrice, marginPercent: oil.marginPercent } });
const restored = await prisma.article.findUniqueOrThrow({ where: { ref: "OLEO-5W30" } });
assert.equal(restored.stockQty, before);
assert.equal(restored.costPrice, oil.costPrice);
assert.equal(ecolub.stockQty, beforeEco);
console.log("stock ok", { before, cost: restored.costPrice });
await prisma.$disconnect();
}

main();
