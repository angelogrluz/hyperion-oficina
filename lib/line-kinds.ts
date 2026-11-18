export type LineKind = "mao_de_obra" | "peca" | "servico" | "servico_externo";

export const LINE_KINDS: { value: LineKind; label: string }[] = [
  { value: "mao_de_obra", label: "Mão de obra" },
  { value: "peca", label: "Peça" },
  { value: "servico", label: "Serviço" },
  { value: "servico_externo", label: "Serviço externo" },
];

export function lineKindLabel(kind: string) {
  return LINE_KINDS.find((item) => item.value === kind)?.label ?? "Peça";
}

/** Services (labour, workshop services, external services) are not stock items. */
export function isServiceKind(kind: string) {
  return kind !== "peca";
}

/**
 * «Novo (auto)»: a stock article is a part; otherwise guess from the reference/description
 * (MO = labour, IPO/inspection = external service, travel/alignment = service), and a line
 * with an unknown reference is a part, without one it is labour.
 */
export function guessLineKind(input: { ref: string; description: string; hasArticle: boolean }): LineKind {
  if (input.hasArticle) return "peca";
  const ref = input.ref.trim().toUpperCase();
  const text = `${ref} ${input.description}`.toLowerCase();
  if (/^(MO|M\.O\.?|MAO|MÃO)$/.test(ref)) return "mao_de_obra";
  if (/^(IPO|SE)\b/.test(ref) || /inspe[cç][aã]o peri|inspe[cç][aã]o pri|\bipo\b|servi[cç]o externo/.test(text)) return "servico_externo";
  if (/desloca[cç]|alinhamento|diagn[oó]stico|servi[cç]o/.test(text)) return "servico";
  return ref ? "peca" : "mao_de_obra";
}
