"use client";

import { useState } from "react";
import Link from "next/link";
import { isValidNif, isValidPlate, lineAmounts, normalizeNif, normalizePlate, platesMatch } from "@/lib/domain";
import { CONSUMIDOR_FINAL } from "@/lib/consumidor";
import {
  clientConflict,
  normalizePersonName,
  normalizePhone,
  readSnapshot,
  replaceSnapshot,
  type Article,
  type Client,
  type DocLine,
  type Order,
  type Snapshot,
  type Supplier,
  type Vehicle,
} from "@/browser/src/store";

type Kind = "clientes" | "viaturas" | "fornecedores" | "servicos" | "produtos" | "historico";

const ROWS: Array<{ id: Kind; label: string; href: string }> = [
  { id: "clientes", label: "Clientes", href: "/clientes" },
  { id: "viaturas", label: "Viaturas", href: "/viaturas" },
  { id: "fornecedores", label: "Fornecedores", href: "/fornecedores" },
  { id: "servicos", label: "Serviços", href: "/artigos" },
  { id: "produtos", label: "Produtos", href: "/artigos" },
  { id: "historico", label: "Obras faturadas (histórico)", href: "/faturas" },
];

type Preview = {
  kind: Kind;
  errors: string[];
  duplicates: number;
  fresh: number;
  clients: Client[];
  vehicles: Vehicle[];
  suppliers: Supplier[];
  articles: Article[];
  orders: Order[];
  lines: DocLine[];
  kmUpdates: Array<{ vehicleId: string; km: number }>;
};

const emptyPlan = (kind: Kind): Preview => ({ kind, errors: [], duplicates: 0, fresh: 0, clients: [], vehicles: [], suppliers: [], articles: [], orders: [], lines: [], kmUpdates: [] });

export function DataMigration() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [progress, setProgress] = useState("");
  const [docsFile, setDocsFile] = useState<File | null>(null);
  const [linesFile, setLinesFile] = useState<File | null>(null);

  return (
    <div className="grid gap-3" data-testid="migracao-dados">
      <p className="text-[16px] text-[var(--muted-text)]">A importação mostra o resumo e grava tudo de uma vez. O NIF é opcional. Uma viatura sem cliente fica como «Sem cliente».</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[16px]">
          <thead><tr className="text-[var(--muted-text)]"><th className="py-2">Dados</th><th>Lista</th><th>Ficheiro</th></tr></thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
                <td className="py-3 font-semibold">{row.label}</td>
                <td><Link href={row.href} className="text-[var(--glow-deep)]">Abrir lista</Link></td>
                <td className="flex flex-wrap items-center gap-2 py-2">
                  <button type="button" className="h-10 rounded-lg border px-3" onClick={() => void exportKind(row.id)}>Exportar</button>
                  {row.id === "historico" ? (
                    <>
                      <label className="text-[14px]">Documentos
                        <input type="file" accept=".xlsx,.xls,.csv,text/csv" className="mt-1 block text-[14px]" onChange={(event) => setDocsFile(event.target.files?.[0] ?? null)} />
                      </label>
                      <label className="text-[14px]">Linhas
                        <input type="file" accept=".xlsx,.xls,.csv,text/csv" className="mt-1 block text-[14px]" onChange={(event) => setLinesFile(event.target.files?.[0] ?? null)} />
                      </label>
                      <button type="button" className="h-10 rounded-lg bg-[var(--ink)] px-3 font-semibold text-white" onClick={() => { if (docsFile) void prepareHistory(docsFile, linesFile).then(setPreview); }}>Importar</button>
                    </>
                  ) : (
                    <label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-[var(--ink)] px-3 font-semibold text-white">Importar
                      <input type="file" accept=".xlsx,.xls,.csv,text/csv" className="hidden" onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void prepare(row.id, file).then(setPreview);
                      }} />
                    </label>
                  )}
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
          {preview.errors.slice(0, 8).map((error) => <p key={error} className="text-[14px] text-[#9c4036]">{error}</p>)}
          <div className="mt-2 flex gap-2">
            <button type="button" className="h-10 rounded-lg bg-[var(--glow)] px-3 font-semibold text-white" disabled={Boolean(progress)} onClick={() => {
              setFailure("");
              setNotice("");
              void commit(preview, setProgress).then((result) => {
                setProgress("");
                if (!result.ok) { setFailure(result.error); return; }
                setNotice(result.message);
                setPreview(null);
              });
            }}>Gravar</button>
            <button type="button" className="h-10 rounded-lg border px-3" onClick={() => setPreview(null)}>Cancelar</button>
          </div>
        </div>
      ) : null}
      {progress ? <p className="text-[15px] text-[var(--glow-deep)]">{progress}</p> : null}
      {failure ? <p className="text-[15px] font-semibold text-[#9c4036]" role="alert">{failure}</p> : null}
      {notice ? <p className="text-[15px] text-[#1f9d55]">{notice}</p> : null}
    </div>
  );
}

