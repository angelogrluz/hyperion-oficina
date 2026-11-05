import { STATUS_STYLES } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status] ?? "bg-muted text-foreground",
      )}
    >
      {label}
    </span>
  );
}
