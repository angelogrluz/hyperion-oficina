import { issueInvoiceRecord, issueQuoteRecord, saveOrderRecord, saveQuoteRecord, convertQuoteRecord, markOrderPaidRecord } from "../store";

export async function saveOrder(id: string | null, payload: unknown) {
  return saveOrderRecord(id, payload as Parameters<typeof saveOrderRecord>[1]);
}

export async function saveQuote(id: string | null, payload: unknown) {
  return saveQuoteRecord(id, payload as Parameters<typeof saveQuoteRecord>[1]);
}

export async function convertQuote(id: string) {
  return convertQuoteRecord(id);
}

export async function issueQuote(orderId: string) {
  return issueQuoteRecord(orderId);
}

export async function issueInvoice(orderId: string, paymentMethod: string) {
  return issueInvoiceRecord(orderId, paymentMethod);
}

export async function markOrderPaid(orderId: string) {
  return markOrderPaidRecord(orderId);
}
