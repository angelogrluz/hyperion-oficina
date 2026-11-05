import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultMargin,
  ecolubAmount,
  inheritedPurchaseHeader,
  isValidNif,
  isValidPlate,
  lineAmounts,
  nextCost,
  nifCheckDigit,
  normalizePlate,
  salePrice,
  stockDelta,
  sumTotals,
} from "./domain";
import { zonedDateTime } from "./format";

test("matrícula AA-00-AA", () => {
  assert.equal(normalizePlate("ab19ck"), "AB-19-CK");
  assert.equal(normalizePlate("AB-19-CK"), "AB-19-CK");
  assert.equal(isValidPlate("AB-19-CK"), true);
  assert.equal(isValidPlate("00-AB-00"), false);
  assert.equal(isValidPlate("AB-19-CKK"), false);
});

test("NIF português", () => {
  const nif = nifCheckDigit("24517839");
  assert.equal(nif.length, 9);
  assert.equal(isValidNif(nif), true);
  assert.equal(isValidNif(`${nif.slice(0, 8)}${(Number(nif[8]) + 1) % 10}`), false);
  assert.equal(isValidNif("123"), false);
});

test("PVP, margem e ECOLUB", () => {
  assert.equal(salePrice(10, 40), 14);
  assert.equal(salePrice(6.8, 30), 8.84);
  assert.equal(salePrice(0.09, 0), 0.09);
  assert.equal(defaultMargin({ family: "Óleo" }), 30);
  assert.equal(defaultMargin({ family: "Produto" }), 40);
  assert.equal(defaultMargin({ family: "Eco Taxa", ref: "ECOLUB" }), 0);
  assert.equal(ecolubAmount(5), 0.45);
  assert.equal(ecolubAmount(4.5), 0.41);
});

test("custo médio e impacto no stock", () => {
  assert.equal(nextCost(0, 0, 10, 5), 5);
  assert.equal(nextCost(10, 5, 10, 7), 6);
  assert.equal(stockDelta("Fatura", 3), 3);
  assert.equal(stockDelta("Nota de crédito", 3), -3);
});

test("totais de linha com IVA por linha", () => {
  const line = lineAmounts({ quantity: 2, unitPrice: 10, unitCost: 6, vatRate: 23 });
  assert.deepEqual(line, { base: 20, vat: 4.6, total: 24.6, margin: 8 });
  const sum = sumTotals([
    { quantity: 1, unitPrice: 45, unitCost: 0, vatRate: 23 },
    { quantity: 1, unitPrice: 10, unitCost: 6, vatRate: 23 },
  ]);
  assert.equal(sum.base, 55);
  assert.equal(sum.margin, 49);
  const discounted = lineAmounts({ quantity: 2, unitPrice: 10, unitCost: 6, vatRate: 23, discountPercent: 10 });
  assert.equal(discounted.base, 18);
  assert.equal(discounted.vat, 4.14);
  assert.equal(discounted.total, 22.14);
});

test("a linha nova herda o cabeçalho e nunca a quantidade", () => {
  const next = inheritedPurchaseHeader("2026-11-05", {
    date: "2026-11-01",
    supplierId: "fornecedor-1",
    documentType: "Fatura",
    invoiceNumber: "FT 441",
    paymentMethod: "Numerário",
  });
  assert.equal(next.date, "2026-11-01");
  assert.equal(next.supplierId, "fornecedor-1");
  assert.equal(next.documentType, "Fatura");
  assert.equal(next.invoiceNumber, "FT 441");
  assert.equal(next.paymentMethod, "Numerário");
  assert.equal("quantity" in next, false);
});

test("hora de Lisboa no inverno e no verão", () => {
  const winter = zonedDateTime("2026-11-05", "09:30");
  assert.equal(winter.toISOString(), "2026-11-05T09:30:00.000Z");
  const summer = zonedDateTime("2026-07-15", "09:30");
  assert.equal(summer.toISOString(), "2026-07-15T08:30:00.000Z");
});
