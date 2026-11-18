"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

export type OrderRow = {
  id: string;
  href: string;
  number: string;
  date: string;
  sortDate?: string;
  plate: string;
  vehicle: string;
  client: string;
  status: string;
  total: number;
};

type SortKey = "number" | "date" | "plate" | "vehicle" | "client" | "status" | "total";

const COLUMNS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "number", label: "Nº" },
  { key: "date", label: "Data" },
  { key: "plate", label: "Matrícula" },
  { key: "vehicle", label: "Viatura" },
  { key: "client", label: "Cliente" },
  { key: "status", label: "Estado" },
  { key: "total", label: "Total", align: "right" },
];

export function OrderListTable({ rows }: { rows: OrderRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [direction, setDirection] = useState<-1 | 1>(-1);
  const [filters, setFilters] = useState<Record<SortKey, string>>({
    number: "",
    date: "",
    plate: "",
    vehicle: "",
    client: "",
    status: "",
    total: "",
  });

  const visible = useMemo(() => {
    const filtered = rows.filter((row) =>
      COLUMNS.every((column) => {
        const query = filters[column.key].trim().toLocaleLowerCase("pt");
        if (!query) return true;
        const value = column.key === "total" ? formatEUR(row.total) : row[column.key];
        return value.toLocaleLowerCase("pt").includes(query);
      }),
    );
    return filtered.sort((a, b) => {
      if (sortKey === "date") {
        const byDate = (a.sortDate || a.date).localeCompare(b.sortDate || b.date) * direction;
        if (byDate !== 0) return byDate;
        return b.number.localeCompare(a.number, "pt", { numeric: true });
      }
      const result = sortKey === "total"
        ? a.total - b.total
        : String(a[sortKey]).localeCompare(String(b[sortKey]), "pt", { numeric: true });
      return result * direction;
    });
  }, [rows, filters, sortKey, direction]);

  const total = visible.reduce((sum, row) => sum + row.total, 0);

  function sortBy(key: SortKey) {
    if (sortKey === key) setDirection((current) => (current === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setDirection(key === "date" || key === "total" ? -1 : 1);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
      <table className="w-full min-w-[860px] border-collapse text-xs">
        <thead className="bg-[var(--mist)] text-[var(--ink)]">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} className={cn("px-2 py-1.5 font-semibold", column.align === "right" && "text-right")}>
                <button type="button" className="inline-flex items-center gap-1" onClick={() => sortBy(column.key)}>
                  {column.label}
                  <span aria-hidden>{sortKey === column.key ? (direction === 1 ? "↑" : "↓") : "↕"}</span>
                </button>
              </th>
            ))}
          </tr>
          <tr className="bg-white">
            {COLUMNS.map((column) => (
              <th key={`${column.key}-filter`} className="px-1 py-1 font-normal">
                <input
                  value={filters[column.key]}
                  aria-label={`Filtrar ${column.label}`}
                  onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                  className="h-7 w-full rounded border border-[var(--line)] bg-white px-1.5 text-xs text-[var(--ink)]"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="px-2 py-6 text-center text-[var(--muted-text)]">
                Nenhuma folha de obra corresponde aos filtros.
              </td>
            </tr>
          ) : (
            visible.map((row, index) => (
              <tr key={row.id} className={cn("border-t border-[var(--line)] hover:bg-[var(--mist)]", index % 2 === 1 && "bg-[var(--paper)]")}>
                <td className="px-2 py-1">
                  <Link href={row.href} className="font-semibold text-[var(--glow)]">{row.number}</Link>
                </td>
                <td className="px-2 py-1 whitespace-nowrap">{row.date}</td>
                <td className="px-2 py-1 font-mono whitespace-nowrap">{row.plate}</td>
                <td className="px-2 py-1">{row.vehicle}</td>
                <td className="px-2 py-1">{row.client}</td>
                <td className="px-2 py-1 whitespace-nowrap">{row.status}</td>
                <td className="px-2 py-1 text-right font-medium text-[var(--glow)] tabular-nums">{formatEUR(row.total)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-[var(--glow)]/30 bg-[var(--mist)] font-semibold text-[var(--ink)]">
            <td className="px-2 py-1.5" colSpan={6}>{visible.length} folhas</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{formatEUR(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
