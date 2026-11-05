import { cn } from "@/lib/utils";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "grid size-9 place-items-center rounded-lg text-base font-semibold",
          light ? "bg-white/10 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        H
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight">Hyperion</span>
        <span
          className={cn(
            "block text-[10px] font-medium tracking-[0.18em] uppercase",
            light ? "text-white/60" : "text-muted-foreground",
          )}
        >
          Car Lab
        </span>
      </span>
    </div>
  );
}
