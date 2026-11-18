import assert from "node:assert/strict";
import test from "node:test";
import { clientWithNif, matchClients, seedFromQuery } from "@/lib/client-search";

const clients = [
  { id: "1", name: "João Gonçalves", nif: "123456789", phone: "912 345 678", email: "joao@exemplo.pt" },
  { id: "2", name: "Belmiro Santos", nif: "515383147", phone: "+351 934 000 111", email: "" },
  { id: "3", name: "Hugo Issufo", nif: "", phone: "", email: "hugo@oficina.pt" },
  { id: "4", name: "Ana Joana Silva", nif: "245678901", phone: "", email: "" },
];
const vehicles = [{ clientId: "3", plate: "86-XQ-46" }];

test("matches names ignoring accents and case", () => {
  assert.deepEqual(matchClients(clients, "joao").map((c) => c.id), ["1"]);
  assert.deepEqual(matchClients(clients, "GONCALVES").map((c) => c.id), ["1"]);
  assert.deepEqual(matchClients(clients, "jo go").map((c) => c.id), ["1"]);
});

test("names that start with the text come first", () => {
  assert.deepEqual(matchClients(clients, "jo").map((c) => c.id), ["1", "4"]);
  assert.deepEqual(matchClients(clients, "silva").map((c) => c.id), ["4"]);
});

test("matches NIF, phone, e-mail and plate", () => {
  assert.deepEqual(matchClients(clients, "515383147").map((c) => c.id), ["2"]);
  assert.deepEqual(matchClients(clients, "934000").map((c) => c.id), ["2"]);
  assert.deepEqual(matchClients(clients, "+351934000111").map((c) => c.id), ["2"]);
  assert.deepEqual(matchClients(clients, "hugo@").map((c) => c.id), ["3"]);
  assert.deepEqual(matchClients(clients, "86xq", vehicles).map((c) => c.id), ["3"]);
});

test("empty search shows nothing", () => {
  assert.deepEqual(matchClients(clients, "  "), []);
  assert.deepEqual(matchClients(clients, "zzz"), []);
});

test("finds an existing client by NIF", () => {
  assert.equal(clientWithNif(clients, "515 383 147")?.id, "2");
  assert.equal(clientWithNif(clients, "515383147", "2"), undefined);
  assert.equal(clientWithNif(clients, ""), undefined);
});

test("seeds a new client from what was typed", () => {
  assert.deepEqual(seedFromQuery("Maria Lopes"), { name: "Maria Lopes", nif: "", phone: "" });
  assert.deepEqual(seedFromQuery("515383147"), { name: "", nif: "515383147", phone: "" });
  assert.deepEqual(seedFromQuery("912 000 000"), { name: "", nif: "", phone: "912 000 000" });
});
