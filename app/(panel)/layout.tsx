import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <Shell user={{ name: user.name, email: user.email }}>{children}</Shell>;
}
