"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PackagePlus, Pencil } from "lucide-react";
import { CarSide, carColor } from "@/components/car-side";
import { ClientEditDialog, StockEntryDialog, type ClientForm } from "@/components/sheet-dialogs";
import { useSetSheetHeader, useSetSheetSidebar } from "@/components/sheet-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { readSymptoms, subscribeSymptoms, writeSymptoms, type SymptomItem } from "@/lib/browser-cache";
import { defaultMargin, includesSearch, isOilArticle, lineAmounts, normalizeArticleDescription, parseDecimal, round2, salePrice } from "@/lib/domain";
import { formatEUR } from "@/lib/format";
import type { StockLink } from "@/lib/stock-entry";
import type { EditorArticle, EditorClient } from "@/components/document-editor";

type SheetLine = {
  key: string;
  kind: "mao_de_obra" | "peca";
  description: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  discount: string;
  vatRate: string;
  note: string;
  articleId: string | null;
  ref: string;
  stockEntry?: StockLink | null;
};

const TABS = ["Folha de obra", "Consumíveis", "Checklist de Verificação", "Notas"] as const;

export function FolhaView({
  documentId,
  number,
  userName,
  printHref,
  locked,
  pending,
  client,
  clients,
  clientId,
  onClient,
  error,
  problem,
  notes,
  dateIn,
  lines,
  articles,
  plate,
  brand,
  model,
  version,
  year,
  vin,
  engine,
  fuel,
  km,
  onProblem,
  onNotes,
  onDateIn,
  onLine,
  onRemove,
  onAdd,
  onPlate,
  onBrand,
  onModel,
  onVersion,
  onYear,
  onVin,
  onEngine,
  onFuel,
  onKm,
  onLookup,
  onSave,
  onInvoice,
  canInvoice,
  suppliers,
  onSaveClient,
  onCreateSupplier,
  onCommitStock,
  onRemoveStock,
}: {
  documentId?: string;
  number?: string;
  userName: string;
  printHref?: string;
  locked: boolean;
  pending: boolean;
  client?: EditorClient;
  clients: EditorClient[];
  clientId: string;
  onClient: (id: string) => void;
  error: string | null;
  problem: string;
  notes: string;
  dateIn: string;
  lines: SheetLine[];
  articles: EditorArticle[];
  plate: string;
  brand: string;
  model: string;
  version: string;
  year: string;
  vin: string;
  engine: string;
  fuel: string;
  km: string;
  onProblem: (value: string) => void;
  onNotes: (value: string) => void;
  onDateIn: (value: string) => void;
  onLine: (key: string, patch: Partial<SheetLine>) => void;
  onRemove: (key: string) => void;
  onAdd: (draft: {
    description: string;
    ref: string;
    quantity: string;
    unitPrice: string;
    unitCost?: string;
    vatRate?: string;
    articleId?: string | null;
  }) => void;
  onPlate: (value: string) => void;
  onBrand: (value: string) => void;
  onModel: (value: string) => void;
  onVersion: (value: string) => void;
  onYear: (value: string) => void;
  onVin: (value: string) => void;
  onEngine: (value: string) => void;
  onFuel: (value: string) => void;
  onKm: (value: string) => void;
  onLookup: () => void;
  onSave: (status?: string) => void;
  onInvoice: () => void;
  canInvoice: boolean;
  suppliers: { id: string; name: string }[];
  onSaveClient: (data: ClientForm) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCreateSupplier: (name: string) => Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }>;
  onCommitStock: (input: {
    lineKey: string;
    ref: string;
    description: string;
    quantity: number;
    supplierId: string;
    invoiceNumber: string;
    date: string;
    cost: number;
    vat: number;
    family: string;
    margin: number;
    purchaseLineId?: string | null;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onRemoveStock: (lineKey: string, purchaseLineId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Folha de obra");
  const [kmOut, setKmOut] = useState("");
  const [promiseQuote, setPromiseQuote] = useState("");
  const [promiseDelivery, setPromiseDelivery] = useState("");
  const [keyBox, setKeyBox] = useState("Não");
  const [book, setBook] = useState("Não");
  const [docs, setDocs] = useState("Não");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState({ description: "", ref: "", quantity: "1", unitPrice: "", vatRate: "23" });
  const [suggestField, setSuggestField] = useState<"ref" | "description" | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [suggestBox, setSuggestBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [stockKey, setStockKey] = useState<string | null>(null);
  const openClientRef = useRef<() => void>(() => {});
  useEffect(() => {
    openClientRef.current = () => setClientOpen(true);
  }, []);
  const suggestQuery = suggestField === "ref" ? draft.ref : suggestField === "description" ? draft.description : "";
  const matches = useMemo(() => {
    const query = suggestQuery.trim();
    if (query.length < 1) return [];
    return articles
      .filter((article) => includesSearch(`${article.ref} ${article.description} ${article.family ?? ""}`, query))
      .slice(0, 8);
  }, [articles, suggestQuery]);

  function placeSuggest(field: "ref" | "description", element: HTMLInputElement) {
    const rect = element.getBoundingClientRect();
    setSuggestField(field);
    setSuggestBox({ top: rect.bottom + 4, left: rect.left, width: Math.max(320, rect.width) });
  }

  function chooseArticle(article: EditorArticle) {
    const margin = defaultMargin({ family: article.family, ref: article.ref });
    onAdd({
      description: normalizeArticleDescription(article.description),
      ref: article.ref,
      quantity: draft.quantity || "1",
      unitPrice: moneyInput(salePrice(article.costPrice, margin)),
      unitCost: moneyInput(article.costPrice),
      vatRate: moneyInput(article.vatRate),
      articleId: article.id,
    });
    setDraft({ description: "", ref: "", quantity: "1", unitPrice: "", vatRate: "23" });
    setSuggestField(null);
  }

  function addFreeLine() {
    if (!draft.description.trim() && !draft.ref.trim()) return;
    onAdd(draft);
    setDraft({ description: "", ref: "", quantity: "1", unitPrice: "", vatRate: "23" });
    setSuggestField(null);
  }

  function onSuggestKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && matches.length) {
      event.preventDefault();
      setHighlight((current) => (current + 1) % matches.length);
    } else if (event.key === "ArrowUp" && matches.length) {
      event.preventDefault();
      setHighlight((current) => (current - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = matches[highlight] ?? matches[0];
      if (chosen) chooseArticle(chosen);
      else addFreeLine();
    } else if (event.key === "Escape") {
      setSuggestField(null);
    }
  }

  const setSidebar = useSetSheetSidebar();
  const onClientRef = useRef(onClient);
  useEffect(() => {
    onClientRef.current = onClient;
  }, [onClient]);
  useEffect(() => {
    setSidebar(
      <div className="grid gap-2 text-xs">
        <div className="flex items-center justify-between gap-1">
          <p className="text-[10px] tracking-wide text-white/70 uppercase">Contacto cliente</p>
          <button
            type="button"
            data-testid="edit-client"
            title="Editar cliente"
            aria-label="Editar cliente"
            disabled={!client}
            onClick={() => openClientRef.current()}
            className="inline-grid size-4 place-items-center rounded text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-40"
          >
            <Pencil className="size-3" />
          </button>
        </div>
        {client ? null : (
          <select
            aria-label="Cliente"
            value={clientId}
            disabled={locked}
            onChange={(event) => onClientRef.current(event.target.value)}
            className="h-6 w-full rounded border-0 bg-white px-1 text-[11px] text-[#22272a]"
          >
            <option value="">Escolher cliente…</option>
            {clients.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        )}
        <p className="text-[13px] leading-tight font-semibold">{client?.name || "Sem cliente"}</p>
        <p>{client?.phone || "Sem telefone"}</p>
        <p className="break-all">{client?.email || "Sem e-mail"}</p>
        <p>NIF {client?.nif || "—"}</p>
        <p className="text-white/90">{client?.address || "Sem morada"}</p>
        <p className="mt-2 text-[10px] tracking-wide text-white/70 uppercase">Notas</p>
        <p>{client?.notes || "Sem notas do cliente."}</p>
        <p className="mt-2 rounded bg-white/15 px-2 py-1">App Cliente — Não registado</p>
        <p className="mt-2 text-[10px] tracking-wide text-white/70 uppercase">Histórico notas</p>
        <p>{notes || "Sem notas nesta obra."}</p>
      </div>,
    );
    return () => setSidebar(null);
  }, [setSidebar, locked, clientId, clients, client?.id, client?.name, client?.phone, client?.email, client?.nif, client?.address, client?.notes, notes]);

  const setHeader = useSetSheetHeader();
  const headerActions = useRef({ onDateIn, setPromiseQuote, setPromiseDelivery });
  useEffect(() => {
    headerActions.current = { onDateIn, setPromiseQuote, setPromiseDelivery };
  }, [onDateIn]);
  useEffect(() => {
    setHeader(
      <div className="flex h-12 w-full items-stretch gap-px bg-[#e4e6ea] px-1 py-1 shadow-[0_1px_2px_rgba(34,39,42,.12)]">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 bg-[#f4f6f8] px-2">
          <span className="text-[#00a9fd]" aria-hidden><DocIcon /></span>
          <span className="text-[#00a9fd]" aria-hidden><DocIcon /></span>
          <div className="min-w-0 leading-tight">
            <p className="text-[9px] tracking-wide text-[#8d939c] uppercase">Folha de Obra</p>
            <p className="truncate text-[12px] font-semibold">{number ?? "Nova"}</p>
          </div>
        </div>
        <label className="flex min-w-0 flex-1 flex-col justify-center bg-white px-2">
          <span className="text-[9px] tracking-wide text-[#8d939c] uppercase">Dia de chegada</span>
          <input type="date" value={dateIn} disabled={locked} onChange={(event) => headerActions.current.onDateIn(event.target.value)} className="h-5 w-full border-0 bg-transparent px-0 text-[12px] outline-none" />
        </label>
        <label className="flex min-w-0 flex-[1.3] flex-col justify-center bg-[#f7f8fa] px-2">
          <span className="text-[9px] tracking-wide text-[#8d939c] uppercase">Promessa de orçamento</span>
          <input value={promiseQuote} disabled={locked} placeholder="00/00/0000 00:00" onChange={(event) => headerActions.current.setPromiseQuote(event.target.value)} className="h-5 w-full border-0 bg-transparent px-0 text-[12px] outline-none" />
        </label>
        <label className="flex min-w-0 flex-[1.3] flex-col justify-center bg-white px-2">
          <span className="text-[9px] tracking-wide text-[#8d939c] uppercase">Promessa de entrega</span>
          <input value={promiseDelivery} disabled={locked} placeholder="00/00/0000 00:00" onChange={(event) => headerActions.current.setPromiseDelivery(event.target.value)} className="h-5 w-full border-0 bg-transparent px-0 text-[12px] outline-none" />
        </label>
        <div className="flex items-center gap-2 bg-[#f4f6f8] px-2">
          <button type="button" disabled title="Indisponível nesta versão" className="size-6 cursor-not-allowed rounded-full border border-[#e1e2e5] bg-white text-[10px] text-[#8d939c]">i</button>
          <span className="text-[12px] font-semibold whitespace-nowrap">{userName}</span>
        </div>
      </div>,
    );
    return () => setHeader(null);
  }, [setHeader, number, dateIn, promiseQuote, promiseDelivery, userName, locked]);

  const computed = lines.map((line) => {
    const quantity = parseDecimal(line.quantity) ?? 0;
    const unitPrice = parseDecimal(line.unitPrice) ?? 0;
    const unitCost = parseDecimal(line.unitCost) ?? 0;
    const discountPercent = parseDecimal(line.discount) ?? 0;
    const vatRate = parseDecimal(line.vatRate) ?? 0;
    const amounts = lineAmounts({ quantity, unitPrice, unitCost, vatRate, discountPercent });
    const article = articles.find((item) => item.id === line.articleId);
    const family = line.kind === "mao_de_obra" ? "Serviço" : article?.family || "Produto";
    const netUnit = unitPrice * (1 - Math.min(100, Math.max(0, discountPercent)) / 100);
    const margin = netUnit > 0 ? round2(((netUnit - unitCost) / netUnit) * 100) : 0;
    const lucro = round2((unitPrice - unitCost) * quantity);
    const stockArticle = articles.find((item) => item.id === line.articleId) ?? articles.find((item) => item.ref === line.ref);
    const stock = stockArticle ? String(stockArticle.stockQty).replace(".", ",") : "—";
    return { line, quantity, unitPrice, unitCost, amounts, family, margin, lucro, stock };
  });
  const visible = tab === "Consumíveis"
    ? computed.filter((row) => ["Óleo", "Filtros", "Eco Taxa"].includes(row.family))
    : computed;
  const custo = round2(computed.reduce((sum, row) => sum + row.unitCost * row.quantity, 0));
  const pvp = round2(computed.reduce((sum, row) => sum + row.amounts.total, 0));
  const lucro = round2(computed.reduce((sum, row) => sum + row.amounts.margin, 0));
  const mo = round2(computed.filter((row) => row.line.kind === "mao_de_obra").reduce((sum, row) => sum + row.amounts.base, 0));
  const produtos = round2(computed.filter((row) => row.line.kind === "peca").reduce((sum, row) => sum + row.amounts.base, 0));
  const desc = round2(computed.reduce((sum, row) => sum + (row.quantity * row.unitPrice - row.amounts.base), 0));
  const iva = round2(computed.reduce((sum, row) => sum + row.amounts.vat, 0));
  const base = round2(computed.reduce((sum, row) => sum + row.amounts.base, 0));
  const stockLine = lines.find((item) => item.key === stockKey && item.kind === "peca") ?? null;

  return (
    <div className="grid items-start gap-2 pb-12 xl:grid-cols-[minmax(0,1fr)_var(--sheet)] [--sheet:clamp(148px,12vw,236px)]">
      <div className="min-w-0 bg-white text-[#22272a]">
        <SymptomList documentId={documentId || "rascunho"} />
        <div className="mt-2 flex flex-wrap items-end gap-1 border-b border-[#eaeaf2] px-2 py-1">
          <label className="min-w-48 flex-1 text-[11px]">
            Observações do cliente
            <Textarea value={problem} disabled={locked} onChange={(event) => onProblem(event.target.value)} className="mt-0.5 min-h-8 border-[#e1e2e5] text-[12px]" />
          </label>
          <MiniSelect label="Chave de segurança" value={keyBox} onChange={setKeyBox} />
          <MiniSelect label="Livro de manutenção" value={book} onChange={setBook} />
          <MiniSelect label="Documentos" value={docs} onChange={setDocs} />
          <div className="ml-auto flex gap-2">
            {printHref ? <a href={printHref} className="inline-flex h-6 items-center rounded border border-[#e1e2e5] px-2 text-[11px]">Imprimir</a> : null}
            <Button type="button" variant="outline" className="h-6 px-2 text-[11px]" disabled={locked || pending} onClick={() => onSave()}>Editor</Button>
          </div>
        </div>
        <div className="flex gap-1 border-b border-[#d5ebed] px-2 pt-2">
          {TABS.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`border-b-2 px-2 py-1 text-[12px] ${tab === item ? "border-[#00a9fd] font-semibold text-[#22272a]" : "border-transparent text-[#8d939c]"}`}>
              {item}
            </button>
          ))}
        </div>
        {tab === "Notas" ? (
          <div className="p-3">
            <Textarea value={notes} disabled={locked} onChange={(event) => onNotes(event.target.value)} className="min-h-28 text-xs" />
          </div>
        ) : null}
        {tab === "Checklist de Verificação" ? (
          <ul className="grid gap-2 p-3 text-sm sm:grid-cols-2">
            {["Níveis de óleo", "Travões", "Luzes", "Pneus", "Bateria", "Filtro de ar"].map((item) => (
              <li key={item}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(checks[item])} onChange={(event) => setChecks((current) => ({ ...current, [item]: event.target.checked }))} />
                  {item}
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        {tab === "Folha de obra" || tab === "Consumíveis" ? (
          <>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 py-1 text-[11px] text-[#22272a]">
              <span>Custo {formatEUR(custo)}</span>
              <span>PVP {formatEUR(pvp)}</span>
              <span>Lucro {formatEUR(lucro)}</span>
              <span>MO {formatEUR(mo)}</span>
              <span>Produtos {formatEUR(produtos)}</span>
              <span>Desc. {formatEUR(desc)}</span>
              <span>IVA {formatEUR(iva)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-[11px] text-[#22272a]">
                <colgroup>
                  <col style={{ width: "24px" }} />
                  <col style={{ width: "14px" }} />
                  <col style={{ width: "52px" }} />
                  <col />
                  <col style={{ width: "58px" }} />
                  <col style={{ width: "52px" }} />
                  <col style={{ width: "56px" }} />
                  <col style={{ width: "48px" }} />
                  <col style={{ width: "32px" }} />
                  <col style={{ width: "40px" }} />
                  <col style={{ width: "56px" }} />
                  <col style={{ width: "40px" }} />
                  <col style={{ width: "68px" }} />
                  <col style={{ width: "60px" }} />
                  <col style={{ width: "24px" }} />
                  <col style={{ width: "36px" }} />
                  <col style={{ width: "22px" }} />
                </colgroup>
                <thead className="text-[11px] text-[#22272a]">
                  <tr>
                    <th className="bg-[#e1e2e5] px-0.5 py-1 text-center font-semibold">O</th>
                    <th className="bg-[#e1e2e5] px-0.5 py-1" aria-label="Código de barras" />
                    <th className="bg-[#e1e2e5] px-1 py-1 text-left font-semibold">Família</th>
                    <th className="bg-[#e1e2e5] px-1 py-1 text-left font-semibold">Descrição</th>
                    <th className="bg-[#e1e2e5] px-1 py-1 text-left font-semibold">Obs. internas</th>
                    <th className="bg-[#e1e2e5] px-1 py-1 text-left font-semibold">Ref.</th>
                    <th className="bg-[#b3b8c1] px-1 py-1 text-right font-semibold">Lucro s/desc.</th>
                    <th className="bg-[#b3b8c1] px-1 py-1 text-right font-semibold">Custo</th>
                    <th className="bg-[#b3b8c1] px-0.5 py-1 text-right font-semibold">Qtd.</th>
                    <th className="bg-[#b3b8c1] px-0.5 py-1 text-right font-semibold">Marg.</th>
                    <th className="bg-[#b3b8c1] px-1 py-1 text-right font-semibold">PVP Base</th>
                    <th className="bg-[#b3b8c1] px-0.5 py-1 text-right font-semibold">Desc.%</th>
                    <th className="bg-[#b3b8c1] px-1 py-1 text-right font-semibold">PVP Cliente s/IVA</th>
                    <th className="bg-[#b3b8c1] px-1 py-1 text-right font-semibold">PVP Cliente</th>
                    <th className="bg-[#e1e2e5] px-0.5 py-1 text-center font-semibold">A</th>
                    <th className="bg-[#e1e2e5] px-0.5 py-1 text-right font-semibold">Stock</th>
                    <th className="bg-[#e1e2e5] px-0.5 py-1" aria-label="Entrada de stock" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.line.key} className={row.line.kind === "peca" ? "bg-[#f5f6fa]" : "bg-white"}>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 text-center">
                        <button type="button" disabled={locked} onClick={() => onRemove(row.line.key)} aria-label="Tirar linha" className="inline-grid size-4 place-items-center rounded-full bg-[#6971f9] text-[9px] leading-none text-white">×</button>
                      </td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-0 text-center text-[8px] tracking-tighter" aria-hidden>||||</td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-1 py-0.5">{row.family}</td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-1 py-0.5"><Cell value={row.line.description} disabled={locked} onChange={(value) => onLine(row.line.key, { description: value })} /></td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-1 py-0.5"><Cell value={row.line.note} disabled={locked} onChange={(value) => onLine(row.line.key, { note: value })} /></td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-1 py-0.5" title={row.line.ref}><Cell value={row.line.ref} disabled={locked} onChange={(value) => onLine(row.line.key, { ref: value })} /></td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 py-0.5 text-right tabular-nums">{formatEUR(row.lucro)}</td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] bg-[#d7ebf8] px-0.5 py-0.5"><Cell value={moneyInput(row.unitCost)} disabled={locked} align="right" narrow onChange={(value) => onLine(row.line.key, { unitCost: value })} /></td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] bg-[#f6b26b] px-0.5 py-0.5"><Cell value={row.line.quantity} disabled={locked} align="right" narrow onChange={(value) => onLine(row.line.key, { quantity: value })} /></td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 py-0.5 text-right tabular-nums">{pt2(row.margin)}%</td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 py-0.5"><Cell value={moneyInput(row.unitPrice)} disabled={locked} align="right" narrow onChange={(value) => onLine(row.line.key, { unitPrice: value })} /></td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 py-0.5"><Cell value={row.line.discount} disabled={locked} align="right" narrow onChange={(value) => onLine(row.line.key, { discount: value })} /></td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] bg-[#e1e2e5] px-0.5 py-0.5 text-right tabular-nums">{formatEUR(row.amounts.base)}</td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] bg-[#e1e2e5] px-0.5 py-0.5 text-right tabular-nums">{formatEUR(row.amounts.total)}</td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 text-center"><span className="inline-grid size-4 place-items-center rounded-full bg-[#6971f9] text-[9px] text-white">●</span></td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 text-right tabular-nums">{row.stock}</td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-0 text-center">
                        {row.line.kind === "peca" ? (
                          <button
                            type="button"
                            data-testid="stock-entry"
                            data-linked={row.line.stockEntry ? "true" : "false"}
                            title={row.line.stockEntry ? row.line.stockEntry.invoiceNumber : "Dar entrada de stock"}
                            aria-label={row.line.stockEntry ? `Entrada ${row.line.stockEntry.invoiceNumber}` : "Dar entrada de stock"}
                            disabled={locked}
                            onClick={() => setStockKey(row.line.key)}
                            className={`inline-grid size-4 place-items-center rounded ${row.line.stockEntry ? "bg-[#1f8a4c] text-white" : "bg-[#e1e2e5] text-[#22272a] hover:bg-[#d7ebf8]"} disabled:opacity-40`}
                          >
                            <PackagePlus className="size-3" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#eaeaf2]">
                    <td className="px-0.5 text-center">
                      <button type="button" className="inline-grid size-4 place-items-center rounded-full bg-[#f5a623] text-[12px] leading-none text-white" disabled={locked || (!draft.description.trim() && !draft.ref.trim())} onClick={addFreeLine} aria-label="Adicionar linha">+</button>
                    </td>
                    <td />
                    <td className="px-1 text-[11px] text-[#8d939c]">Novo</td>
                    <td className="px-1 py-1">
                      <Cell
                        value={draft.description}
                        disabled={locked}
                        label="Descrição"
                        onFocus={(element) => { setHighlight(0); placeSuggest("description", element); }}
                        onKeyDown={onSuggestKey}
                        onChange={(value) => { setHighlight(0); setDraft((current) => ({ ...current, description: value })); }}
                      />
                    </td>
                    <td />
                    <td className="px-1 py-1">
                      <Cell
                        value={draft.ref}
                        disabled={locked}
                        label="Referência"
                        onFocus={(element) => { setHighlight(0); placeSuggest("ref", element); }}
                        onKeyDown={onSuggestKey}
                        onChange={(value) => { setHighlight(0); setDraft((current) => ({ ...current, ref: value.toUpperCase() })); }}
                      />
                    </td>
                    <td />
                    <td className="bg-[#d7ebf8]" />
                    <td className="bg-[#f6b26b] px-0.5 py-1"><Cell value={draft.quantity} disabled={locked} align="right" narrow onChange={(value) => setDraft((current) => ({ ...current, quantity: value }))} /></td>
                    <td />
                    <td className="px-0.5 py-1"><Cell value={draft.unitPrice} disabled={locked} align="right" narrow onChange={(value) => setDraft((current) => ({ ...current, unitPrice: value }))} /></td>
                    <td />
                    <td className="bg-[#e1e2e5]" />
                    <td className="bg-[#e1e2e5]" />
                    <td />
                    <td />
                    <td />
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="text-[11px] font-semibold text-[#22272a]">
                    <td className="px-1 py-1" colSpan={11}>s/IVA {formatEUR(base)}</td>
                    <td className="px-1 py-1 text-right">Aprovado {formatEUR(base)}</td>
                    <td className="bg-[#e1e2e5] px-1 py-1 text-right">{formatEUR(base)}</td>
                    <td className="bg-[#e1e2e5] px-1 py-1 text-right">{formatEUR(pvp)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex items-center gap-2 px-2 py-1 text-[#8d939c]">
              <button type="button" disabled title="Indisponível nesta versão" className="cursor-not-allowed text-[14px]">✎</button>
              <button type="button" disabled title="Indisponível nesta versão" className="cursor-not-allowed text-[14px]">⤢</button>
            </div>
            {suggestField && matches.length && suggestBox
              ? createPortal(
                  <ul
                    role="listbox"
                    aria-label="Artigos em stock"
                    className="fixed z-50 max-h-64 overflow-auto rounded-lg border border-[#d5ebed] bg-white py-1 text-xs shadow-lg"
                    style={{ top: suggestBox.top, left: suggestBox.left, width: suggestBox.width }}
                  >
                    {matches.map((article, index) => {
                      const margin = defaultMargin({ family: article.family, ref: article.ref });
                      return (
                        <li key={article.id} role="option" aria-selected={index === highlight}>
                          <button
                            type="button"
                            className={`flex w-full items-baseline justify-between gap-3 px-2 py-1.5 text-left ${index === highlight ? "bg-[#e7f7f8] text-[#0b5f68]" : ""}`}
                            onMouseEnter={() => setHighlight(index)}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              chooseArticle(article);
                            }}
                          >
                            <span>
                              <span className="font-mono font-semibold">{article.ref}</span> {normalizeArticleDescription(article.description)}
                            </span>
                            <span className="shrink-0 text-[#4d6d73]">{article.family} · {margin}% · {formatEUR(salePrice(article.costPrice, margin))}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>,
                  document.body,
                )
              : null}
          </>
        ) : null}
        {error ? <p className="px-2 pt-2 text-[12px] text-red-700" role="alert">{error}</p> : null}
        <div className="fixed bottom-0 left-0 z-30 flex h-9 w-full items-center gap-3 border-t border-[#eaeaf2] bg-white px-3 text-[11px] lg:left-[var(--rail)] lg:w-[calc(100%-var(--rail))]">
          <label className="flex items-center gap-2 text-[#8d939c]">
            Atribuída a
            <select disabled title="Indisponível nesta versão" className="h-6 cursor-not-allowed rounded border border-[#e1e2e5] bg-[#f7f8fa] px-1 text-[#22272a]">
              <option>Balcão</option>
            </select>
          </label>
          <input type="range" disabled value={40} title="Indisponível nesta versão" className="h-1 w-40 cursor-not-allowed accent-[#00a9fd]" />
          <span className="text-[#22272a]">Aprovado</span>
          <span className="ml-auto truncate text-[#8d939c]">Versão de teste no browser. Faturação simulada, sem validade fiscal.</span>
        </div>
        <div className="fixed right-2 bottom-11 z-30 grid w-[var(--sheet)] gap-1">
          <div className="grid grid-cols-2 gap-1">
            <Button type="button" variant="outline" className="h-8 border-[#00a9fd] bg-white text-[12px] text-[#00a9fd]" disabled={locked || pending} onClick={() => onSave("aberta")}>Por Aprovar</Button>
            <Button type="button" className="h-8 bg-[#00a9fd] text-[12px] hover:bg-[#0096e0]" disabled={locked || pending} onClick={() => onSave("em_curso")}>Aprovado</Button>
          </div>
          <Button type="button" className="h-8 bg-[#00a9fd] text-[12px] hover:bg-[#0096e0]" disabled={locked || pending} onClick={() => onSave("concluida")}>Fechar Processo</Button>
          {canInvoice ? <Button type="button" className="h-8 bg-[#00a9fd] text-[12px] hover:bg-[#0096e0]" disabled={pending} onClick={onInvoice}>Faturar</Button> : null}
        </div>
      </div>
      <aside className="rounded border border-[#eaeaf2] bg-white p-2 text-[11px] text-[#22272a]">
        <label className="block text-center">
          <span className="text-[10px] tracking-wide text-[#8d939c] uppercase">Matrícula</span>
          <input
            aria-label="Matrícula"
            value={plate}
            disabled={locked}
            placeholder="AA-00-AA"
            onChange={(event) => onPlate(event.target.value.toUpperCase())}
            className="mt-0.5 h-8 w-full border-0 border-b-2 border-[#00a9fd] bg-transparent text-center font-mono text-[18px] font-bold tracking-wide uppercase outline-none"
          />
        </label>
        <button type="button" className="mt-1 h-6 w-full text-[11px] text-[#00a9fd]" disabled={locked} onClick={onLookup}>Procurar</button>
        <CarSide color={carColor(plate || "x")} className="mx-auto h-12 w-36" />
        <p className="mb-1 text-center text-[11px] text-[#8d939c]">{brand} {model}</p>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <Spec label="N.º chassi" value={vin} onChange={onVin} disabled={locked} wide />
          <Spec label="Cilindrada" value={version} onChange={onVersion} disabled={locked} />
          <Spec label="Potência" value={engine} onChange={onEngine} disabled={locked} />
          <Spec label="Combustível" value={fuel} onChange={onFuel} disabled={locked} />
          <Spec label="Código Motor" value={engine} onChange={onEngine} disabled={locked} />
          <Spec label="Óleo do Motor" value="" onChange={() => undefined} disabled />
          <Spec label="Código Rádio" value="" onChange={() => undefined} disabled />
          <Spec label="Código de Cor" value={brand.slice(0, 3).toUpperCase()} onChange={() => undefined} disabled />
          <Spec label="Ano" value={year} onChange={onYear} disabled={locked} />
          <Spec label="Marca" value={brand} onChange={onBrand} disabled={locked} />
          <Spec label="Modelo" value={model} onChange={onModel} disabled={locked} />
          <Spec label="Kms entrada" value={km} onChange={onKm} disabled={locked} />
          <Spec label="Kms saída" value={kmOut} onChange={setKmOut} disabled={locked} />
          <Spec label="Próxima IPO" value="" onChange={() => undefined} disabled />
          <Spec label="Próxima revisão" value="" onChange={() => undefined} disabled />
        </div>
        <div className="mt-2 rounded border border-[#eaeaf2] bg-[#f7f8fa] p-1.5">
          <p className="text-[10px] font-semibold tracking-wide text-[#8d939c] uppercase">Histórico</p>
          <p className="mt-0.5">{dateIn || "—"} · {formatEUR(pvp)}</p>
        </div>
      </aside>
      {clientOpen && client ? (
        <ClientEditDialog
          client={{
            name: client.name,
            nif: client.nif,
            phone: client.phone ?? "",
            email: client.email ?? "",
            address: client.address ?? "",
            notes: client.notes ?? "",
          }}
          onClose={() => setClientOpen(false)}
          onSave={onSaveClient}
        />
      ) : null}
      {stockLine ? (
        <StockEntryDialog
          key={`${stockLine.key}:${stockLine.stockEntry?.purchaseLineId ?? "new"}`}
          line={stockLine}
          suppliers={suppliers}
          onClose={() => setStockKey(null)}
          onCreateSupplier={onCreateSupplier}
          onRemove={() => onRemoveStock(stockLine.key, stockLine.stockEntry?.purchaseLineId ?? "")}
          onSave={(input) => {
            const article = articles.find((item) => item.id === stockLine.articleId) ?? articles.find((item) => item.ref === stockLine.ref);
            const family = article?.family || (isOilArticle({ ref: stockLine.ref }) ? "Óleo" : "Produto");
            return onCommitStock({
              lineKey: stockLine.key,
              ref: stockLine.ref,
              description: stockLine.description,
              family,
              margin: article?.marginPercent ?? defaultMargin({ family, ref: stockLine.ref }),
              purchaseLineId: stockLine.stockEntry?.purchaseLineId,
              quantity: input.quantity,
              supplierId: input.supplierId,
              invoiceNumber: input.invoiceNumber,
              date: input.date,
              cost: input.cost,
              vat: input.vat,
            });
          }}
        />
      ) : null}
    </div>
  );
}

function SymptomList({ documentId }: { documentId: string }) {
  const items = useSyncExternalStore(subscribeSymptoms, () => readSymptoms(documentId), () => readSymptoms(""));
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  function commit(next: SymptomItem[]) {
    writeSymptoms(documentId, next);
  }

  function add() {
    const text = draft.trim();
    if (!text) return;
    commit([...items, { id: crypto.randomUUID(), text, done: false }]);
    setDraft("");
  }

  function finishEdit(id: string) {
    const text = editingText.trim();
    if (text) commit(items.map((item) => (item.id === id ? { ...item, text } : item)));
    setEditingId(null);
  }

  return (
    <div className="px-2 pt-2">
      <p className="text-[12px] font-semibold leading-none">Sintomas/Requisitos do Cliente</p>
      {items.length ? (
        <ul className="mt-1 grid gap-0.5">
          {items.map((item) => (
            <li key={item.id} data-testid="symptom-item" className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={item.done}
                aria-label={`Concluído: ${item.text}`}
                onChange={() => commit(items.map((current) => (current.id === item.id ? { ...current, done: !current.done } : current)))}
                className="size-3.5 accent-[#00a9fd]"
              />
              {editingId === item.id ? (
                <input
                  value={editingText}
                  aria-label="Editar sintoma"
                  autoFocus
                  onChange={(event) => setEditingText(event.target.value)}
                  onBlur={() => finishEdit(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      finishEdit(item.id);
                    }
                  }}
                  className="h-6 min-w-0 flex-1 rounded border border-[#00a9fd] bg-white px-1.5 text-[12px] outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditingText(item.text);
                  }}
                  className={`min-w-0 flex-1 truncate text-left ${item.done ? "text-[#8d939c] line-through" : "text-[#22272a]"}`}
                >
                  {item.text}
                </button>
              )}
              <button
                type="button"
                aria-label="Tirar sintoma"
                onClick={() => commit(items.filter((current) => current.id !== item.id))}
                className="inline-grid size-4 shrink-0 place-items-center rounded-full bg-[#6971f9] text-[9px] leading-none text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        data-testid="symptom-input"
        value={draft}
        placeholder="Adicionar sintoma/requisito do cliente"
        aria-label="Adicionar sintoma ou requisito"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        className="mt-1 h-6 w-full rounded border border-[#e1e2e5] bg-white px-2 text-[12px] text-[#22272a] outline-none placeholder:text-[#8d939c]"
      />
    </div>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
      <path fill="currentColor" d="M3 1.5h6.2L13 5.3V14.5H3z" />
      <path fill="#fff" d="M9 1.8v3.4h3.2" />
    </svg>
  );
}

function HeaderField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] tracking-wide text-[#4d6d73] uppercase">{label}</p>
      <div className="font-medium">{children}</div>
    </div>
  );
}

function MiniSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block h-8 rounded-md border border-[#d5ebed] bg-white px-2 text-xs">
        {["Não", "Sim", "Entregue"].map((item) => <option key={item}>{item}</option>)}
      </select>
    </label>
  );
}

function Cell({
  value,
  disabled,
  align,
  narrow,
  label,
  onFocus,
  onKeyDown,
  onChange,
}: {
  value: string;
  disabled: boolean;
  align?: "right";
  narrow?: boolean;
  label?: string;
  onFocus?: (element: HTMLInputElement) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      aria-label={label}
      aria-autocomplete={onKeyDown ? "list" : undefined}
      onFocus={(event) => onFocus?.(event.currentTarget)}
      onKeyDown={onKeyDown}
      onChange={(event) => {
        onChange(event.target.value);
        onFocus?.(event.currentTarget);
      }}
      className={`box-border h-6 max-w-full min-w-0 bg-transparent px-0.5 outline-none ${narrow ? "w-full text-center" : "w-full px-1"} ${align === "right" ? "text-right" : ""}`}
    />
  );
}

function moneyInput(value: number) {
  return pt2(value);
}

function pt2(value: number) {
  return round2(value).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Spec({ label, value, onChange, disabled, wide }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; wide?: boolean }) {
  return (
    <label className={wide ? "col-span-2 block min-w-0" : "block min-w-0"}>
      <span className="block text-[9px] tracking-wide text-[#8d939c] uppercase">{label}</span>
      <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-5 w-full border-0 border-b border-[#eaeaf2] bg-transparent px-0 text-[11px] outline-none disabled:text-[#22272a]" />
    </label>
  );
}
