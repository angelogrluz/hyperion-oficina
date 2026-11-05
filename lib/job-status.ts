import { sumTotals } from "@/lib/domain";
import { lisbonISODate } from "@/lib/format";

export function jobPresentation(status: string) {
  if (status === "aberta") return { label: "Por Aprovar", approved: false };
  if (status === "em_curso") return { label: "Aprovado", approved: true };
  if (status === "concluida") return { label: "Processo fechado", approved: true };
  if (status === "faturada") return { label: "Faturada", approved: true };
  return { label: status, approved: false };
}

export function orderTotal(lines: Array<{ quantity: number; unitPrice: number; unitCost: number; vatRate: number }>) {
  return sumTotals(lines).total;
}

export function shellTotals(
  orders: Array<{ status: string; dateIn: Date; lines: Array<{ quantity: number; unitPrice: number; unitCost: number; vatRate: number }> }>,
) {
  const today = lisbonISODate(new Date());
  const sum = (predicate: (order: (typeof orders)[number]) => boolean) =>
    orders.filter(predicate).reduce((total, order) => total + orderTotal(order.lines), 0);
  return {
    porAprovar: sum((order) => order.status === "aberta"),
    aprovado: sum((order) => order.status === "em_curso" || order.status === "concluida"),
    paraHoje: sum((order) => lisbonISODate(order.dateIn) === today && order.status !== "faturada"),
  };
}
