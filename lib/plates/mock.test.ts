import assert from "node:assert/strict";
import test from "node:test";
import { isValidVin } from "../domain";
import { lookupMockPlate } from "./mock";

test("matrículas de demonstração devolvem a viatura conhecida", () => {
  const result = lookupMockPlate("ab19ck");
  assert.equal(result.found, true);
  assert.equal(result.simulated, true);
  assert.equal(result.vehicle?.plate, "AB19CK");
  assert.equal(result.vehicle?.brand, "Peugeot");
  assert.equal(result.vehicle?.model, "208");
  assert.equal(result.vehicle?.version, "1.2 PureTech Active");
  assert.equal(result.vehicle?.year, 2020);
  assert.equal(result.vehicle?.fuel, "Gasolina");
  assert.equal(result.vehicle?.engine, "1.2 PureTech 75 kW");
  assert.equal(result.vehicle?.vin, "VF3CCHMZ6LS123456");
});

test("uma matrícula desconhecida é estável e plausível", () => {
  const first = lookupMockPlate("ZX-90-QW");
  const second = lookupMockPlate("zx90qw");
  assert.equal(first.found, true);
  assert.equal(first.simulated, true);
  assert.equal(first.vehicle?.plate, "ZX-90-QW");
  assert.equal(second.vehicle?.plate, "ZX90QW");
  assert.equal(first.vehicle?.brand, second.vehicle?.brand);
  assert.equal(first.vehicle?.model, second.vehicle?.model);
  assert.equal(first.vehicle?.year, second.vehicle?.year);
  assert.ok(first.vehicle);
  assert.equal(first.vehicle.brand.length > 1, true);
  assert.equal(first.vehicle.year >= 2008 && first.vehicle.year <= 2025, true);
  if (first.vehicle.vin) assert.equal(isValidVin(first.vehicle.vin), true);
});

test("matrícula antiga ou estrangeira é aceite", () => {
  const oldPlate = lookupMockPlate("12-34-AB");
  const foreign = lookupMockPlate("M 123 AB");
  assert.equal(oldPlate.found, true);
  assert.equal(oldPlate.vehicle?.plate, "12-34-AB");
  assert.equal(foreign.found, true);
  assert.equal(foreign.vehicle?.plate, "M 123 AB");
  const empty = lookupMockPlate("   ");
  assert.equal(empty.found, false);
});
