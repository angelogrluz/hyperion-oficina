import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { CarSide, carColor } from "@/components/car-side";
import { formatEUR } from "@/lib/format";

export type JobCard = {
  id: string;
  href: string;
  plate: string;
  model: string;
  status: string;
  approved: boolean;
  total: number;
  date: string;
};

export function JobBoard({ jobs }: { jobs: JobCard[] }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(168px, 188px))" }}>
      {jobs.map((job) => (
        <Link key={job.id} href={job.href} className="flex min-h-[168px] flex-col rounded-md border border-[#e6e7eb] bg-white px-2 pt-1.5 text-[#22272a] shadow-[0_1px_1px_rgba(34,39,42,.04)] hover:border-[#00a9fd]">
          <p className="text-[13px] leading-tight font-semibold">{job.plate}</p>
          <p className="truncate text-[11px] leading-tight text-[#8d939c]">{job.model}</p>
          <div className="my-1"><CarSide color={carColor(job.plate)} /></div>
          <p className={`text-[12px] leading-tight ${job.approved ? "text-[#2eaf62]" : "text-[#8d939c]"}`}>{job.status}</p>
          <p className="text-[16px] leading-tight font-semibold text-[#00a9fd] tabular-nums">{formatEUR(job.total)}</p>
          <div className="mt-auto flex items-center gap-1 border-t border-[#f0f1f4] pt-1 pb-1 text-[11px] text-[#8d939c]">
            <CalendarDays className="size-3" />
            <span className="truncate">{job.date}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
