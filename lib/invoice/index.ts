import { moloniAdapter, mockMoloniAdapter } from "@/lib/invoice/mock-moloni";
import type { InvoiceAdapter } from "@/lib/invoice/types";

export function getInvoiceAdapter(): InvoiceAdapter {
  const provider = process.env.INVOICE_PROVIDER ?? "mock-moloni";
  if (provider === "mock" || provider === "mock-moloni") return mockMoloniAdapter;
  if (provider === "moloni") return moloniAdapter;
  throw new Error(
    `Fornecedor de faturação desconhecido (${provider}). Use mock-moloni até ligar um software certificado.`,
  );
}
