export type Approval = "aguarda" | "aprovado" | "recusado";

export const APPROVALS: Approval[] = ["aguarda", "aprovado", "recusado"];

export const APPROVAL_LABEL: Record<Approval, string> = {
  aguarda: "Aguarda aprovação",
  aprovado: "Aprovado",
  recusado: "Não aprovado",
};

export function normalizeApproval(value: string | undefined | null, status?: string): Approval {
  if (value === "aguarda" || value === "aprovado" || value === "recusado") return value;
  if (!status || status === "aberta") return "aguarda";
  return "aprovado";
}
