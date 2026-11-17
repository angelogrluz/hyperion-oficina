"use client";

import { useState } from "react";
import Link from "next/link";
import { isValidNif, isValidPlate, normalizeNif, normalizePlate } from "@/lib/domain";
import { readSnapshot, saveArticleRecord, saveClientRecord, saveSupplierRecord, saveVehicleRecord } from "@/browser/src/store";

type Kind = "clientes" | "viaturas" | "fornecedores" | "servicos" | "produtos";

const ROWS: Array<{ id: Kind; label: string; href: string }> = [
  { id: "clientes", label: "Clientes", href: "/clientes" },
  { id: "viaturas", label: "Viaturas", href: "/viaturas" },
  { id: "fornecedores", label: "Fornecedores", href: "/fornecedores" },
  { id: "servicos", label: "Serviços", href: "/artigos" },
  { id: "produtos", label: "Produtos", href: "/artigos" },
];

type Preview = { kind: Kind; rows: Record<string, string>[]; errors: string[]; duplicates: number; fresh: number };

export function DataMigration() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");

  return (
    <div className="grid gap-3" data-testid="migracao-dados">
      <p className="text-[16px] text-[var(--muted-text)]">Exporta ou importa Excel e CSV. A importação mostra um resumo antes de gravar e salta duplicados: NIF nos clientes e fornecedores, matrícula nas viaturas, referência nos serviços e produtos.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[16px]">
          <thead><tr className="text-[var(--muted-text)]"><th className="py-2">Dados</th><th>Lista</th><th>Ficheiro</th></tr></thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
                <td className="py-3 font-semibold">{row.label}</td>
                <td><Link href={row.href} className="text-[var(--glow-deep)]">Abrir lista</Link></td>
                <td className="flex flex-wrap gap-2 py-2">
                  <button type="button" className="h-10 rounded-lg border px-3" onClick={() => void exportKind(row.id)}>Exportar</button>
                  <label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-[var(--ink)] px-3 font-semibold text-white">Importar
                    <input type="file" accept=".xlsx,.xls,.csv,text/csv" className="hidden" onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void prepare(row.id, file).then(setPreview);
                    }} />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview ? (
        <div className="rounded-xl border border-[var(--line)] p-3">
          <p className="font-semibold">Pré-visualização</p>
          <p className="text-[15px]">{preview.fresh} novos · {preview.duplicates} duplicados ignorados · {preview.errors.length} com erro</p>
          {preview.errors.slice(0, 6).map((error) => <p key={error} className="text-[14px] text-[#9c4036]">{error}</p>)}
          <div className="mt-2 flex gap-2">
            <button type="button" className="h-10 rounded-lg bg-[var(--glow)] px-3 font-semibold text-white" onClick={() => void commit(preview).then((message) => { setNotice(message); setPreview(null); })}>Gravar</button>
            <button type="button" className="h-10 rounded-lg border px-3" onClick={() => setPreview(null)}>Cancelar</button>
          </div>
        </div>
      ) : null}
      {notice ? <p className="text-[15px] text-[#1f9d55]">{notice}</p> : null}
    </div>
  );
}

async function readTable(file: File) {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false });
}

function cell(row: Record<string, string>, ...names: string[]) {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([key]) => key.trim().toLowerCase() === name.toLowerCase());
    if (found) return String(found[1] ?? "").trim();
  }
  return "";
}

async function prepare(kind: Kind, file: File): Promise<Preview> {
  const rows = await readTable(file);
  const snap = await readSnapshot();
  const errors: string[] = [];
  let duplicates = 0;
  let fresh = 0;
  const nifs = new Set(kind === "clientes" ? snap.clients.map((item) => item.nif) : snap.suppliers.map((item) => item.nif));
  const plates = new Set(snap.vehicles.map((item) => normalizePlate(item.plate)));
  const refs = new Set(snap.articles.map((item) => item.ref));
  rows.forEach((row, index) => {
    const line = index + 2;
    if (kind === "clientes" || kind === "fornecedores") {
      const nif = normalizeNif(cell(row, "NIF", "nif"));
      if (!cell(row, "Nome", "nome")) { errors.push(`Linha ${line}: falta o nome.`); return; }
      if (nif && !isValidNif(nif)) { errors.push(`Linha ${line}: NIF inválido.`); return; }
      if (nif && nifs.has(nif)) { duplicates += 1; return; }
      if (nif) nifs.add(nif);
      fresh += 1;
      return;
    }
    if (kind === "viaturas") {
      const plate = normalizePlate(cell(row, "Matrícula", "Matricula", "plate"));
      if (!isValidPlate(plate)) { errors.push(`Linha ${line}: matrícula inválida.`); return; }
      if (plates.has(plate)) { duplicates += 1; return; }
      plates.add(plate);
      fresh += 1;
      return;
    }
    const ref = cell(row, "Referência", "Referencia", "ref").toUpperCase();
    if (!cell(row, "Descrição", "Descricao", "description")) { errors.push(`Linha ${line}: falta a descrição.`); return; }
    if (ref && refs.has(ref)) { duplicates += 1; return; }
    if (ref) refs.add(ref);
    fresh += 1;
  });
  return { kind, rows, errors, duplicates, fresh };
}

