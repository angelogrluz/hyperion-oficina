import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { lineAmounts } from "@/lib/domain";
import { historyLineInputs, rowsOf, wholeKm } from "@/lib/history-sheet";

const LINES = [
  ["FT2026/204", "LAVA-VIDROS", "Lavagem de vidros", 1, 0, 0, 23, 0],
  ["FT2026/204", "BRAKECLEANER", "Limpa travões", 10, 0, 0, 23, 0],
  ["FT2026/204", "PACK", "Pack", 1, 3, 0, 23, 3.69],
  ["FT2026/204", "ECOLUB", "Ecolub", 5, 0.09, 0, 23, 0.55],
  ["FT2026/204", "INEORCP", "Ineor", 1, 64.29, 0, 23, 79.08],
  ["FT2026/204", "F.HAB", "Filtro habitáculo", 1, 16.77, 0, 23, 20.63],
  ["", "F.AR", "Filtro de ar", 1, 15.92, 0, 23, 19.58],
  ["FT2026/204", "F.OLEO", "Filtro de óleo", 1, 4.4, 0, 23, 5.41],
  ["FT2026/204", "MANUTENCAO.A", "Manutenção", 1, 45, 0, 23, 55.35],
];

test("history lines stay one-to-one, including zero prices and dotted refs", () => {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Documento", "Referência", "Descrição", "Quantidade", "Preço unitário", "Desconto %", "IVA %", "Total"],
    ...LINES,
  ]);
  sheet["!merges"] = [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }];
  delete sheet.A3;
  XLSX.utils.book_append_sheet(book, sheet, "Linhas");

  const parsed = historyLineInputs(rowsOf(XLSX, book, 0));
  assert.equal(parsed.length, 9);
  assert.deepEqual(parsed.map((line) => line.ref), [
    "LAVA-VIDROS", "BRAKECLEANER", "PACK", "ECOLUB", "INEORCP", "F.HAB", "F.AR", "F.OLEO", "MANUTENCAO.A",
  ]);
  assert.equal(parsed[0].unitPrice, 0);
  assert.equal(parsed[1].quantity, 10);
  assert.equal(parsed[1].unitPrice, 0);
  assert.equal(parsed[6].document, "FT2026/204");
  assert.equal(parsed[6].ref, "F.AR");
  assert.ok(parsed.every((line) => line.document === "FT2026/204"));

  const total = parsed.reduce((sum, line) => sum + lineAmounts({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    unitCost: 0,
    discountPercent: line.discountPercent,
    vatRate: line.vatRate,
  }).total, 0);
  assert.equal(Math.round(total * 100) / 100, 184.29);
  assert.equal(wholeKm("102 283"), 102283);
  assert.equal(wholeKm("102.283"), 102283);
});