async function readTable(file: File) {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return { XLSX, book, rows: rowsOf(XLSX, book, 0) };
}

function rowsOf(XLSX: typeof import("xlsx"), book: import("xlsx").WorkBook, index: number) {
  const name = book.SheetNames[index];
  if (!name) return [] as Record<string, string>[];
  return XLSX.utils.sheet_to_json<Record<string, string>>(book.Sheets[name], { defval: "", raw: false });
}

function cell(row: Record<string, string>, ...names: string[]) {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([key]) => key.trim().toLowerCase() === name.toLowerCase());
    if (found) return String(found[1] ?? "").trim();
  }
  return "";
}

function money(value: string) {
  const text = value.trim().replace(/\s/g, "");
  if (!text) return 0;
  if (text.includes(",") && text.includes(".")) return Number(text.replace(/\./g, "").replace(",", ".")) || 0;
  if (text.includes(",")) return Number(text.replace(",", ".")) || 0;
  return Number(text) || 0;
}

function parseWhen(value: string) {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12)).toISOString();
  const pt = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (pt) return new Date(Date.UTC(Number(pt[3]), Number(pt[2]) - 1, Number(pt[1]), 12)).toISOString();
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function linkClient(clients: Client[], nifValue: string, name: string) {
  const nif = normalizeNif(nifValue);
  if (nif && nif !== CONSUMIDOR_FINAL.nif) {
    const found = clients.filter((client) => normalizeNif(client.nif) === nif);
    if (found.length === 1) return found[0].id;
  }
  const wanted = normalizePersonName(name);
  if (!wanted) return null;
  const named = clients.filter((client) => normalizePersonName(client.name) === wanted);
  return named.length === 1 ? named[0].id : null;
}

function stamp() {
  return new Date().toISOString();
}

async function prepare(kind: Kind, file: File): Promise<Preview> {
  const { rows } = await readTable(file);
  const snap = await readSnapshot();
  const plan = emptyPlan(kind);
  if (kind === "clientes") planClients(plan, snap, rows);
  else if (kind === "fornecedores") planSuppliers(plan, snap, rows);
  else if (kind === "viaturas") planVehicles(plan, snap, rows);
  else planArticles(plan, snap, rows, kind === "servicos");
  return plan;
}

function planClients(plan: Preview, snap: Snapshot, rows: Record<string, string>[]) {
  const clients = [...snap.clients];
  rows.forEach((row, index) => {
    const line = index + 2;
    const name = cell(row, "Nome", "nome");
    const nif = normalizeNif(cell(row, "NIF", "nif"));
    const phone = cell(row, "Telefone", "telefone");
    if (!name) { plan.errors.push(`Linha ${line}: falta o nome.`); return; }
    const conflict = clientConflict(clients, { name, nif, phone });
    if (conflict === "NIF inválido.") { plan.errors.push(`Linha ${line}: NIF inválido.`); return; }
    if (conflict) { plan.duplicates += 1; return; }
    const now = stamp();
    const created: Client = { id: crypto.randomUUID(), name, nif, phone, email: cell(row, "E-mail", "Email", "email"), address: cell(row, "Morada", "morada"), postalCode: cell(row, "Código postal", "Codigo postal", "postal"), city: cell(row, "Localidade", "Cidade", "city"), notes: cell(row, "Notas", "notas"), createdAt: now, updatedAt: now };
    clients.push(created);
    plan.clients.push(created);
    plan.fresh += 1;
  });
}

