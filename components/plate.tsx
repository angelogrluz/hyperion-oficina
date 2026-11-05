export function Plate({ value }: { value: string }) {
  return (
    <span className="inline-flex overflow-hidden rounded-[4px] border border-neutral-400 bg-white align-middle font-mono text-[13px] font-semibold tracking-wide text-neutral-950 shadow-sm">
      <span className="flex w-4 items-end justify-center bg-[#1d4e89] pb-0.5 text-[8px] font-bold text-white">
        P
      </span>
      <span className="px-1.5 py-0.5">{value}</span>
    </span>
  );
}
