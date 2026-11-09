import { DOCUMENT_TYPES, PAYMENT_METHODS } from "@/lib/labels";
import { isValidRef, normalizeRef } from "@/lib/domain";
import { purchaseTypeMovesStock } from "@/src/config";
import { cancelPurchaseRecord, commitStockEntryRecord, removeStockEntryRecord, savePurchasesRecord } from "../store";
import type { StockEntryInput } from "@/lib/stock-entry";

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
    const stock = purchaseTypeMovesStock(String(line.tipologia ?? "produto"));
    const ref = stock ? normalizeRef(String(line.ref ?? "")) : String(line.ref ?? "").trim();
    if (stock && !isValidRef(ref)) return { ok: false as const, error: `Referência inválida: ${line.ref || "(vazia)"}.` };
    if (!stock && String(line.description ?? "").trim().length < 2) {
      return { ok: false as const, error: "Indique a descrição da despesa." };
    }
    lines.push({ ...line, ref });
  }
  return savePurchasesRecord(lines);
}

export async function cancelPurchase(id: string) {
  return cancelPurchaseRecord(id);
}

export async function commitStockEntry(payload: unknown) {
  return commitStockEntryRecord(payload as StockEntryInput);
}

export async function removeStockEntry(purchaseLineId: string) {
  return removeStockEntryRecord(purchaseLineId);
}