function planSuppliers(plan: Preview, snap: Snapshot, rows: Record<string, string>[]) {
  const nifs = new Set(snap.suppliers.map((item) => normalizeNif(item.nif)).filter(Boolean));
  rows.forEach((row, index) => {
    const line = index + 2;
    const name = cell(row, "Nome", "nome");
    const nif = normalizeNif(cell(row, "NIF", "nif"));
    if (!name) { plan.errors.push(`Linha ${line}: falta o nome.`); return; }
    if (nif && nif !== CONSUMIDOR_FINAL.nif && !isValidNif(nif)) { plan.errors.push(`Linha ${line}: NIF inválido.`); return; }
    if (nif && nif !== CONSUMIDOR_FINAL.nif && nifs.has(nif)) { plan.duplicates += 1; return; }
    if (nif && nif !== CONSUMIDOR_FINAL.nif) nifs.add(nif);
    const now = stamp();
    plan.suppliers.push({ id: crypto.randomUUID(), name, nif, phone: cell(row, "Telefone", "telefone"), email: cell(row, "E-mail", "Email", "email"), address: cell(row, "Morada", "morada"), notes: cell(row, "Notas", "notas"), createdAt: now, updatedAt: now });
    plan.fresh += 1;
  });
}

function planVehicles(plan: Preview, snap: Snapshot, rows: Record<string, string>[]) {
  const plates = new Set(snap.vehicles.map((item) => normalizePlate(item.plate)));
  rows.forEach((row, index) => {
    const line = index + 2;
    const plate = normalizePlate(cell(row, "Matrícula", "Matricula", "plate"));
    if (!isValidPlate(plate)) { plan.errors.push(`Linha ${line}: matrícula inválida.`); return; }
    if (plates.has(plate)) { plan.duplicates += 1; return; }
    plates.add(plate);
    const yearText = cell(row, "Ano", "ano");
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : null;
    const now = stamp();
    plan.vehicles.push({
      id: crypto.randomUUID(),
      plate,
      brand: cell(row, "Marca", "marca"),
      model: cell(row, "Modelo", "modelo"),
      version: cell(row, "Versão", "Versao", "version"),
      year,
      vin: cell(row, "VIN", "vin").toUpperCase(),
      engine: cell(row, "Motor", "motor"),
      km: Number(cell(row, "Km", "km")) || 0,
      fuel: cell(row, "Combustível", "Combustivel", "fuel"),
      clientId: linkClient(snap.clients, cell(row, "NIF cliente", "NIF", "nif"), cell(row, "Cliente", "cliente")),
      createdAt: now,
      updatedAt: now,
    });
    plan.fresh += 1;
  });
}

function planArticles(plan: Preview, snap: Snapshot, rows: Record<string, string>[], service: boolean) {
  const refs = new Set(snap.articles.map((item) => item.ref));
  rows.forEach((row, index) => {
    const line = index + 2;
    const description = cell(row, "Descrição", "Descricao", "description");
    let ref = cell(row, "Referência", "Referencia", "ref").toUpperCase();
    if (!description) { plan.errors.push(`Linha ${line}: falta a descrição.`); return; }
    if (!ref) ref = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
    if (ref.length < 2 || refs.has(ref)) { if (refs.has(ref)) plan.duplicates += 1; else plan.errors.push(`Linha ${line}: referência inválida.`); return; }
    refs.add(ref);
    const now = stamp();
    plan.articles.push({
      id: crypto.randomUUID(), ref, description, family: service ? "Serviço" : (cell(row, "Família", "Familia") || "Produto"),
      costPrice: money(cell(row, "Custo", "Preço", "Preco")), lastCost: null,
      marginPercent: money(cell(row, "Margem")), vatRate: money(cell(row, "IVA", "iva")) || 23,
      stockQty: service ? 0 : money(cell(row, "Stock", "Quantidade")), minStock: 0, isOil: false, active: true, createdAt: now, updatedAt: now,
    });
    plan.fresh += 1;
  });
}

