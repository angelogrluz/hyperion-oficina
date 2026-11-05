import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shellTotals } from "@/lib/job-status";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const orders = await prisma.repairOrder.findMany({ include: { lines: true } });
  return <Shell user={{ name: user.name, email: user.email }} totals={shellTotals(orders)}>{children}</Shell>;
}
