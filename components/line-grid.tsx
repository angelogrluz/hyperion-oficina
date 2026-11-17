"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

export type GridLine = {
  key: string;
  ref: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  vatRate: string;
  total: number;
};

type SortKey = "ref" | "description" | "quantity" | "unitPrice" | "discount" | "vatRate" | "total";

const COLUMNS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "ref", label: "Referência" },
  { key: "description", label: "Descrição" },
  { key: "quantity", label: "Qtd", align: "right" },
  { key: "unitPrice", label: "Preço unit.", align: "right" },
  { key: "discount", label: "Desc.%", align: "right" },
  { key: "vatRate", label: "IVA", align: "right" },
  { key: "total", label: "Total", align: "right" },
];

export function LineGrid({
  lines,
  locked,
  onChange,
  onRemove,
}: {
  lines: GridLine[];
  locked: boolean;
  onChange: (key: string, patch: Partial<Pick<GridLine, "ref" | "description" | "quantity" | "unitPrice" | "discount" | "vatRate">>) => void;
  onRemove: (key: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("description");
  const [direction, setDirection] = useState<-1 | 1>(1);
  const [filters, setFilters] = useState<Record<SortKey, string>>({
    ref: "",
    description: "",
    quantity: "",
    unitPrice: "",
    discount: "",
    vatRate: "",
    total: "",
  });

  const visible = useMemo(() => {
    const filtered = lines.filter((line) =>
      COLUMNS.every((column) => {
        const query = filters[column.key].trim().toLocaleLowerCase("pt");
        if (!query) return true;
        const value = column.key === "total" ? formatEUR(line.total) : line[column.key];
        return value.toLocaleLowerCase("pt").includes(query);
      }),
    );
    return [...filtered].sort((a, b) => {
      const result = sortKey === "total" ? a.total - b.total : a[sortKey].localeCompare(b[sortKey], "pt", { numeric: true });
      return result * direction;
    });
  }, [lines, filters, sortKey, direction]);

  const total = visible.reduce((sum, line) => sum + line.total, 0);

  function sortBy(key: SortKey) {
    if (sortKey === key) setDirection((current) => (current === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setDirection(1);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-xs">
        <thead className="bg-[var(--mist)] text-[var(--ink)]">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} className={cn("px-1.5 py-1.5 font-semibold", column.align === "right" && "text-right")}>
                <button type="button" className="inline-flex items-center gap-1" onClick={() => sortBy(column.key)}>
                  {column.label}
                  <span aria-hidden>{sortKey === column.key ? (direction === 1 ? "↑" : "↓") : "↕"}</span>
                </button>
              </th>
            ))}
            <th className="w-8" />
          </tr>
          <tr className="bg-white">
            {COLUMNS.map((column) => (
              <th key={`${column.key}-filter`} className="px-1 py-1 font-normal">
                <input
                  value={filters[column.key]}
                  aria-label={`Filtrar ${column.label}`}
                  onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                  className="h-6 w-full rounded border border-[var(--line)] px-1 text-xs"
                />
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-2 py-6 text-center text-[var(--muted-text)]">Sem linhas neste filtro.</td>
            </tr>
          ) : (
            visible.map((line, index) => (
              <tr key={line.key} className={cn("border-t border-[var(--line)]", index % 2 === 1 && "bg-[var(--paper)]")}>
                <Cell>
                  <CellInput value={line.ref} disabled={locked} label="Referência" onChange={(value) => onChange(line.key, { ref: value })} />
                </Cell>
                <Cell>
                  <CellInput value={line.description} disabled={locked} label="Descrição" onChange={(value) => onChange(line.key, { description: value })} />
                </Cell>
                <Cell align="right">
                  <CellInput value={line.quantity} disabled={locked} label="Quantidade" align="right" onChange={(value) => onChange(line.key, { quantity: value })} />
                </Cell>
                <Cell align="right">
                  <CellInput value={line.unitPrice} disabled={locked} label="Preço unitário" align="right" onChange={(value) => onChange(line.key, { unitPrice: value })} />
                </Cell>
                <Cell align="right">
                  <CellInput value={line.discount} disabled={locked} label="Desconto em percentagem" align="right" onChange={(value) => onChange(line.key, { discount: value })} />
                </Cell>
                <Cell align="right">
                  <CellInput value={line.vatRate} disabled={locked} label="IVA" align="right" onChange={(value) => onChange(line.key, { vatRate: value })} />
                </Cell>
                <td className="px-2 py-0.5 text-right font-medium text-[var(--glow)] tabular-nums">{formatEUR(line.total)}</td>
                <td className="px-1 py-0.5 text-right">
                  <button type="button" className="text-[var(--muted-text)] hover:text-[var(--ink)] disabled:opacity-40" disabled={locked} onClick={() => onRemove(line.key)} aria-label="Tirar linha">
                    ×
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-[var(--glow)]/30 bg-[var(--mist)] font-semibold text-[var(--ink)]">
            <td className="px-2 py-1.5" colSpan={6}>{visible.length} linhas</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{formatEUR(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Cell({ children, align }: { children: ReactNode; align?: "right" }) {
  return <td className={cn("px-1 py-0.5", align === "right" && "text-right")}>{children}</td>;
}

function CellInput({
  value,
  disabled,
  label,
  align,
  onChange,
}: {
  value: string;
  disabled: boolean;
  label: string;
  align?: "right";
  onChange: (value: string) => void;
}) {
  return (
    <Input
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      className={cn("h-7 border-transparent bg-transparent px-1 text-xs shadow-none focus:border-[var(--glow)] focus:bg-white", align === "right" && "text-right")}
    />
  );
}