async function prepareHistory(docsFile: File, linesFile: File | null): Promise<Preview> {
  const loaded = await readTable(docsFile);
  let documents = loaded.rows;
  let lineRows: Record<string, string>[] = [];
  const names = loaded.book.SheetNames;
  const lineSheet = names.findIndex((name) => /linha/i.test(name));
  const docSheet = names.findIndex((name) => /document|fatura|obra/i.test(name));
  if (names.length > 1 && !linesFile) {
    documents = rowsOf(loaded.XLSX, loaded.book, docSheet >= 0 ? docSheet : 0);
    lineRows = rowsOf(loaded.XLSX, loaded.book, lineSheet >= 0 ? lineSheet : 1);
  } else if (linesFile) {
    lineRows = (await readTable(linesFile)).rows;
  }
  const snap = await readSnapshot();
  const plan = emptyPlan("historico");
  const known = new Set(snap.orders.map((order) => (order.invoiceNumber ?? "").trim().toLowerCase()).filter(Boolean));
  const numbers = new Set(snap.orders.map((order) => order.number));
  const accepted = new Map<string, string>();
  documents.forEach((row, index) => {
    const line = index + 2;
    const documento = cell(row, "Documento", "documento");
    const when = parseWhen(cell(row, "Data", "data"));
    if (!documento) { plan.errors.push(`Documento linha ${line}: falta o número.`); return; }
    if (!when) { plan.errors.push(`Documento ${documento}: data inválida.`); return; }
    const key = documento.toLowerCase();
    if (known.has(key)) { plan.duplicates += 1; return; }
    known.add(key);
    const plate = normalizePlate(cell(row, "Matrícula", "Matricula"));
    const vehicle = plate ? snap.vehicles.find((item) => platesMatch(item.plate, plate)) : undefined;
    const clientId = linkClient(snap.clients, cell(row, "NIF cliente"), cell(row, "Cliente", "cliente"));
    let number = cell(row, "Nº obra", "N° obra", "No obra", "Numero obra") || documento;
    if (numbers.has(number)) number = `${number}-${documento}`;
    numbers.add(number);
    const km = Number(cell(row, "Km", "km")) || 0;
    const id = crypto.randomUUID();
    accepted.set(key, id);
    plan.orders.push({
      id, number, clientId, vehicleId: vehicle?.id ?? null, dateIn: when, dateOut: when, km,
      problem: cell(row, "Tipo", "tipo"), status: "faturada", approval: "aprovado", notes: cell(row, "Observações", "Observacoes"),
      invoiceNumber: documento, invoiceProvider: "keymaster", invoiceIssuedAt: when, invoiceSimulated: false, quoteId: null,
      createdAt: when, updatedAt: when,
    });
    if (vehicle && km > vehicle.km) plan.kmUpdates.push({ vehicleId: vehicle.id, km });
    plan.fresh += 1;
    const vat = money(cell(row, "IVA"));
    const total = money(cell(row, "Total"));
    let base = money(cell(row, "Total s/IVA", "Total s/ IVA"));
    if (!base && total) base = vat ? total - vat : total;
    if (base > 0) {
      plan.lines.push(historyLine(id, 0, "", cell(row, "Tipo", "tipo") || "Serviço", 1, base, 0, base ? Math.round((vat / base) * 100) : 23));
    }
  });
  const withLines = new Set<string>();
  lineRows.forEach((row, index) => {
    const documento = cell(row, "Documento", "documento").toLowerCase();
    const orderId = accepted.get(documento);
    if (!orderId) {
      if (documento && !known.has(documento)) plan.errors.push(`Linha ${index + 2}: documento ${cell(row, "Documento")} não está na folha de documentos.`);
      return;
    }
    if (!withLines.has(orderId)) {
      plan.lines = plan.lines.filter((item) => item.orderId !== orderId);
      withLines.add(orderId);
    }
    const quantity = money(cell(row, "Quantidade")) || 1;
    const unit = money(cell(row, "Preço unitário", "Preco unitario"));
    const discount = money(cell(row, "Desconto %", "Desconto"));
    const vatRate = money(cell(row, "IVA %", "IVA")) || 23;
    plan.lines.push(historyLine(orderId, plan.lines.filter((item) => item.orderId === orderId).length, cell(row, "Referência", "Referencia"), cell(row, "Descrição", "Descricao") || "Linha", quantity, unit, discount, vatRate));
  });
  return plan;
}

function historyLine(orderId: string, position: number, ref: string, description: string, quantity: number, unitPrice: number, discountPercent: number, vatRate: number): DocLine {
  return { id: crypto.randomUUID(), orderId, quoteId: null, kind: "servico", description, quantity, unitPrice, unitCost: 0, discountPercent, vatRate, articleId: null, ref, position, stockEntry: null };
}

