import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultMargin,
  ecolubAmount,
  inheritedPurchaseHeader,
  includesSearch,
  isValidNif,
  isValidPlate,
  lineAmounts,
  nextCost,
  nifCheckDigit,
  normalizePlate,
  platesMatch,
  latestEntryCost,
  marginFromCost,
  prefillUnitCost,
  salePrice,
  stockDelta,
  sumTotals,
} from "./domain";
import { zonedDateTime } from "./format";

test("matrícula em texto livre", () => {
  assert.equal(normalizePlate("  ab 19 ck  "), "AB 19 CK");
  assert.equal(normalizePlate("12-AB-34"), "12-AB-34");
  assert.equal(normalizePlate("m-123-ab"), "M-123-AB");
  assert.equal(isValidPlate("AB-19-CK"), true);
  assert.equal(isValidPlate("00-AB-00"), true);
  assert.equal(isValidPlate("  "), false);
  assert.equal(platesMatch("AB-19-CK", "ab19ck"), true);
  assert.equal(platesMatch("AB 19 CK", "AB-19-CK"), true);
  assert.equal(includesSearch("Peugeot AB-19-CK", "ab19ck"), true);
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
  assert.equal(salePrice(22.5, 40), 31.5);
  assert.equal(marginFromCost(22.5, 31.5), 40);
  assert.equal(latestEntryCost([{ date: "2026-01-01", cost: 8 }, { date: "2026-03-01", cost: 10 }]), 10);
  assert.equal(prefillUnitCost({ costPrice: 22.5, lastCost: 10 }), 10);
  assert.equal(prefillUnitCost({ costPrice: 22.5, lastCost: null }), 22.5);
  assert.equal(marginFromCost(6.8, salePrice(6.8, 30)), 30);
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
