"use client";

import { useEffect, useState } from "react";
import { listPlateLookups, nifStatus, plateStatus, saveNifKey, savePlateKey } from "@/browser/src/lookup-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LookupCards() {
  return (
    <>
      <NifCard />
      <PlateCard />
    </>
  );
}

function NifCard() {
  const [configured, setConfigured] = useState(false);
  const [key, setKey] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { void nifStatus().then((result) => setConfigured(result.configured)); }, []);
  return (
    <article data-testid="pesquisa-nif" className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold">Pesquisa de NIF</h2>
          <p className="text-[15px] text-[var(--muted-text)]">Ao escreveres o NIF de um cliente, o nome e a morada preenchem-se. A chave fica no servidor, não neste computador.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[14px] font-semibold ${configured ? "bg-[#1f9d55] text-white" : "bg-[var(--line)]"}`}>{configured ? "Chave guardada" : "Sem chave"}</span>
      </div>
      <label className="grid gap-1 text-[15px] font-medium">Chave da oficina
        <Input type="password" value={key} autoComplete="new-password" placeholder={configured ? "Escreve só se quiseres substituir" : ""} onChange={(event) => setKey(event.target.value)} className="h-11" />
      </label>
      <Button type="button" className="h-11 w-fit bg-[var(--ink)]" onClick={() => {
        void saveNifKey(key).then((result) => {
          setKey("");
          if (result.error) setNotice(result.error);
          else { setConfigured(true); setNotice("Chave guardada."); }
        });
      }}>Guardar chave</Button>
      {notice ? <p className="text-[15px]">{notice}</p> : null}
    </article>
  );
}

function PlateCard() {
  const now = new Date();
  const [info, setInfo] = useState({ providerLabel: "A definir", hasKey: false, message: "" });
  const [key, setKey] = useState("");
  const [notice, setNotice] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<Array<{ plate: string; lookedUpAt: string; brand: string; model: string }>>([]);
  useEffect(() => { void plateStatus().then((result) => setInfo(result)); }, []);
  useEffect(() => { void listPlateLookups(year, month).then((result) => setRows(result.rows)); }, [year, month]);
  return (
    <article data-testid="integracao-matriculas" className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
      <div>
        <h2 className="text-[20px] font-semibold">Matrículas</h2>
        <p className="text-[15px] text-[var(--muted-text)]">Fornecedor: {info.providerLabel}. Cada matrícula consultada fica guardada na viatura e não volta a gastar crédito.</p>
      </div>
      <p className="text-[15px]">{info.message || "A consulta fica desligada até haver chave e fornecedor."}</p>
      <label className="grid gap-1 text-[15px] font-medium">Chave Módulo
        <Input type="password" value={key} autoComplete="new-password" placeholder={info.hasKey ? "Chave guardada — escreve só para substituir" : ""} onChange={(event) => setKey(event.target.value)} className="h-11" />
      </label>
      <Button type="button" className="h-11 w-fit bg-[var(--ink)]" onClick={() => {
        void savePlateKey(key).then(async (result) => {
          setKey("");
          if (result.error) { setNotice(result.error); return; }
          setNotice("Chave guardada. A consulta continua desligada enquanto o fornecedor estiver por definir.");
          setInfo(await plateStatus());
        });
      }}>Guardar chave</Button>
      {notice ? <p className="text-[15px]">{notice}</p> : null}
      <div className="flex flex-wrap gap-2">
        <label className="text-[14px]">Mês
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="mt-1 block h-10 rounded-lg border bg-white px-2">
            {["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </select>
        </label>
        <label className="text-[14px]">Ano
          <input type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || year)} className="mt-1 block h-10 w-28 rounded-lg border px-2" />
        </label>
        <button type="button" className="mt-5 h-10 rounded-lg border px-3" onClick={() => void exportPlates(rows, year, month)}>Exportar Excel</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[15px]">
          <thead><tr className="text-[var(--muted-text)]"><th className="py-1">Matrícula</th><th>Data</th><th>Marca</th><th>Modelo</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={4} className="py-2 text-[var(--muted-text)]">Ainda não há matrículas consultadas neste mês.</td></tr> : rows.map((row) => (
              <tr key={row.plate} className="border-t border-[var(--line)]">
                <td className="py-2 font-mono">{row.plate}</td>
                <td>{new Date(row.lookedUpAt).toLocaleDateString("pt-PT")}</td>
                <td>{row.brand}</td>
                <td>{row.model}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

async function exportPlates(rows: Array<{ plate: string; lookedUpAt: string; brand: string; model: string }>, year: number, month: number) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
    Matrícula: row.plate,
    Data: new Date(row.lookedUpAt).toLocaleDateString("pt-PT"),
    Marca: row.brand,
    Modelo: row.model,
  })));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Matrículas");
  XLSX.writeFile(book, `matriculas-${year}-${String(month).padStart(2, "0")}.xlsx`);
}
