import assert from "node:assert/strict";
import test from "node:test";
import { isValidVin } from "../domain";
import { lookupMockPlate } from "./mock";

test("matrículas de demonstração devolvem a viatura conhecida", () => {
  const result = lookupMockPlate("ab19ck");
  assert.equal(result.found, true);
  assert.equal(result.simulated, true);
  assert.equal(result.vehicle?.plate, "AB-19-CK");
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
  assert.deepEqual(first.vehicle, second.vehicle);
  assert.ok(first.vehicle);
  assert.equal(first.vehicle.brand.length > 1, true);
  assert.equal(first.vehicle.year >= 2008 && first.vehicle.year <= 2025, true);
  if (first.vehicle.vin) assert.equal(isValidVin(first.vehicle.vin), true);
});

test("matrícula inválida não devolve viatura", () => {
  const result = lookupMockPlate("00-AB-00");
  assert.equal(result.found, false);
  assert.equal(result.vehicle, null);
  assert.equal(result.simulated, true);
});
