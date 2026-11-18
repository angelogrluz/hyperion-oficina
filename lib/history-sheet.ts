import type * as XLSX from "xlsx";

export function cellText(cell: XLSX.CellObject | undefined) {
  if (!cell) return "";
  if (cell.t === "d" || cell.v instanceof Date) {
    const date = cell.v instanceof Date ? cell.v : new Date(String(cell.w ?? ""));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  if (typeof cell.v === "number") return Number.isInteger(cell.v) ? String(cell.v) : String(cell.v);
  return String(cell.w ?? cell.v ?? "").trim();
}

export function rowsOf(XLSX: typeof import("xlsx"), book: XLSX.WorkBook, index: number) {
  const name = book.SheetNames[index];
  if (!name) return [] as Record<string, string>[];
  const sheet = book.Sheets[name];
  if (!sheet?.["!ref"]) return [];
  for (const merge of sheet["!merges"] ?? []) {
    const origin = sheet[XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c })];
    if (!origin || String(origin.v ?? "").trim() === "") continue;
    for (let rowIndex = merge.s.r; rowIndex <= merge.e.r; rowIndex += 1) {
      for (let column = merge.s.c; column <= merge.e.c; column += 1) {
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: column });
        const current = sheet[address];
        if (!current || String(current.v ?? "").trim() === "") sheet[address] = origin;
      }
    }
  }
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const grid: string[][] = [];
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: string[] = [];
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      row.push(cellText(sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })]));
    }
    grid.push(row);
  }
  const headerIndex = grid.findIndex((row) => row.some((value) => {
    const text = value.trim().toLowerCase();
    return text === "documento" || text === "nome" || text === "matrícula" || text === "matricula";
  }));
  const start = headerIndex >= 0 ? headerIndex : 0;
  const headers = grid[start].map((value) => value.trim());
  return grid.slice(start + 1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (!header || record[header] !== undefined) return;
      record[header] = row[column] ?? "";
    });
    return record;
  }).filter((row) => Object.values(row).some((value) => value.trim() !== ""));
}

export function cell(row: Record<string, string>, ...names: string[]) {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([key]) => key.trim().toLowerCase() === name.toLowerCase());
    if (found) return String(found[1] ?? "").trim();
  }
  return "";
}

export function wholeKm(value: string) {
  const text = value.trim().replace(/\s/g, "");
  if (!text) return 0;
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) return Number(text.replace(/\./g, ""));
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function money(value: string) {
  const text = value.trim().replace(/\s/g, "");
  if (!text) return 0;
  if (text.includes(",") && text.includes(".")) return Number(text.replace(/\./g, "").replace(",", ".")) || 0;
  if (text.includes(",")) return Number(text.replace(",", ".")) || 0;
  return Number(text) || 0;
}

const NORMAL_VAT = [0, 6, 13, 23];

export function isNormalVat(value: number) {
  return NORMAL_VAT.some((rate) => Math.abs(rate - value) < 0.001);
}

export function looksLikeLines(rows: Record<string, string>[]) {
  const keys = Object.keys(rows[0] ?? {}).map((key) => key.trim().toLowerCase());
  return keys.includes("iva %") || keys.includes("referência") || keys.includes("referencia") || keys.includes("quantidade");
}

export function looksLikeDocuments(rows: Record<string, string>[]) {
  const keys = Object.keys(rows[0] ?? {}).map((key) => key.trim().toLowerCase());
  return keys.includes("matrícula") || keys.includes("matricula") || keys.includes("total s/iva") || keys.includes("nº obra") || keys.includes("km");
}

function sheetIndex(names: string[], kind: "documentos" | "linhas") {
  const exact = kind === "linhas" ? /^linhas$/i : /^documentos$/i;
  const loose = kind === "linhas" ? /linha/i : /document/i;
  const named = names.findIndex((name) => exact.test(name.trim()));
  if (named >= 0) return named;
  return names.findIndex((name) => loose.test(name.trim()));
}

export function readHistoryWorkbook(XLSX: typeof import("xlsx"), book: XLSX.WorkBook) {
  let documents: Record<string, string>[] = [];
  let lines: Record<string, string>[] = [];
  const docIndex = sheetIndex(book.SheetNames, "documentos");
  const lineIndex = sheetIndex(book.SheetNames, "linhas");
  if (docIndex >= 0) documents = rowsOf(XLSX, book, docIndex);
  if (lineIndex >= 0 && lineIndex !== docIndex) lines = rowsOf(XLSX, book, lineIndex);
  for (let index = 0; index < book.SheetNames.length; index += 1) {
    const rows = index === docIndex || index === lineIndex ? (index === docIndex ? documents : lines) : rowsOf(XLSX, book, index);
    if (!documents.length && looksLikeDocuments(rows) && !looksLikeLines(rows)) documents = rows;
    if (!lines.length && looksLikeLines(rows) && !looksLikeDocuments(rows)) lines = rows;
  }
  return { documents, lines };
}

export type HistoryLineInput = {
  document: string;
  ref: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number | null;
};

export function historyLineInputs(rows: Record<string, string>[]): HistoryLineInput[] {
  const lines: HistoryLineInput[] = [];
  let lastDocument = "";
  for (const row of rows) {
    const rawDocument = cell(row, "Documento", "documento");
    if (rawDocument) lastDocument = rawDocument;
    const document = rawDocument || lastDocument;
    if (!document) continue;
    const ref = cell(row, "Referência", "Referencia", "Ref.", "Ref");
    const quantityText = cell(row, "Quantidade");
    const unitText = cell(row, "Preço unitário", "Preco unitario");
    const discountText = cell(row, "Desconto %", "Desconto");
    const hasVatPercent = Object.keys(row).some((key) => key.trim().toLowerCase() === "iva %");
    const vatText = hasVatPercent ? cell(row, "IVA %") : "";
    lines.push({
      document,
      ref,
      description: cell(row, "Descrição", "Descricao", "Designação", "Designacao") || ref || "Linha",
      quantity: quantityText === "" ? 0 : money(quantityText),
      unitPrice: unitText === "" ? 0 : money(unitText),
      discountPercent: discountText === "" ? 0 : money(discountText),
      vatRate: !hasVatPercent ? null : vatText === "" ? 23 : money(vatText),
    });
  }
  return lines;
}
