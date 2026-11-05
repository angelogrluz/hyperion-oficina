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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
      {jobs.map((job) => (
        <Link key={job.id} href={job.href} className="rounded-xl border border-[#d5ebed] bg-white p-3 shadow-sm hover:border-[#0b8f9c]">
          <p className="font-mono text-sm font-semibold">{job.plate}</p>
          <p className="truncate text-xs text-[#4d6d73]">{job.model}</p>
          <CarSide color={carColor(job.plate)} />
          <p className={`mt-1 text-sm ${job.approved ? "text-[#0b8f9c]" : "text-[#4d6d73]"}`}>{job.status}</p>
          <p className="text-lg font-semibold text-[#0b8f9c] tabular-nums">{formatEUR(job.total)}</p>
          <p className="text-xs text-[#4d6d73]">{job.date}</p>
        </Link>
      ))}
    </div>
  );
}
