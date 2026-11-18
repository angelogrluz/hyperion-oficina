"use client";

import { useState } from "react";
import Link from "next/link";
import { isValidNif, isValidPlate, lineAmounts, normalizeNif, normalizePlate, platesMatch, round2 } from "@/lib/domain";
import { formatEUR } from "@/lib/format";
import { cell, historyLineInputs, isNormalVat, looksLikeLines, money, readHistoryWorkbook, rowsOf, wholeKm } from "@/lib/history-sheet";
import { CONSUMIDOR_FINAL } from "@/lib/consumidor";
import {
  clientConflict,
  forgetCloudMemory,
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
  replace: boolean;
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
  lineCount: number;
  lineTotal: number;
  blocked: boolean;
};

const emptyPlan = (kind: Kind, replace = false): Preview => ({ kind, replace, errors: [], duplicates: 0, fresh: 0, clients: [], vehicles: [], suppliers: [], articles: [], orders: [], lines: [], kmUpdates: [], lineCount: 0, lineTotal: 0, blocked: false });

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
                      <button type="button" className="h-10 rounded-lg bg-[var(--ink)] px-3 font-semibold text-white" onClick={() => { setFailure(""); void prepareHistory(docsFile, linesFile, false).then(setPreview); }}>Importar</button>
                      <button type="button" className="h-10 rounded-lg border px-3" onClick={() => { setFailure(""); void prepareHistory(docsFile, linesFile, true).then(setPreview); }}>Reimportar linhas do histórico</button>
                      <p className="basis-full text-[13px] text-[var(--muted-text)]">O ficheiro pode ficar só numa das colunas. A reimportação lê a folha «Linhas» e os km da folha «Documentos», e substitui as linhas das obras já importadas. Não mexe no stock.</p>
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
          <p className="text-[15px]">{preview.replace ? `${preview.fresh} obras a atualizar · ${preview.lineCount} linhas · ${formatEUR(preview.lineTotal)} c/IVA · ${preview.duplicates} sem correspondência` : `${preview.fresh} novos · ${preview.lineCount} linhas · ${formatEUR(preview.lineTotal)} c/IVA · ${preview.duplicates} duplicados ignorados`} · {preview.errors.length} com erro</p>
          {preview.errors.slice(0, 12).map((error) => <p key={error} className="text-[14px] text-[#9c4036]">{error}</p>)}
          {preview.errors.length > 12 ? <p className="text-[14px] text-[#9c4036]">e mais {preview.errors.length - 12}.</p> : null}
          <div className="mt-2 flex gap-2">
            <button type="button" className="h-10 rounded-lg bg-[var(--glow)] px-3 font-semibold text-white disabled:opacity-50" disabled={Boolean(progress) || preview.blocked} onClick={() => {
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
  const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  return { XLSX, book, rows: rowsOf(XLSX, book, 0) };
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

function ensureConsumidor(clients: Client[], plan?: Preview) {
  const wanted = normalizePersonName(CONSUMIDOR_FINAL.name);
  const found = clients.find((client) => normalizeNif(client.nif) === CONSUMIDOR_FINAL.nif && normalizePersonName(client.name) === wanted);
  if (found) return found.id;
  if (!plan) return null;
  const now = stamp();
  const created: Client = { id: crypto.randomUUID(), name: CONSUMIDOR_FINAL.name, nif: CONSUMIDOR_FINAL.nif, phone: "", email: "", address: "", postalCode: "", city: "", notes: "", createdAt: now, updatedAt: now };
  clients.push(created);
  plan.clients.push(created);
  return created.id;
}

function linkClient(clients: Client[], nifValue: string, name: string, plan?: Preview) {
  const nif = normalizeNif(nifValue);
  const wanted = normalizePersonName(name);
  if (nif === CONSUMIDOR_FINAL.nif) {
    if (wanted) {
      const named = clients.filter((client) => normalizeNif(client.nif) === nif && normalizePersonName(client.name) === wanted);
      if (named.length > 0) return named[0].id;
    }
    return ensureConsumidor(clients, plan);
  }
  if (nif) {
    const found = clients.filter((client) => normalizeNif(client.nif) === nif);
    if (found.length === 1) return found[0].id;
  }
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
  const nifs = new Set(snap.suppliers.map((item) => normalizeNif(item.nif)).filter((nif) => nif && nif !== CONSUMIDOR_FINAL.nif));
  const names = new Set(snap.suppliers.filter((item) => !normalizeNif(item.nif)).map((item) => normalizePersonName(item.name)));
  rows.forEach((row, index) => {
    const line = index + 2;
    const name = cell(row, "Nome", "nome");
    const nif = normalizeNif(cell(row, "NIF", "nif"));
    if (!name) { plan.errors.push(`Linha ${line}: falta o nome.`); return; }
    if (nif && nif !== CONSUMIDOR_FINAL.nif && !isValidNif(nif)) { plan.errors.push(`Linha ${line}: NIF inválido.`); return; }
    if (nif && nif !== CONSUMIDOR_FINAL.nif && nifs.has(nif)) { plan.duplicates += 1; return; }
    if (!nif && names.has(normalizePersonName(name))) { plan.duplicates += 1; return; }
    if (nif && nif !== CONSUMIDOR_FINAL.nif) nifs.add(nif);
    if (!nif) names.add(normalizePersonName(name));
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

async function loadHistorySheets(docsFile: File | null, linesFile: File | null) {
  const files = [docsFile, linesFile].filter((file): file is File => Boolean(file));
  const unique = files.filter((file, index) => files.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index);
  if (!unique.length) return { documents: [] as Record<string, string>[], lines: [] as Record<string, string>[], errors: ["Escolhe o ficheiro do histórico, na coluna Documentos ou na coluna Linhas."] };
  const XLSX = await import("xlsx");
  let documents: Record<string, string>[] = [];
  let lines: Record<string, string>[] = [];
  for (const file of unique) {
    const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const picked = readHistoryWorkbook(XLSX, book);
    if (!documents.length && picked.documents.length) documents = picked.documents;
    if (!lines.length && picked.lines.length) lines = picked.lines;
  }
  const errors: string[] = [];
  if (!documents.length) errors.push("Falta a folha «Documentos».");
  if (!lines.length || !looksLikeLines(lines)) errors.push("Falta a folha «Linhas». A reimportação não usa a folha de documentos como linhas.");
  return { documents, lines: looksLikeLines(lines) ? lines : [], errors };
}

async function prepareHistory(docsFile: File | null, linesFile: File | null, replace: boolean): Promise<Preview> {
  const loaded = await loadHistorySheets(docsFile, linesFile);
  const documents = loaded.documents;
  const lineRows = loaded.lines;
  const snap = await readSnapshot();
  const clients = [...snap.clients];
  const plan = emptyPlan("historico", replace);
  plan.errors.push(...loaded.errors);
  if (loaded.errors.length) {
    plan.blocked = true;
    return plan;
  }
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
    const existing = snap.orders.find((order) => (order.invoiceNumber ?? "").trim().toLowerCase() === key && ["importado", "keymaster"].includes((order.invoiceProvider ?? "").toLowerCase()));
    if (replace) {
      if (!existing) { plan.duplicates += 1; return; }
    } else if (known.has(key)) { plan.duplicates += 1; return; }
    if (!replace) known.add(key);
    const plate = normalizePlate(cell(row, "Matrícula", "Matricula"));
    const vehicle = plate ? snap.vehicles.find((item) => platesMatch(item.plate, plate)) : undefined;
    const clientId = linkClient(clients, cell(row, "NIF cliente"), cell(row, "Cliente", "cliente"), replace ? undefined : plan);
    let number = cell(row, "Nº obra", "N° obra", "No obra", "Numero obra") || documento;
    if (!replace && numbers.has(number)) number = `${number}-${documento}`;
    if (!replace) numbers.add(number);
    const kmRaw = cell(row, "Km", "km");
    const km = kmRaw.trim() === "" ? (existing?.km ?? 0) : wholeKm(kmRaw);
    const documentLink = cell(row, "Link documento", "Link do documento");
    const originalDocumentUrl = /^https?:\/\//i.test(documentLink) ? documentLink : "";
    const id = existing && replace ? existing.id : crypto.randomUUID();
    accepted.set(key, id);
    if (replace) {
      plan.orders.push({ id, km, originalDocumentUrl, invoiceUrl: originalDocumentUrl } as Order);
    } else plan.orders.push({
      id, number, clientId, vehicleId: vehicle?.id ?? null, dateIn: when, dateOut: when, km,
      problem: cell(row, "Tipo", "tipo"), status: "faturada", approval: "aprovado", notes: cell(row, "Observações", "Observacoes"),
      invoiceNumber: documento, invoiceProvider: "importado", invoiceIssuedAt: when, invoiceSimulated: false, quoteId: null,
      invoiceUrl: originalDocumentUrl || null, originalDocumentUrl: originalDocumentUrl || null,
      createdAt: when, updatedAt: when,
    });
    if (vehicle && km > vehicle.km) plan.kmUpdates.push({ vehicleId: vehicle.id, km });
    plan.fresh += 1;
    const vat = money(cell(row, "IVA"));
    const total = money(cell(row, "Total"));
    let base = money(cell(row, "Total s/IVA", "Total s/ IVA"));
    if (!base && total) base = vat ? total - vat : total;
    if (!lineRows.length && !replace && base > 0) {
      plan.lines.push(historyLine(id, 0, "", cell(row, "Tipo", "tipo") || "Serviço", 1, base, 0, base ? Math.round((vat / base) * 100) : 23));
    }
  });
  const withLines = new Set<string>();
  historyLineInputs(lineRows).forEach((line, index) => {
    const documento = line.document.toLowerCase();
    const orderId = accepted.get(documento);
    if (!orderId) {
      if (documento && !known.has(documento)) plan.errors.push(`Linha ${index + 2}: documento ${line.document} não está na folha de documentos.`);
      return;
    }
    if (line.vatRate == null || !isNormalVat(line.vatRate)) {
      plan.errors.push(`Documento ${line.document}, ${line.ref || line.description}: IVA % ${line.vatRate ?? "em falta"} não é 0, 6, 13 ou 23.`);
      return;
    }
    if (!withLines.has(orderId)) {
      plan.lines = plan.lines.filter((item) => item.orderId !== orderId);
      withLines.add(orderId);
    }
    plan.lines.push(historyLine(orderId, plan.lines.filter((item) => item.orderId === orderId).length, line.ref, line.description, line.quantity, line.unitPrice, line.discountPercent, line.vatRate));
  });
  for (const [key, orderId] of accepted) {
    if (!plan.lines.some((item) => item.orderId === orderId)) plan.errors.push(`Documento ${key}: ficaria sem linhas.`);
  }
  plan.lineCount = plan.lines.length;
  plan.lineTotal = round2(plan.lines.reduce((sum, line) => sum + lineAmounts({ quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, discountPercent: line.discountPercent ?? 0, vatRate: line.vatRate }).total, 0));
  plan.blocked = plan.errors.length > 0;
  return plan;
}

function historyLine(orderId: string, position: number, ref: string, description: string, quantity: number, unitPrice: number, discountPercent: number, vatRate: number): DocLine {
  return { id: crypto.randomUUID(), orderId, quoteId: null, kind: "servico", description, quantity, unitPrice, unitCost: 0, discountPercent, vatRate, articleId: null, ref, position, stockEntry: null };
}

async function commit(preview: Preview, onProgress: (text: string) => void) {
  if (preview.blocked || preview.errors.length > 0) return { ok: false as const, error: preview.errors[0] ?? "Nada foi gravado." };
  onProgress(`A preparar ${preview.fresh} registos…`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const snap = structuredClone(await readSnapshot());
  snap.clients.push(...preview.clients);
  snap.vehicles.push(...preview.vehicles);
  snap.suppliers.push(...preview.suppliers);
  snap.articles.push(...preview.articles);
  if (preview.replace) {
    for (const patch of preview.orders) {
      const order = snap.orders.find((item) => item.id === patch.id);
      const provider = (order?.invoiceProvider ?? "").toLowerCase();
      if (!order || (provider !== "importado" && provider !== "keymaster")) continue;
      order.status = "faturada";
      order.km = patch.km;
      order.invoiceProvider = "importado";
      if (/^https?:\/\//i.test(patch.originalDocumentUrl ?? "")) {
        order.originalDocumentUrl = patch.originalDocumentUrl;
        order.invoiceUrl = patch.originalDocumentUrl;
      }
      order.updatedAt = new Date().toISOString();
      snap.lines = snap.lines.filter((line) => line.orderId !== order.id);
    }
  } else snap.orders.push(...preview.orders);
  snap.lines.push(...preview.lines);
  for (const update of preview.kmUpdates) {
    const vehicle = snap.vehicles.find((item) => item.id === update.vehicleId);
    if (vehicle && update.km > vehicle.km) vehicle.km = update.km;
  }
  onProgress("A sincronizar com o servidor…");
  try {
    await replaceSnapshot(snap);
    forgetCloudMemory();
    const saved = await readSnapshot();
    if (preview.replace) {
      const missing = preview.orders.filter((patch) => preview.lines.filter((line) => line.orderId === patch.id).length !== saved.lines.filter((line) => line.orderId === patch.id).length);
      if (missing.length) {
        const sample = saved.orders.find((order) => order.id === missing[0].id);
        return { ok: false as const, error: `O servidor não confirmou as linhas${sample?.invoiceNumber ? ` de ${sample.invoiceNumber}` : ""}. Volta a gravar.` };
      }
    }
    const savedCount = preview.lines.filter((line) => saved.lines.some((item) => item.id === line.id)).length;
    if (savedCount !== preview.lines.length) {
      return { ok: false as const, error: `O servidor confirmou ${savedCount} de ${preview.lines.length} linhas. Volta a gravar.` };
    }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? `${error.message} Nada foi gravado.` : "A sincronização falhou. Nada foi gravado." };
  }
  return { ok: true as const, message: preview.replace ? `Linhas reimportadas em ${preview.fresh} obras. ${preview.lineCount} linhas confirmadas no servidor.` : `Gravados ${preview.fresh}. ${preview.lineCount} linhas confirmadas no servidor.` };
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
      const link = /^https?:\/\//i.test(order.originalDocumentUrl || order.invoiceUrl || "") ? (order.originalDocumentUrl || order.invoiceUrl || "") : "";
      return { Documento: order.invoiceNumber, Tipo: order.problem, Data: order.invoiceIssuedAt ? new Date(order.invoiceIssuedAt).toLocaleDateString("pt-PT") : "", "Nº obra": order.number, Matrícula: vehicle?.plate ?? "", "NIF cliente": client?.nif ?? "", Cliente: client?.name ?? "", Km: order.km, "Total s/IVA": totals.base, IVA: totals.vat, Total: totals.total, Observações: order.notes, "Link documento": link };
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
