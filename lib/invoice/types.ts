export type InvoiceParty = {
  name: string;
  nif: string;
  address: string;
  postalCode?: string;
  city?: string;
  email: string;
  phone: string;
};

export type InvoiceDraftLine = {
  kind: "mao_de_obra" | "peca" | "servico" | "servico_externo";
  ref: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  base: number;
  vat: number;
  total: number;
};

export type InvoiceDraft = {
  orderId: string;
  orderNumber: string;
  sequence: number;
  year: number;
  issuedAt: string;
  currency: "EUR";
  seller: InvoiceParty;
  customer: InvoiceParty;
  vehicle: {
    plate: string;
    brand: string;
    model: string;
    year: number;
    vin: string;
    km: number;
  };
  lines: InvoiceDraftLine[];
  totals: {
    base: number;
    vat: number;
    total: number;
  };
  notes: string;
  paymentMethod?: string;
};

export type InvoiceIssued = {
  documentNumber: string;
  externalId: string;
  providerId: string;
  providerLabel: string;
  simulated: boolean;
};

export interface InvoiceAdapter {
  id: string;
  label: string;
  simulated: boolean;
  issue(draft: InvoiceDraft): Promise<InvoiceIssued>;
}
