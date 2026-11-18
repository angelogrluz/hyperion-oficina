import assert from "node:assert/strict";
import test from "node:test";
import { buildInvoiceLines } from "@/lib/invoice-payload";
import { lineAmounts } from "@/lib/domain";

// Example obra with 8 lines (labour, external service, service, parts) and 10 % on the 10,12 € line.
const sample = [
  { kind: "mao_de_obra", ref: "MO", description: "Mão de obra A", quantity: 2, unitPrice: 45, vatRate: 23 },
  { kind: "servico_externo", ref: "IPO", description: "Inspeção", quantity: 1, unitPrice: 30.46, vatRate: 23 },
  { kind: "servico", ref: "DESL", description: "Deslocação", quantity: 1, unitPrice: 45, vatRate: 23 },
  { kind: "peca", ref: "P1.X", description: "Peça 1", quantity: 1, unitPrice: 10.12, discountPercent: 10, vatRate: 23 },
  { kind: "peca", ref: "P2", description: "Peça 2", quantity: 2, unitPrice: 12.265, vatRate: 23 },
  { kind: "mao_de_obra", ref: "MO", description: "Mão de obra B", quantity: 1, unitPrice: 20.33, vatRate: 23 },
  { kind: "peca", ref: "P3", description: "Peça 3", quantity: 1, unitPrice: 22.9, vatRate: 23 },
  { kind: "peca", ref: "P4", description: "Peça 4", quantity: 1, unitPrice: 22.9, vatRate: 23 },
];

test("8 lines: base 265,23 · IVA 61,01 · total 326,24", () => {
  const built = buildInvoiceLines(sample);
  assert.equal(built.base, 265.23);
  assert.equal(built.vat, 61.01);
  assert.equal(built.total, 326.24);
  // Prices go out without IVA, unrounded, with the discount and the line's own reference.
  assert.equal(built.lines[4].unitPrice, 12.265);
  assert.equal(built.lines[4].total, 24.53);
  assert.equal(built.lines[3].discountPercent, 10);
  assert.equal(built.lines[3].total, 9.108);
  assert.equal(built.lines[3].ref, "P1.X");
});

test("discounted line shows 9,108 and 11,20", () => {
  const line = lineAmounts({ quantity: 1, unitPrice: 10.12, unitCost: 0, vatRate: 23, discountPercent: 10 });
  assert.equal(line.base, 9.108);
  assert.equal(line.vat, 2.09);
  assert.equal(line.total, 11.2);
});

test("without the discount per-line IVA rounding gives 327,49", () => {
  const built = buildInvoiceLines(sample.map((line) => ({ ...line, discountPercent: 0 })));
  assert.equal(built.base, 266.24);
  assert.equal(built.vat, 61.25);
  assert.equal(built.total, 327.49);
});

test("40,077465 keeps its precision", () => {
  const built = buildInvoiceLines([{ kind: "peca", description: "x", quantity: 1, unitPrice: 40.077465, vatRate: 23 }]);
  assert.equal(built.lines[0].unitPrice, 40.077465);
  assert.equal(built.base, 40.08);
});
