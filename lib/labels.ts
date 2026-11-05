export const FUELS = ["Gasolina", "Gasóleo", "Híbrido", "Elétrico", "GPL"] as const;

export const FAMILIES = [
  "Produto",
  "Óleo",
  "Eco Taxa",
  "Filtros",
  "Travões",
  "Ignição",
  "Outro",
] as const;

export const DOCUMENT_TYPES = [
  "Fatura",
  "Fatura-recibo",
  "Nota de crédito",
  "Guia de remessa",
] as const;

export const PAYMENT_METHODS = [
  "Transferência",
  "Multibanco",
  "Numerário",
  "Cartão",
  "Crédito",
] as const;

export const ORDER_STATUSES = [
  { value: "aberta", label: "Aberta" },
  { value: "em_curso", label: "Em curso" },
  { value: "concluida", label: "Concluída" },
  { value: "faturada", label: "Faturada" },
] as const;

export const QUOTE_STATUSES = [
  { value: "aberto", label: "Aberto" },
  { value: "aceite", label: "Aceite" },
  { value: "recusado", label: "Recusado" },
  { value: "convertido", label: "Convertido" },
] as const;

export function orderStatusLabel(status: string) {
  return ORDER_STATUSES.find((item) => item.value === status)?.label ?? status;
}

export function quoteStatusLabel(status: string) {
  return QUOTE_STATUSES.find((item) => item.value === status)?.label ?? status;
}

export const STATUS_STYLES: Record<string, string> = {
  aberta: "bg-stone-200 text-stone-800",
  em_curso: "bg-amber-100 text-amber-950",
  concluida: "bg-sky-100 text-sky-950",
  faturada: "bg-emerald-100 text-emerald-950",
  aberto: "bg-sky-100 text-sky-950",
  aceite: "bg-emerald-100 text-emerald-950",
  recusado: "bg-rose-100 text-rose-950",
  convertido: "bg-violet-100 text-violet-950",
};
