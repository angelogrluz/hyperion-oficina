import { APPROVAL_LABEL, type Approval } from "@/lib/approval";
import { formatMediumDate, lisbonTime } from "@/lib/format";

const STYLES: Record<Approval, string> = {
  aguarda: "bg-[#f5a524] text-[#3a2a00]",
  aprovado: "bg-[#1f9d55] text-white",
  recusado: "bg-[#d64545] text-white",
};

export function ApprovalBadge({ approval, at, testId = "approval-badge" }: { approval: Approval; at?: string | null; testId?: string }) {
  const when = at ? new Date(at) : null;
  const stamp = when && !Number.isNaN(when.getTime()) ? `${formatMediumDate(when)} ${lisbonTime(when)}` : "";
  return (
    <span data-testid={testId} className={`inline-flex max-w-full flex-col items-start rounded px-1.5 py-0.5 text-[10px] leading-tight font-semibold ${STYLES[approval]}`}>
      <span>{APPROVAL_LABEL[approval]}</span>
      {stamp && approval !== "aguarda" ? <span className="font-medium opacity-90">{stamp}</span> : null}
    </span>
  );
}
