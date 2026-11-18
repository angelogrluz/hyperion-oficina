import test from "node:test";
import assert from "node:assert/strict";
import { nextObraNumber, obraSequenceValue } from "./obra-number";

test("continues the imported Keymaster sequence", () => {
  assert.equal(nextObraNumber(["2026/57", "2026/302", "HIST-2026/120", "2026/301_1", "2026/90-FT2026/12"], 2026), "2026/303");
});

test("counts older OR- numbers and ignores other years", () => {
  assert.equal(nextObraNumber(["2025/900", "OR-2026-0004"], 2026), "2026/5");
  assert.equal(nextObraNumber([], 2027), "2027/1");
  assert.equal(obraSequenceValue("ORC-2026-0003", 2026), null);
});
