import assert from "node:assert/strict";
import test from "node:test";
import { guessLineKind, toLineKind } from "@/lib/line-kinds";

test("stored families survive a reload", () => {
  assert.equal(toLineKind("servico"), "servico");
  assert.equal(toLineKind("servico_externo"), "servico_externo");
  assert.equal(toLineKind("mao_de_obra"), "mao_de_obra");
  assert.equal(toLineKind("peca"), "peca");
  assert.equal(toLineKind("outra"), "peca");
});

test("Novo (auto) does not turn everything into Peça", () => {
  assert.equal(guessLineKind({ ref: "MO", description: "Alinhamento", hasArticle: false }), "mao_de_obra");
  assert.equal(guessLineKind({ ref: "IPO", description: "Inspeção", hasArticle: false }), "servico_externo");
  assert.equal(guessLineKind({ ref: "DESL", description: "Deslocação ao centro", hasArticle: false }), "servico");
  assert.equal(guessLineKind({ ref: "P1", description: "Casquilho", hasArticle: true }), "peca");
});
