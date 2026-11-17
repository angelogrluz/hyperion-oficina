import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { ApprovalBadge } from "@/components/approval-badge";
import { CarSide, carColor } from "@/components/car-side";
import type { Approval } from "@/lib/approval";
import { formatEUR } from "@/lib/format";

export type JobCard = {
  id: string;
  href: string;
  plate: string;
  model: string;
  status: string;
  approval: Approval;
  approvalAt?: string | null;
  approved: boolean;
  total: number;
  date: string;
};

export function JobBoard({ jobs }: { jobs: JobCard[] }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
      {jobs.map((job) => {
        const [day, time] = splitStamp(job.date);
        return (
          <Link key={job.id} href={job.href} className="flex min-h-[340px] w-full flex-col items-center overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white pt-4 text-center text-[var(--charcoal)] shadow-[0_6px_16px_rgba(34,39,42,.08)] hover:border-[var(--glow)]">
            <p className="px-2 text-[22px] leading-tight font-bold tracking-tight">{job.plate}</p>
            <p className="mt-0.5 max-w-full truncate px-3 text-[17px] leading-tight text-[#9aa0a8]">{job.model}</p>
            <div className="flex flex-1 items-center justify-center">
              <CarSide color={carColor(job.plate)} className="h-[78px] w-[150px]" />
            </div>
            <ApprovalBadge approval={job.approval} at={job.approvalAt} testId={`card-approval-${job.id}`} />
            <p className="mt-1 text-[16px] text-[#9aa0a8]">{job.status}</p>
            <p className="mt-1 mb-3 text-[26px] leading-none font-semibold text-[var(--glow)] tabular-nums">{formatEUR(job.total)}</p>
            <div className="flex h-8 w-full items-center justify-between border-t border-[#eceef2] bg-[var(--paper)] px-2 text-[16px] text-[var(--steel)]">
              <span className="flex items-center gap-1"><CalendarDays className="size-3" />{day}</span>
              <span>{time}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function splitStamp(value: string) {
  const parts = value.trim().split(/\s+/);
  if (parts.length < 2) return [value, ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}