async function commit(preview: Preview) {
  const snap = await readSnapshot();
  let saved = 0;
  let skipped = 0;
  for (const row of preview.rows) {
    if (preview.kind === "clientes") {
      const nif = normalizeNif(cell(row, "NIF", "nif"));
      if (!cell(row, "Nome", "nome") || (nif && !isValidNif(nif)) || (nif && snap.clients.some((item) => item.nif === nif))) { skipped += 1; continue; }
      const result = await saveClientRecord(null, { name: cell(row, "Nome", "nome"), nif, phone: cell(row, "Telefone", "telefone"), email: cell(row, "E-mail", "Email", "email"), address: cell(row, "Morada", "morada"), postalCode: cell(row, "Código postal", "Codigo postal", "postal"), city: cell(row, "Localidade", "Cidade", "city"), notes: cell(row, "Notas", "notas") });
      if (result.ok) saved += 1; else skipped += 1;
    } else if (preview.kind === "fornecedores") {
      const nif = normalizeNif(cell(row, "NIF", "nif"));
      if (!cell(row, "Nome", "nome") || (nif && !isValidNif(nif)) || (nif && snap.suppliers.some((item) => item.nif === nif))) { skipped += 1; continue; }
      const result = await saveSupplierRecord(null, { name: cell(row, "Nome", "nome"), nif, phone: cell(row, "Telefone", "telefone"), email: cell(row, "E-mail", "Email", "email"), address: cell(row, "Morada", "morada"), notes: cell(row, "Notas", "notas") });
      if (result.ok) saved += 1; else skipped += 1;
    } else if (preview.kind === "viaturas") {
      const plate = normalizePlate(cell(row, "Matrícula", "Matricula", "plate"));
      if (!isValidPlate(plate) || snap.vehicles.some((item) => normalizePlate(item.plate) === plate)) { skipped += 1; continue; }
      const nif = normalizeNif(cell(row, "NIF cliente", "NIF", "nif"));
      const client = snap.clients.find((item) => item.nif === nif);
      const result = await saveVehicleRecord(null, {
        plate, brand: cell(row, "Marca", "marca") || "—", model: cell(row, "Modelo", "modelo") || "—", version: cell(row, "Versão", "Versao", "version"),
        year: Number(cell(row, "Ano", "ano")) || new Date().getFullYear(), vin: cell(row, "VIN", "vin"), engine: cell(row, "Motor", "motor"), km: Number(cell(row, "Km", "km")) || 0,
        fuel: cell(row, "Combustível", "Combustivel") || "Gasolina", clientId: client?.id ?? snap.clients[0]?.id ?? null,
      });
      if (result.ok) saved += 1; else skipped += 1;
    } else {
      const description = cell(row, "Descrição", "Descricao", "description");
      let ref = cell(row, "Referência", "Referencia", "ref").toUpperCase();
      if (!description) { skipped += 1; continue; }
      if (!ref) ref = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
      if (snap.articles.some((item) => item.ref === ref)) { skipped += 1; continue; }
      const service = preview.kind === "servicos";
      const result = await saveArticleRecord(null, {
        ref, description, family: service ? "Serviço" : (cell(row, "Família", "Familia") || "Produto"),
        costPrice: Number(String(cell(row, "Custo", "Preço", "Preco")).replace(",", ".")) || 0,
        lastCost: null,
        marginPercent: Number(String(cell(row, "Margem")).replace(",", ".")) || 0,
        vatRate: Number(cell(row, "IVA", "iva")) || 23,
        stockQty: service ? 0 : Number(cell(row, "Stock", "Quantidade")) || 0,
        minStock: 0,
        isOil: false,
      });
      if (result.ok) { saved += 1; snap.articles.push({ id: result.id, ref, description, family: "", costPrice: 0, lastCost: null, marginPercent: 0, vatRate: 23, stockQty: 0, minStock: 0, isOil: false, active: true, createdAt: "", updatedAt: "" }); }
      else skipped += 1;
    }
  }
  return `Gravados ${saved}. Ignorados ${skipped}.`;
}

async function exportKind(kind: Kind) {
  const XLSX = await import("xlsx");
  const snap = await readSnapshot();
  const rows = kind === "clientes"
    ? snap.clients.map((item) => ({ Nome: item.name, NIF: item.nif, Telefone: item.phone, "E-mail": item.email, Morada: item.address, "Código postal": item.postalCode, Localidade: item.city, Notas: item.notes }))
    : kind === "fornecedores"
      ? snap.suppliers.map((item) => ({ Nome: item.name, NIF: item.nif, Telefone: item.phone, "E-mail": item.email, Morada: item.address, Notas: item.notes }))
      : kind === "viaturas"
        ? snap.vehicles.map((item) => ({ Matrícula: item.plate, Marca: item.brand, Modelo: item.model, Versão: item.version, Ano: item.year, Combustível: item.fuel, Motor: item.engine, VIN: item.vin, Km: item.km, "NIF cliente": snap.clients.find((client) => client.id === item.clientId)?.nif ?? "" }))
        : snap.articles.filter((item) => kind === "servicos" ? item.family === "Serviço" : item.family !== "Serviço").map((item) => ({ Referência: item.ref, Descrição: item.description, Família: item.family, Custo: item.costPrice, Margem: item.marginPercent, IVA: item.vatRate, Stock: item.stockQty }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Nota: "Sem linhas" }]), "Dados");
  XLSX.writeFile(book, `${kind}.xlsx`);
  const csv = XLSX.utils.sheet_to_csv(book.Sheets.Dados);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${kind}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
