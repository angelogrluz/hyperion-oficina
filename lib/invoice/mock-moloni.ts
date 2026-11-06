import type { InvoiceAdapter, InvoiceDraft, InvoiceIssued } from "@/lib/invoice/types";
import { issueMoloniInvoice } from "@/lib/moloni/service";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockMoloniAdapter: InvoiceAdapter = {
  id: "mock-moloni",
  label: "Moloni (simulação)",
  simulated: true,
  async issue(draft: InvoiceDraft): Promise<InvoiceIssued> {
    if (process.env.NODE_ENV !== "test") {
      await wait(350);
    }
    return issueMoloniInvoice({
      orderId: draft.orderId,
      orderNumber: draft.orderNumber,
      sequence: draft.sequence,
      year: draft.year,
      customer: draft.customer,
      lines: draft.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        total: line.total,
      })),
      total: draft.totals.total,
      paymentMethod: draft.paymentMethod ?? "Transferência",
    });
  },
};

export const moloniAdapter: InvoiceAdapter = {
  id: "moloni",
  label: "Moloni",
  simulated: false,
  async issue(): Promise<InvoiceIssued> {
    const missing = ["MOLONI_CLIENT_ID", "MOLONI_CLIENT_SECRET", "MOLONI_USERNAME", "MOLONI_PASSWORD"].filter(
      (key) => !process.env[key],
    );
    if (missing.length > 0) {
      throw new Error(
        `Moloni não está configurado (${missing.join(", ")}). A oficina continua em modo de simulação.`,
      );
    }
    throw new Error(
      "O adaptador Moloni está preparado, mas ainda não emite documentos certificados. Use o modo de simulação.",
    );
  },
};
