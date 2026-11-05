import { DOCUMENT_TYPES, PAYMENT_METHODS } from "@/lib/labels";
import { isValidRef, normalizeRef } from "@/lib/domain";
import { cancelPurchaseRecord, savePurchasesRecord } from "../store";

export async function savePurchases(payload: unknown) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return { ok: false as const, error: "Adicione pelo menos uma linha." };
  }
  const lines = [];
  for (const line of payload) {
    if (!(DOCUMENT_TYPES as readonly string[]).includes(line.documentType)) {
      return { ok: false as const, error: "Tipo de documento inválido." };
    }
    if (!(PAYMENT_METHODS as readonly string[]).includes(line.paymentMethod)) {
      return { ok: false as const, error: "Modo de pagamento inválido." };
    }
    const ref = normalizeRef(String(line.ref ?? ""));
    if (!isValidRef(ref)) return { ok: false as const, error: `Referência inválida: ${line.ref || "(vazia)"}.` };
    lines.push({ ...line, ref });
  }
  return savePurchasesRecord(lines);
}

export async function cancelPurchase(id: string) {
  return cancelPurchaseRecord(id);
}
