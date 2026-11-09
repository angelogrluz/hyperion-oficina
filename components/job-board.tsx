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
    <div className="grid justify-start gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, 196px)" }}>
      {jobs.map((job) => {
        const [day, time] = splitStamp(job.date);
        return (
          <Link key={job.id} href={job.href} className="flex min-h-[300px] w-[196px] flex-col items-center overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white pt-3 text-center text-[#22272a] shadow-[0_6px_16px_rgba(34,39,42,.08)] hover:border-[#00a9fd]">
            <p className="px-2 text-[15px] leading-tight font-bold tracking-tight">{job.plate}</p>
            <p className="mt-0.5 max-w-full truncate px-3 text-[12px] leading-tight text-[#9aa0a8]">{job.model}</p>
            <div className="flex flex-1 items-center justify-center">
              <CarSide color={carColor(job.plate)} className="h-[78px] w-[150px]" />
            </div>
            <ApprovalBadge approval={job.approval} at={job.approvalAt} testId={`card-approval-${job.id}`} />
            <p className="mt-1 text-[11px] text-[#9aa0a8]">{job.status}</p>
            <p className="mt-1 mb-2 text-[20px] leading-none font-semibold text-[#00a9fd] tabular-nums">{formatEUR(job.total)}</p>
            <div className="flex h-8 w-full items-center justify-between border-t border-[#eceef2] bg-[#f7f8fa] px-2 text-[11px] text-[#8d939c]">
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
