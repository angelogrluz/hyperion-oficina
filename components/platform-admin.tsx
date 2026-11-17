"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/browser/src/cloud";
import type { CompanyStatus } from "@/browser/src/cloud";

type CompanyRow = {
  id: string;
  name: string;
  status: CompanyStatus;
  created_at: string;
  approved_at: string | null;
  notes: string | null;
  owner_email: string | null;
};

const FILTERS: Array<{ id: "pending" | "active" | "suspended" | "todas"; label: string }> = [
  { id: "pending", label: "Pendentes" },
  { id: "active", label: "Ativas" },
  { id: "suspended", label: "Suspensas" },
  { id: "todas", label: "Todas" },
];

export function PlatformAdmin() {
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("pending");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");

  async function load() {
    const db = supabase();
    if (!db) return;
    const { data, error: rpcError } = await db.rpc("admin_list_companies");
    if (rpcError) {
      setRows([]);
      setError(rpcError.message);
      return;
    }
    let payload: unknown = data;
    if (typeof data === "string") {
      try { payload = JSON.parse(data) as unknown; } catch { setRows([]); setError("A lista de oficinas veio num formato inesperado."); return; }
    }
    const list = Array.isArray(payload) ? payload : [];
    setRows(list.map((row) => {
      const item = row as CompanyRow;
      const status: CompanyStatus = item.status === "active" || item.status === "suspended" || item.status === "pending" ? item.status : "pending";
      return { ...item, status };
    }));
    setError("");
  }

  useEffect(() => { void load(); }, []);

  async function setStatus(id: string, status: CompanyStatus) {
    const db = supabase();
    if (!db) return;
    setPendingId(id);
    const { error: rpcError } = await db.rpc("admin_set_company_status", { p_company_id: id, p_status: status, p_notes: null });
    setPendingId("");
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  }

  const shown = rows.filter((row) => filter === "todas" || row.status === filter);

  return (
    <section data-testid="admin-oficinaplan" className="grid gap-4">
      <div>
        <h1 className="text-[26px] font-semibold">Administração OficinaPlan</h1>
        <p className="text-[16px] text-[#4d6d73]">Ativa a oficina depois de confirmares o pagamento. Não vês os dados dos clientes.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`h-10 rounded-full px-4 text-[16px] font-semibold ${filter === item.id ? "bg-[#22272a] text-white" : "bg-white ring-1 ring-[#d5ebed]"}`}>
            {item.label}
          </button>
        ))}
      </div>
      {error ? <p className="text-[16px] text-[#d64545]">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-[#d5ebed] bg-white">
        <table className="w-full min-w-[720px] text-left text-[16px]">
          <thead>
            <tr className="text-[14px] text-[#4d6d73]">
              <th className="px-3 py-2">Oficina</th>
              <th className="px-3 py-2">Dono</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-[#8d939c]">{error ? "A lista não chegou a carregar." : "Nenhuma oficina neste filtro."}</td></tr> : shown.map((row) => (
              <tr key={row.id} className="border-t border-[#eaeaf2]">
                <td className="px-3 py-3 font-semibold">{row.name}</td>
                <td className="px-3 py-3">{row.owner_email ?? "—"}</td>
                <td className="px-3 py-3">{row.created_at ? new Date(row.created_at).toLocaleDateString("pt-PT") : "—"}</td>
                <td className="px-3 py-3">{row.status === "active" ? "Ativa" : row.status === "suspended" ? "Suspensa" : "Pendente"}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    {row.status !== "active" ? <button type="button" disabled={pendingId === row.id} className="h-9 rounded-lg bg-[#1f9d55] px-3 text-[15px] font-semibold text-white" onClick={() => void setStatus(row.id, "active")}>Ativar</button> : null}
                    {row.status !== "suspended" ? <button type="button" disabled={pendingId === row.id} className="h-9 rounded-lg bg-[#d64545] px-3 text-[15px] font-semibold text-white" onClick={() => void setStatus(row.id, "suspended")}>Suspender</button> : null}
                    {row.status !== "pending" ? <button type="button" disabled={pendingId === row.id} className="h-9 rounded-lg border px-3 text-[15px]" onClick={() => void setStatus(row.id, "pending")}>Voltar a pendente</button> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