async function commit(preview: Preview, onProgress: (text: string) => void) {
  onProgress(`A preparar ${preview.fresh} registos…`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const snap = structuredClone(await readSnapshot());
  snap.clients.push(...preview.clients);
  snap.vehicles.push(...preview.vehicles);
  snap.suppliers.push(...preview.suppliers);
  snap.articles.push(...preview.articles);
  snap.orders.push(...preview.orders);
  snap.lines.push(...preview.lines);
  for (const update of preview.kmUpdates) {
    const vehicle = snap.vehicles.find((item) => item.id === update.vehicleId);
    if (vehicle && update.km > vehicle.km) vehicle.km = update.km;
  }
  onProgress("A sincronizar com o servidor…");
  try {
    await replaceSnapshot(snap);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? `${error.message} Nada foi gravado.` : "A sincronização falhou. Nada foi gravado." };
  }
  return { ok: true as const, message: `Gravados ${preview.fresh}.` };
}

async function exportKind(kind: Kind) {
  const XLSX = await import("xlsx");
  const snap = await readSnapshot();
  const book = XLSX.utils.book_new();
  if (kind === "historico") {
    const orders = snap.orders.filter((order) => order.invoiceNumber);
    const documents = orders.map((order) => {
      const lines = snap.lines.filter((line) => line.orderId === order.id);
      const totals = lines.reduce((sum, line) => {
        const amounts = lineAmounts({ quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, discountPercent: line.discountPercent ?? 0, vatRate: line.vatRate });
        return { base: sum.base + amounts.base, vat: sum.vat + amounts.vat, total: sum.total + amounts.total };
      }, { base: 0, vat: 0, total: 0 });
      const client = snap.clients.find((item) => item.id === order.clientId);
      const vehicle = snap.vehicles.find((item) => item.id === order.vehicleId);
      return { Documento: order.invoiceNumber, Tipo: order.problem, Data: order.invoiceIssuedAt ? new Date(order.invoiceIssuedAt).toLocaleDateString("pt-PT") : "", "Nº obra": order.number, Matrícula: vehicle?.plate ?? "", "NIF cliente": client?.nif ?? "", Cliente: client?.name ?? "", Km: order.km, "Total s/IVA": totals.base, IVA: totals.vat, Total: totals.total, Observações: order.notes };
    });
    const lines = orders.flatMap((order) => snap.lines.filter((line) => line.orderId === order.id).map((line) => {
      const amounts = lineAmounts({ quantity: line.quantity, unitPrice: line.unitPrice, unitCost: 0, discountPercent: line.discountPercent ?? 0, vatRate: line.vatRate });
      return { Documento: order.invoiceNumber, Referência: line.ref ?? "", Descrição: line.description, Quantidade: line.quantity, "Preço unitário": line.unitPrice, "Desconto %": line.discountPercent ?? 0, "IVA %": line.vatRate, Total: amounts.total };
    }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(documents.length ? documents : [{ Documento: "" }]), "Documentos");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(lines.length ? lines : [{ Documento: "" }]), "Linhas");
    XLSX.writeFile(book, "obras-faturadas.xlsx");
    return;
  }
  const rows = kind === "clientes"
    ? snap.clients.map((item) => ({ Nome: item.name, NIF: item.nif, Telefone: item.phone, "E-mail": item.email, Morada: item.address, "Código postal": item.postalCode, Localidade: item.city, Notas: item.notes }))
    : kind === "fornecedores"
      ? snap.suppliers.map((item) => ({ Nome: item.name, NIF: item.nif, Telefone: item.phone, "E-mail": item.email, Morada: item.address, Notas: item.notes }))
      : kind === "viaturas"
        ? snap.vehicles.map((item) => ({ Matrícula: item.plate, Marca: item.brand, Modelo: item.model, Versão: item.version, Ano: item.year ?? "", Combustível: item.fuel, Motor: item.engine, VIN: item.vin, Km: item.km, "NIF cliente": snap.clients.find((client) => client.id === item.clientId)?.nif ?? "", Cliente: snap.clients.find((client) => client.id === item.clientId)?.name ?? "" }))
        : snap.articles.filter((item) => kind === "servicos" ? item.family === "Serviço" : item.family !== "Serviço").map((item) => ({ Referência: item.ref, Descrição: item.description, Família: item.family, Custo: item.costPrice, Margem: item.marginPercent, IVA: item.vatRate, Stock: item.stockQty }));
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
