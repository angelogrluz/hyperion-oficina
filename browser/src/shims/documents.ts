import { issueInvoiceRecord, saveOrderRecord, saveQuoteRecord, convertQuoteRecord } from "../store";

export async function saveOrder(id: string | null, payload: unknown) {
  return saveOrderRecord(id, payload as Parameters<typeof saveOrderRecord>[1]);
}

export async function saveQuote(id: string | null, payload: unknown) {
  return saveQuoteRecord(id, payload as Parameters<typeof saveQuoteRecord>[1]);
}

export async function convertQuote(id: string) {
  return convertQuoteRecord(id);
}

export async function issueInvoice(orderId: string) {
  return issueInvoiceRecord(orderId);
}
