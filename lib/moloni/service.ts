export const SHEET_PAYMENTS = ["Numerário", "Multibanco", "MB Way", "Transferência", "Cartão"] as const;

export type SheetPayment = (typeof SHEET_PAYMENTS)[number];

export type MoloniCustomer = {
  name: string;
  nif: string;
  address: string;
  postalCode?: string;
  city?: string;
  email: string;
  phone: string;
};

export type MoloniLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  total: number;
  discountPercent?: number;
  ref?: string;
  kind?: string;
};

type IssueBase = {
  orderId: string;
  orderNumber: string;
  sequence: number;
  year: number;
  customer: MoloniCustomer;
  lines: MoloniLine[];
  total: number;
};

export function billingLabel(value: string | null | undefined) {
  if (!value) return value ?? "";
  const text = value.toLowerCase();
  if (text.includes("conta de teste")) return "Conta de teste";
  if (text.includes("simula")) return "Simulação (sem validade fiscal)";
  if (text.includes("rascunho") || text.includes("teste")) return "Rascunho de teste";
  if (text.includes("moloni")) return "Fatura certificada";
  if (text === "keymaster" || text === "importado") return "Importado";
  return value;
}

export type MoloniIssued = {
  documentNumber: string;
  externalId: string;
  url: string | null;
  providerId: string;
  providerLabel: string;
  simulated: boolean;
};

function sequence(value: number) {
  return String(value).padStart(4, "0");
}

function simulated(kind: "orcamento" | "fatura", input: IssueBase): MoloniIssued {
  const prefix = kind === "orcamento" ? "ORC" : "FT";
  const documentNumber = `${prefix} A/${input.year}/${sequence(input.sequence)}`;
  return {
    documentNumber,
    externalId: `sim_${kind}_${input.orderId}_${sequence(input.sequence)}`,
    url: null,
    providerId: "mock-moloni",
    providerLabel: "Simulação (sem validade fiscal)",
    simulated: true,
  };
}

function realMoloniConfigured() {
  return (process.env.INVOICE_PROVIDER ?? "mock-moloni") === "moloni";
}

function missingCredentials() {
  return ["MOLONI_CLIENT_ID", "MOLONI_CLIENT_SECRET", "MOLONI_USERNAME", "MOLONI_PASSWORD"].filter(
    (key) => !process.env[key],
  );
}

async function callMoloni(kind: "orcamento" | "fatura", input: IssueBase & { paymentMethod?: string }): Promise<MoloniIssued> {
  if (!realMoloniConfigured()) return simulated(kind, input);
  const missing = missingCredentials();
  if (missing.length) {
    throw new Error(`O programa de faturação não está configurado (${missing.join(", ")}). A oficina continua em simulação.`);
  }
  throw new Error("O programa de faturação ainda não está ligado. A oficina continua em simulação.");
}

export async function issueMoloniQuote(input: IssueBase) {
  return callMoloni("orcamento", input);
}

export async function issueMoloniInvoice(input: IssueBase & { paymentMethod: string }) {
  if (!SHEET_PAYMENTS.includes(input.paymentMethod as SheetPayment)) {
    throw new Error("Escolha o modo de pagamento.");
  }
  return callMoloni("fatura", input);
}
