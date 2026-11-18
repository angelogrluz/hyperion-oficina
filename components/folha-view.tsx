"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { can, readCurrentUserId, readUsers, subscribeAccess } from "@/lib/user-settings";
import { assignTechnician, formatClock, readLogs, subscribeOps, technicianOf, workedMs } from "@/lib/workshop-ops";
import Link from "next/link";
import { createPortal } from "react-dom";
import { PackagePlus, Pencil, Plus, X } from "lucide-react";
import { ClientSearch } from "@/components/client-picker";
import type { ClientSeed, SearchableVehicle } from "@/lib/client-search";
import { CarSide, carColor } from "@/components/car-side";
import { ClientEditDialog, NewClientDialog, StockEntryDialog, type ClientForm } from "@/components/sheet-dialogs";
import { useSetSheetHeader, useSetSheetSidebar } from "@/components/sheet-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApprovalBadge } from "@/components/approval-badge";
import { type Approval } from "@/lib/approval";
import { readSymptoms, subscribeSymptoms, writeSymptoms, type SymptomItem } from "@/lib/browser-cache";
import { LINE_KINDS, lineKindLabel } from "@/lib/line-kinds";
import { defaultMargin, includesSearch, isOilArticle, lineAmounts, marginFromCost, normalizeArticleDescription, parseDecimal, prefillUnitCost, round2, roundPrice, salePrice } from "@/lib/domain";
import { formatEUR } from "@/lib/format";
import type { StockLink } from "@/lib/stock-entry";
import type { EditorArticle, EditorClient } from "@/components/document-editor";

type SheetLine = {
  key: string;
  kind: "mao_de_obra" | "peca" | "servico" | "servico_externo";
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

const EMPTY_DRAFT = { description: "", ref: "", quantity: "1", unitPrice: "", vatRate: "", kind: "" as "" | "mao_de_obra" | "peca" | "servico" | "servico_externo" };
const VAT_CHOICES = ["23", "13", "6", "0"];

const TABS = ["Folha de obra", "Consumíveis", "Checklist de Verificação", "Notas"] as const;

export function FolhaView({
  documentId,
  number,
  statusLabel,
  imported,
  userName,
  printHref,
  locked,
  pending,
  client,
  clients,
  clientId,
  consumidorFinal,
  onConsumidorFinal,
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
  engineCode,
  oil,
  fuel,
  km,
  kmOut,
  nextInspection,
  nextService,
  onProblem,
  onNotes,
  onDateIn,
  onLine,
  onRemove,
  onReorder,
  onAdd,
  onPlate,
  onBrand,
  onModel,
  onVersion,
  onYear,
  onVin,
  onEngine,
  onEngineCode,
  onOil,
  onFuel,
  onKm,
  onKmOut,
  onNextInspection,
  onNextService,
  onLookup,
  onSave,
  approval,
  approvalAt,
  onApproval,
  onFlush,
  isNew,
  saveState,
  onInvoice,
  onQuote,
  canInvoice,
  invoiceHint,
  billingNote,
  clientVehicles,
  onPickVehicle,
  quoteNumber,
  quoteHref,
  invoiceNumber,
  invoiceHref,
  onOpenInvoice,
  onOpenReceipt,
  paid,
  onMarkPaid,
  suppliers,
  onSaveClient,
  onCreateClient,
  onCreateSupplier,
  onCommitStock,
  onRemoveStock,
  vehicles,
  onClearVehicle,
}: {
  documentId?: string;
  number?: string;
  statusLabel?: string;
  imported?: boolean;
  userName: string;
  printHref?: string;
  locked: boolean;
  pending: boolean;
  client?: EditorClient;
  clients: EditorClient[];
  vehicles?: SearchableVehicle[];
  onClearVehicle?: () => void;
  clientId: string;
  consumidorFinal: boolean;
  onConsumidorFinal: (next: boolean) => void;
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
  engineCode: string;
  oil: string;
  fuel: string;
  km: string;
  kmOut: string;
  nextInspection: string;
  nextService: string;
  onProblem: (value: string) => void;
  onNotes: (value: string) => void;
  onDateIn: (value: string) => void;
  onLine: (key: string, patch: Partial<SheetLine>) => void;
  onRemove: (key: string) => void;
  onReorder?: (dragKey: string, beforeKey: string | null) => void;
  onAdd: (draft: {
    description: string;
    ref: string;
    quantity: string;
    unitPrice: string;
    unitCost?: string;
    vatRate?: string;
    articleId?: string | null;
    kind?: "mao_de_obra" | "peca" | "servico" | "servico_externo" | "";
  }) => void;
  onPlate: (value: string) => void;
  onBrand: (value: string) => void;
  onModel: (value: string) => void;
  onVersion: (value: string) => void;
  onYear: (value: string) => void;
  onVin: (value: string) => void;
  onEngine: (value: string) => void;
  onEngineCode: (value: string) => void;
  onOil: (value: string) => void;
  onFuel: (value: string) => void;
  onKm: (value: string) => void;
  onKmOut: (value: string) => void;
  onNextInspection: (value: string) => void;
  onNextService: (value: string) => void;
  onLookup: () => void;
  onSave: (status?: string) => void;
  approval?: Approval;
  approvalAt?: string | null;
  onApproval?: (next: Approval) => void;
  onFlush?: () => void;
  isNew?: boolean;
  saveState?: "saved" | "saving" | "dirty" | "error";
  onInvoice: () => void;
  onQuote: () => void;
  canInvoice: boolean;
  invoiceHint?: string | null;
  hasLines?: boolean;
  billingNote?: string;
  clientVehicles?: { id: string; plate: string; label: string }[];
  onPickVehicle?: (id: string) => void;
  quoteNumber?: string | null;
  quoteHref?: string;
  invoiceNumber?: string | null;
  invoiceHref?: string;
  onOpenInvoice?: () => void;
  onOpenReceipt?: () => void;
  paid?: boolean;
  onMarkPaid?: () => void;
  suppliers: { id: string; name: string }[];
  onSaveClient: (data: ClientForm) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCreateClient: (data: ClientForm) => Promise<{ ok: true } | { ok: false; error: string }>;
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
  const [promiseQuote, setPromiseQuote] = useState("");
  const [promiseDelivery, setPromiseDelivery] = useState("");
  const [keyBox, setKeyBox] = useState("Não");
  const [book, setBook] = useState("Não");
  const [docs, setDocs] = useState("Não");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  useSyncExternalStore(subscribeAccess, readCurrentUserId, () => "u-angelo");
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useSyncExternalStore(subscribeOps, readLogs, readLogs);
  const showCosts = can("precos.ver");
  const showContacts = can("clientes.contactos");
  const allowDelete = can("obras.apagar");
  const allowApprove = can("obras.aprovar");
  const allowClose = can("obras.fechar");
  const allowQuote = can("orcamentos.criar");
  const allowInvoice = can("faturacao.faturar");
  const technicians = readUsers().filter((user) => user.active && user.technician);
  const [suggestField, setSuggestField] = useState<"ref" | "description" | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [suggestBox, setSuggestBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientSeed, setNewClientSeed] = useState<ClientSeed | null>(null);
  const [stockKey, setStockKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [lineEditMode, setLineEditMode] = useState(false);
  // Compact table by default on smaller screens (fits at 1280 px); «Todas as colunas» shows costs, margins and stock.
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1700);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const dropKeyRef = useRef<string | null>(null);
  const openClientRef = useRef<() => void>(() => {});
  const onFinalRef = useRef(onConsumidorFinal);
  useEffect(() => {
    openClientRef.current = () => setClientOpen(true);
  }, []);
  useEffect(() => {
    onFinalRef.current = onConsumidorFinal;
  }, [onConsumidorFinal]);
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
    const cost = prefillUnitCost(article);
    onAdd({
      description: normalizeArticleDescription(article.description),
      ref: article.ref,
      quantity: draft.quantity || "1",
      unitPrice: moneyInput(salePrice(cost, margin)),
      unitCost: moneyInput(cost),
      vatRate: moneyInput(article.vatRate),
      articleId: article.id,
    });
    setDraft({ ...EMPTY_DRAFT });
    setSuggestField(null);
  }

  function addFreeLine() {
    if (!draft.description.trim() && !draft.ref.trim()) return;
    onAdd(draft);
    // Keep the family chosen for the next line (default «Novo (auto)»).
    setDraft({ ...EMPTY_DRAFT, kind: draft.kind });
    setSuggestField(null);
  }

  // A typed line that was never added must not be lost silently.
  const draftPending = !locked && Boolean(draft.description.trim() || draft.ref.trim());
  const pendingActionRef = useRef<(() => void) | null>(null);
  const latestProps = useRef({ onSave, onInvoice });
  latestProps.current = { onSave, onInvoice };
  function withDraft(action: (props: typeof latestProps.current) => void) {
    if (!draftPending) { action(latestProps.current); return; }
    const label = draft.description.trim() || draft.ref.trim();
    if (window.confirm(`A linha «${label}» ainda não foi adicionada à folha. Adicionar agora antes de continuar?\n\nOK = adicionar e continuar · Cancelar = continuar sem ela`)) {
      addFreeLine();
      pendingActionRef.current = () => action(latestProps.current);
      return;
    }
    action(latestProps.current);
  }
  useEffect(() => {
    const run = pendingActionRef.current;
    if (!run) return;
    pendingActionRef.current = null;
    run();
  });
  useEffect(() => {
    if (!draftPending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftPending]);

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

  function onDraftEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addFreeLine();
  }

  const setSidebar = useSetSheetSidebar();
  const onClientRef = useRef(onClient);
  useEffect(() => {
    onClientRef.current = onClient;
  }, [onClient]);
  useEffect(() => {
    setSidebar(
      <div className="grid gap-2 text-xs">
        <button
          type="button"
          data-testid="consumidor-final"
          aria-pressed={consumidorFinal}
          onClick={() => onFinalRef.current(!consumidorFinal)}
          className={`h-7 rounded px-2 text-left font-semibold ${consumidorFinal ? "bg-[var(--glow)] text-[16px] text-white" : client ? "border border-white/20 bg-transparent text-[13px] text-white/80 hover:bg-white/10" : "border border-white/20 bg-white/10 text-[16px] text-white hover:bg-white/20"}`}
        >
          {consumidorFinal ? "Consumidor final ativo" : client ? "Faturar como consumidor final" : "Consumidor final"}
        </button>
        {consumidorFinal ? (
          <p className="rounded border border-[var(--glow)] bg-[var(--glow)]/20 px-2 py-1 text-[16px] leading-snug">
            Faturação: Consumidor final, NIF 999999990, sem morada. Os orçamentos desta folha usam este cliente.
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-1">
          <p className="text-[14px] tracking-wide text-white/70 uppercase">Contacto cliente</p>
          <span className="flex items-center gap-1">
          <button
            type="button"
            data-testid="new-client"
            title="Novo cliente"
            aria-label="Novo cliente"
            onClick={() => { setNewClientSeed(null); setNewClientOpen(true); }}
            className="inline-flex h-7 items-center gap-1 rounded bg-white/10 px-2 text-[14px] font-semibold text-white hover:bg-white/20"
          >
            <Plus className="size-3" />
            Novo
          </button>
          <button
            type="button"
            data-testid="edit-client"
            title="Editar cliente"
            aria-label="Editar cliente"
            disabled={!client || consumidorFinal}
            onClick={() => openClientRef.current()}
            className="inline-grid size-4 place-items-center rounded text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-40"
          >
            <Pencil className="size-3" />
          </button>
          </span>
        </div>
        {client ? (
          <div className="flex items-start justify-between gap-1">
            <p data-testid="cliente-escolhido" className="min-w-0 text-[18px] leading-tight font-semibold break-words">{client.name}</p>
            {locked ? null : (
              <button
                type="button"
                data-testid="limpar-cliente"
                title="Limpar cliente"
                aria-label="Limpar cliente"
                onClick={() => onClientRef.current("")}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded bg-white/10 px-2 text-[14px] font-semibold text-white hover:bg-white/20"
              >
                <X className="size-3" />
                Limpar
              </button>
            )}
          </div>
        ) : (
          <>
            <ClientSearch
              clients={clients}
              vehicles={vehicles}
              tone="dark"
              disabled={locked}
              placeholder="Nome, NIF, telefone…"
              onPick={(item) => onClientRef.current(item.id)}
              onCreate={(seed) => { setNewClientSeed(seed); setNewClientOpen(true); }}
            />
            <p className="text-[18px] leading-tight font-semibold">Sem cliente</p>
          </>
        )}
        {showContacts ? <p>{client?.phone || "Sem telefone"}</p> : null}
        {showContacts ? <p className="break-all">{client?.email || "Sem e-mail"}</p> : null}
        {showContacts ? <p>NIF {client?.nif || "—"}</p> : null}
        {showContacts ? <p className="text-white/90">{client?.address || "Sem morada"}</p> : null}
        {showContacts && (client?.postalCode || client?.city) ? <p>{[client.postalCode, client.city].filter(Boolean).join(" ")}</p> : null}
        <p className="mt-2 text-[14px] tracking-wide text-white/70 uppercase">Notas</p>
        <p>{client?.notes || "Sem notas do cliente."}</p>
        <p className="mt-2 text-[14px] tracking-wide text-white/70 uppercase">Histórico notas</p>
        <p>{notes || "Sem notas nesta obra."}</p>
      </div>,
    );
    return () => setSidebar(null);
  }, [setSidebar, locked, clientId, clients, vehicles, consumidorFinal, client?.id, client?.name, client?.phone, client?.email, client?.nif, client?.address, client?.postalCode, client?.city, client?.notes, notes, showContacts]);

  const setHeader = useSetSheetHeader();
  const headerActions = useRef({ onDateIn, setPromiseQuote, setPromiseDelivery });
  useEffect(() => {
    headerActions.current = { onDateIn, setPromiseQuote, setPromiseDelivery };
  }, [onDateIn]);
  useEffect(() => {
    setHeader(
      <div className="flex h-12 w-full items-stretch gap-px bg-[#e4e6ea] px-1 py-1 shadow-[0_1px_2px_rgba(34,39,42,.12)]">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 bg-[#f4f6f8] px-2">
          <span className="text-[var(--glow)]" aria-hidden><DocIcon /></span>
          <span className="text-[var(--glow)]" aria-hidden><DocIcon /></span>
          <div className="min-w-0 leading-tight">
            <p className="text-[13px] tracking-wide text-[var(--steel)] uppercase">Folha de Obra</p>
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[17px] font-semibold">{number ?? "Nova"}</p>
              {statusLabel ? <span className="rounded bg-[#1f4b3a] px-1.5 py-0.5 text-[12px] font-semibold text-white">{statusLabel}</span> : null}
              {imported ? <span className="rounded border border-[var(--glow)] px-1.5 py-0.5 text-[12px] font-semibold text-[var(--glow)]">Importado</span> : null}
              {approval && statusLabel !== "Faturada" ? <ApprovalBadge approval={approval} at={approvalAt} /> : null}
            </div>
          </div>
        </div>
        <label className="flex min-w-0 flex-1 flex-col justify-center bg-white px-2">
          <span className="text-[13px] tracking-wide text-[var(--steel)] uppercase">Dia de chegada</span>
          <input type="date" value={dateIn} disabled={locked} onChange={(event) => headerActions.current.onDateIn(event.target.value)} className="h-8 w-full border-0 bg-transparent px-0 text-[17px] outline-none" />
        </label>
        <label className="flex min-w-0 flex-[1.3] flex-col justify-center bg-[var(--paper)] px-2">
          <span className="text-[13px] tracking-wide text-[var(--steel)] uppercase">Promessa de orçamento</span>
          <input value={promiseQuote} disabled={locked} placeholder="00/00/0000 00:00" onChange={(event) => headerActions.current.setPromiseQuote(event.target.value)} className="h-8 w-full border-0 bg-transparent px-0 text-[17px] outline-none" />
        </label>
        <label className="flex min-w-0 flex-[1.3] flex-col justify-center bg-white px-2">
          <span className="text-[13px] tracking-wide text-[var(--steel)] uppercase">Promessa de entrega</span>
          <input value={promiseDelivery} disabled={locked} placeholder="00/00/0000 00:00" onChange={(event) => headerActions.current.setPromiseDelivery(event.target.value)} className="h-8 w-full border-0 bg-transparent px-0 text-[17px] outline-none" />
        </label>
        <div className="flex items-center gap-2 bg-[#f4f6f8] px-2">
          <button type="button" disabled title="Indisponível nesta versão" className="size-6 cursor-not-allowed rounded-full border border-[#e1e2e5] bg-white text-[14px] text-[var(--steel)]">i</button>
          <span className="text-[17px] font-semibold whitespace-nowrap">{userName}</span>
        </div>
      </div>,
    );
    return () => setHeader(null);
  }, [setHeader, number, statusLabel, imported, dateIn, promiseQuote, promiseDelivery, userName, locked, approval, approvalAt]);

  const computed = lines.map((line) => {
    const quantity = parseDecimal(line.quantity) ?? 0;
    const unitPrice = parseDecimal(line.unitPrice) ?? 0;
    const unitCost = parseDecimal(line.unitCost) ?? 0;
    const discountPercent = parseDecimal(line.discount) ?? 0;
    const vatRate = parseDecimal(line.vatRate) ?? 0;
    const amounts = lineAmounts({ quantity, unitPrice, unitCost, vatRate, discountPercent });
    const article = articles.find((item) => item.id === line.articleId);
    const family = line.kind === "peca" ? article?.family || "Peça" : lineKindLabel(line.kind);
    const netUnit = unitPrice * (1 - Math.min(100, Math.max(0, discountPercent)) / 100);
    const margin = netUnit > 0 ? round2(((netUnit - unitCost) / netUnit) * 100) : 0;
    const markup = marginFromCost(unitCost, unitPrice);
    const lucro = round2((unitPrice - unitCost) * quantity);
    const stockArticle = articles.find((item) => item.id === line.articleId) ?? articles.find((item) => item.ref === line.ref);
    const stock = stockArticle ? String(stockArticle.stockQty).replace(".", ",") : "—";
    return { line, quantity, unitPrice, unitCost, amounts, family, margin, markup, lucro, stock };
  });
  const visible = tab === "Consumíveis"
    ? computed.filter((row) => ["Óleo", "Filtros", "Eco Taxa"].includes(row.family))
    : computed;
  const custo = round2(computed.reduce((sum, row) => sum + row.unitCost * row.quantity, 0));
  const pvp = round2(computed.reduce((sum, row) => sum + row.amounts.total, 0));
  const lucro = round2(computed.reduce((sum, row) => sum + row.amounts.margin, 0));
  const mo = round2(computed.filter((row) => row.line.kind === "mao_de_obra").reduce((sum, row) => sum + row.amounts.base, 0));
  const produtos = round2(computed.filter((row) => row.line.kind === "peca").reduce((sum, row) => sum + row.amounts.base, 0));
  const servicos = round2(computed.filter((row) => row.line.kind === "servico").reduce((sum, row) => sum + row.amounts.base, 0));
  const externos = round2(computed.filter((row) => row.line.kind === "servico_externo").reduce((sum, row) => sum + row.amounts.base, 0));
  const desc = round2(computed.reduce((sum, row) => sum + (row.quantity * row.unitPrice - row.amounts.base), 0));
  const iva = round2(computed.reduce((sum, row) => sum + row.amounts.vat, 0));
  const base = round2(computed.reduce((sum, row) => sum + row.amounts.base, 0));
  const beforePrice = 1 + (lineEditMode ? 1 : 0) + 2 + (wide ? 1 : 0) + 1 + (showCosts && wide ? 2 : 0) + 2 + (showCosts && wide ? 1 : 0);
  const totalCols = 1 + (lineEditMode ? 1 : 0) + 2 + (wide ? 1 : 0) + 1 + (showCosts && wide ? 2 : 0) + 2 + (showCosts ? (wide ? 5 : 3) : 0) + (wide ? 2 : 0) + 1;
  const stockLine = lines.find((item) => item.key === stockKey && item.kind === "peca") ?? null;

  function leaveLineEdit() {
    setLineEditMode(false);
    setSelectedKey(null);
  }

  function startDrag(event: ReactPointerEvent<HTMLElement>, key: string) {
    if (!lineEditMode || locked || !onReorder) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    dropKeyRef.current = null;
    setDropKey(null);
    const move = (pointer: PointerEvent) => {
      const element = document.elementFromPoint(pointer.clientX, pointer.clientY);
      const row = element?.closest("[data-line-key]");
      const target = row?.getAttribute("data-line-key") ?? null;
      dropKeyRef.current = target === key ? null : target;
      setDropKey(dropKeyRef.current);
    };
    const finish = (pointer: PointerEvent) => {
      if (handle.hasPointerCapture(pointer.pointerId)) handle.releasePointerCapture(pointer.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      const target = dropKeyRef.current;
      dropKeyRef.current = null;
      setDropKey(null);
      if (target) onReorder(key, target);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Delete" || locked || !lineEditMode || !selectedKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      onRemove(selectedKey);
      setSelectedKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lineEditMode, locked, onRemove, selectedKey]);

  return (
    <div className="grid items-start gap-3 pb-16 xl:grid-cols-[minmax(0,1fr)_var(--sheet)] [--sheet:clamp(230px,15vw,280px)]" onBlur={(event) => {
      // Focus moving into a dialog (Faturar, cliente, stock) is not leaving the sheet.
      const next = event.relatedTarget instanceof Element ? event.relatedTarget : null;
      if (next?.closest('[role="dialog"], [data-slot="dialog-content"]')) return;
      onFlush?.();
    }}>
      <div className="min-w-0 bg-white text-[var(--charcoal)]">
        <SymptomList documentId={documentId || "rascunho"} />
        <div className="mt-2 flex flex-wrap items-end gap-1 border-b border-[#eaeaf2] px-2 py-1">
          <label className="min-w-48 flex-1 text-[16px]">
            Observações do cliente
            <Textarea value={problem} disabled={locked} onChange={(event) => onProblem(event.target.value)} className="mt-0.5 min-h-8 border-[#e1e2e5] text-[17px]" />
          </label>
          <MiniSelect label="Chave de segurança" value={keyBox} onChange={setKeyBox} />
          <MiniSelect label="Livro de manutenção" value={book} onChange={setBook} />
          <MiniSelect label="Documentos" value={docs} onChange={setDocs} />
          <div className="ml-auto flex gap-2">
            {documentId || printHref ? (
              <details className="relative">
                <summary data-testid="imprimir-menu" className="flex h-9 cursor-pointer list-none items-center rounded border border-[var(--glow)] bg-white px-3 text-[16px] font-medium text-[var(--glow)] [&::-webkit-details-marker]:hidden">
                  Imprimir
                </summary>
                <div className="absolute right-0 z-50 mt-1 w-56 rounded border border-[var(--line)] bg-white p-1 text-[17px] shadow-lg">
                  <Link href={printHref || `/ordens/${documentId}/imprimir`} data-testid="imprimir-folha" className="block rounded px-2 py-1.5 hover:bg-[var(--mist)]">
                    Folha de obra (cliente)
                  </Link>
                  <Link
                    href={`/ordens/${documentId}/servicos${promiseDelivery ? `?promessa=${encodeURIComponent(promiseDelivery)}` : ""}`}
                    data-testid="imprimir-servicos"
                    className="block rounded px-2 py-1.5 hover:bg-[var(--mist)]"
                  >
                    Folha de serviços (oficina)
                  </Link>
                </div>
              </details>
            ) : (
              <span className="inline-flex h-9 items-center rounded border border-[#e1e2e5] px-3 text-[16px] text-[var(--steel)]">Imprimir</span>
            )}
            <Button type="button" variant="outline" className="h-9 px-3 text-[16px]" disabled={locked || pending} onClick={() => onSave()}>Editor</Button>
          </div>
        </div>
        <div className="flex gap-1 border-b border-[var(--line)] px-2 pt-2">
          {TABS.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`border-b-2 px-2 py-1 text-[17px] ${tab === item ? "border-[var(--glow)] font-semibold text-[var(--charcoal)]" : "border-transparent text-[var(--steel)]"}`}>
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
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 py-1 text-[16px] text-[var(--charcoal)]">
              <span>Custo {formatEUR(custo)}</span>
              <span>PVP {formatEUR(pvp)}</span>
              <span>Lucro {formatEUR(lucro)}</span>
              <span>MO {formatEUR(mo)}</span>
              <span>Peças {formatEUR(produtos)}</span>
              {servicos ? <span>Serviços {formatEUR(servicos)}</span> : null}
              {externos ? <span>Serv. externos {formatEUR(externos)}</span> : null}
              <span>Desc. {formatEUR(desc)}</span>
              <span>IVA {formatEUR(iva)}</span>
            </div>
            <div className="overflow-x-auto">
              <table data-testid="sheet-table" className={`w-full table-fixed border-collapse text-[16px] text-[var(--charcoal)] ${wide ? (lineEditMode ? "min-w-[1476px]" : "min-w-[1444px]") : "min-w-[640px]"}`}>
                <colgroup>
                  <col style={{ width: "36px" }} />
                  {lineEditMode ? <col style={{ width: "32px" }} /> : null}
                  <col style={{ width: "120px" }} />
                  <col />
                  {wide ? <col style={{ width: "112px" }} /> : null}
                  <col style={{ width: "128px" }} />
                  {showCosts && wide ? <col style={{ width: "112px" }} /> : null}
                  {showCosts && wide ? <col style={{ width: "72px" }} /> : null}
                  <col style={{ width: "60px" }} />
                  <col style={{ width: "72px" }} />
                  {showCosts && wide ? <col style={{ width: "68px" }} /> : null}
                  {showCosts ? <col style={{ width: "84px" }} /> : null}
                  {showCosts ? <col style={{ width: "68px" }} /> : null}
                  {showCosts && wide ? <col style={{ width: "148px" }} /> : null}
                  {showCosts ? <col style={{ width: "104px" }} /> : null}
                  {wide ? <col style={{ width: "32px" }} /> : null}
                  {wide ? <col style={{ width: "56px" }} /> : null}
                  <col style={{ width: "32px" }} />
                </colgroup>
                <thead className="text-[16px] text-[var(--charcoal)]">
                  <tr>
                    <th className="overflow-hidden bg-[#e1e2e5] px-1 py-1.5 text-center font-semibold whitespace-nowrap">O</th>
                    {lineEditMode ? <th className="overflow-hidden bg-[#e1e2e5] px-0.5 py-1.5" aria-label="Ordenar" /> : null}
                    <th className="overflow-hidden bg-[#e1e2e5] px-1 py-1.5 text-left font-semibold whitespace-nowrap">Família</th>
                    <th className="overflow-hidden bg-[#e1e2e5] px-1 py-1.5 text-left font-semibold whitespace-nowrap">Descrição</th>
                    {wide ? <th className="overflow-hidden bg-[#e1e2e5] px-1 py-1.5 text-left font-semibold whitespace-nowrap">Obs. internas</th> : null}
                    <th className="overflow-hidden bg-[#e1e2e5] px-1 py-1.5 text-left font-semibold whitespace-nowrap">Ref.</th>
                    {showCosts && wide ? <th className="overflow-hidden bg-[#b3b8c1] px-1 py-1.5 text-right font-semibold whitespace-nowrap">Lucro s/desc.</th> : null}
                    {showCosts && wide ? <th className="overflow-hidden bg-[#b3b8c1] px-1 py-1.5 text-right font-semibold whitespace-nowrap">Custo</th> : null}
                    <th className="overflow-hidden bg-[#b3b8c1] px-1 py-1.5 text-right font-semibold whitespace-nowrap">Qtd.</th>
                    <th className="overflow-hidden bg-[#b3b8c1] px-1 py-1.5 text-right font-semibold whitespace-nowrap">IVA %</th>
                    {showCosts && wide ? <th className="overflow-hidden bg-[#b3b8c1] px-1 py-1.5 text-right font-semibold whitespace-nowrap">Marg.</th> : null}
                    {showCosts ? <th className="overflow-hidden bg-[#b3b8c1] px-1 py-1.5 text-right font-semibold whitespace-nowrap">PVP Base</th> : null}
                    {showCosts ? <th className="overflow-hidden bg-[#b3b8c1] px-1 py-1.5 text-right font-semibold whitespace-nowrap">Desc.%</th> : null}
                    {showCosts && wide ? <th className="overflow-hidden bg-[#b3b8c1] px-1 py-1.5 text-right font-semibold whitespace-nowrap">PVP Cliente s/IVA</th> : null}
                    {showCosts ? <th className="overflow-hidden bg-[#b3b8c1] px-1 py-1.5 text-right font-semibold whitespace-nowrap">PVP Cliente</th> : null}
                    {wide ? <th className="overflow-hidden bg-[#e1e2e5] px-1 py-1.5 text-center font-semibold whitespace-nowrap">A</th> : null}
                    {wide ? <th className="overflow-hidden bg-[#e1e2e5] px-1 py-1.5 text-right font-semibold whitespace-nowrap">Stock</th> : null}
                    <th className="overflow-hidden bg-[#e1e2e5] px-0.5 py-1.5" aria-label="Entrada de stock" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.line.key}
                      data-testid="sheet-line"
                      data-line-key={row.line.key}
                      onClick={() => { if (lineEditMode) setSelectedKey(row.line.key); }}
                      className={`${row.line.kind === "peca" ? "bg-[#f5f6fa]" : "bg-white"} ${lineEditMode && selectedKey === row.line.key ? "outline outline-2 outline-[var(--glow)]" : ""} ${dropKey === row.line.key ? "shadow-[inset_0_3px_0_var(--glow)]" : ""}`}
                    >
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 text-center">
                        {lineEditMode && allowDelete ? (
                          <button
                            type="button"
                            data-testid="delete-line"
                            disabled={locked}
                            title="Apagar linha"
                            aria-label={`Apagar ${row.line.description || "linha"}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onRemove(row.line.key);
                              if (selectedKey === row.line.key) setSelectedKey(null);
                            }}
                            className="inline-grid size-6 place-items-center rounded-full bg-[#d64545] text-[16px] leading-none font-bold text-white hover:bg-[#b83838] disabled:opacity-40"
                          >
                            ×
                          </button>
                        ) : null}
                      </td>
                      {lineEditMode ? (
                        <td
                          data-testid="drag-handle"
                          aria-label="Arrastar linha"
                          onPointerDown={(event) => startDrag(event, row.line.key)}
                          className="cursor-grab touch-none overflow-hidden border-b border-[#eaeaf2] px-0 text-center text-[18px] leading-none text-[var(--charcoal)] select-none active:cursor-grabbing"
                        >
                          ≡
                        </td>
                      ) : null}
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-1 py-0.5" title={row.family}>
                        <select
                          data-testid="line-kind"
                          aria-label="Família"
                          value={row.line.kind}
                          disabled={locked}
                          onChange={(event) => onLine(row.line.key, { kind: event.target.value as SheetLine["kind"] })}
                          className="h-8 w-full min-w-0 bg-transparent text-[15px] outline-none"
                        >
                          {LINE_KINDS.map((item) => (
                            <option key={item.value} value={item.value}>{item.value === "peca" && row.line.kind === "peca" ? row.family : item.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="border-b border-[#eaeaf2] px-1 py-0.5" title={row.line.description}><WrapCell value={row.line.description} disabled={locked} label="Descrição" onChange={(value) => onLine(row.line.key, { description: value })} /></td>
                      {wide ? <td className="overflow-hidden border-b border-[#eaeaf2] px-1 py-0.5"><Cell value={row.line.note} disabled={locked} onChange={(value) => onLine(row.line.key, { note: value })} /></td> : null}
                      <td className="border-b border-[#eaeaf2] px-1 py-0.5" title={row.line.ref}>
                        <Cell value={row.line.ref} disabled={locked} label="Referência" testId="line-ref" onChange={(value) => onLine(row.line.key, { ref: value.toUpperCase() })} />
                      </td>
                      {showCosts && wide ? <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 py-0.5 text-right tabular-nums">{formatEUR(row.lucro)}</td> : null}
                      {showCosts && wide ? <td className="overflow-hidden border-b border-[#eaeaf2] bg-[#d7ebf8] px-0.5 py-0.5">
                        <NumberCell
                          value={row.unitCost}
                          disabled={locked}
                          label="Preço de custo"
                          testId="line-cost"
                          onCommit={(cost) => {
                            if (row.line.kind !== "peca") {
                              onLine(row.line.key, { unitCost: moneyInput(cost) });
                              return;
                            }
                            const margin = marginFromCost(row.unitCost, row.unitPrice);
                            onLine(row.line.key, { unitCost: moneyInput(cost), unitPrice: moneyInput(salePrice(cost, margin)) });
                          }}
                        />
                      </td> : null}
                      <td className="overflow-hidden border-b border-[#eaeaf2] bg-[#f6b26b] px-0.5 py-0.5">
                        <NumberCell value={row.quantity} disabled={locked} label="Quantidade" testId="line-qty" onCommit={(quantity) => onLine(row.line.key, { quantity: moneyInput(quantity) })} />
                      </td>
                      <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 py-0.5 text-right">
                        <VatSelect value={row.line.vatRate} disabled={locked} testId="line-vat" onChange={(vatRate) => onLine(row.line.key, { vatRate })} />
                      </td>
                      {showCosts && wide ? <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 py-0.5 text-right tabular-nums">
                        {row.line.kind === "peca" ? (
                          <NumberCell
                            value={row.markup}
                            disabled={locked}
                            label="Margem"
                            testId="line-margin"
                            onCommit={(margin) => onLine(row.line.key, { unitPrice: moneyInput(salePrice(row.unitCost, margin)) })}
                          />
                        ) : (
                          <span>{pt2(row.margin)}%</span>
                        )}
                      </td> : null}
                      {showCosts ? <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 py-0.5">
                        <NumberCell value={row.unitPrice} disabled={locked || !can("precos.alterar")} label="PVP base" testId="line-price" onCommit={(price) => onLine(row.line.key, { unitPrice: moneyInput(price) })} />
                      </td> : null}
                      {showCosts ? <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 py-0.5">
                        <NumberCell value={parseDecimal(row.line.discount) ?? 0} disabled={locked || !can("precos.alterar")} label="Desconto" testId="line-discount" onCommit={(discount) => onLine(row.line.key, { discount: moneyInput(discount) })} />
                      </td> : null}
                      {showCosts && wide ? <td className="overflow-hidden border-b border-[#eaeaf2] bg-[#e1e2e5] px-0.5 py-0.5 text-right tabular-nums">{lineBase(row.amounts.base)}</td> : null}
                      {showCosts ? <td className="overflow-hidden border-b border-[#eaeaf2] bg-[#e1e2e5] px-0.5 py-0.5 text-right tabular-nums">{formatEUR(row.amounts.total)}</td> : null}
                      {wide ? <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 text-center"><span className="inline-grid size-5 place-items-center rounded-full bg-[#6971f9] text-[12px] text-white">●</span></td> : null}
                      {wide ? <td className="overflow-hidden border-b border-[#eaeaf2] px-0.5 text-right tabular-nums">{row.stock}</td> : null}
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
                            className={`inline-grid size-4 place-items-center rounded ${row.line.stockEntry ? "bg-[#1f8a4c] text-white" : "bg-[#e1e2e5] text-[var(--charcoal)] hover:bg-[#d7ebf8]"} disabled:opacity-40`}
                          >
                            <PackagePlus className="size-3" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#eaeaf2]">
                    <td className="px-0.5 text-center">
                      <button type="button" data-testid="adicionar-linha" title="Adicionar linha (Enter)" className={`inline-grid size-7 place-items-center rounded-full bg-[#f5a623] text-[19px] leading-none font-bold text-white disabled:opacity-40 ${draftPending ? "animate-pulse ring-2 ring-[#f5a623] ring-offset-1" : ""}`} disabled={locked || (!draft.description.trim() && !draft.ref.trim())} onClick={addFreeLine} aria-label="Adicionar linha">+</button>
                    </td>
                    {lineEditMode ? <td /> : null}
                    <td className="px-1 py-1">
                      <select aria-label="Família da nova linha" data-testid="new-line-kind" value={draft.kind} disabled={locked} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as typeof current.kind }))} className="h-8 w-full min-w-0 bg-transparent text-[15px] text-[var(--steel)] outline-none">
                        <option value="">Novo (auto)</option>
                        {LINE_KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </td>
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
                    {wide ? <td /> : null}
                    <td className="px-1 py-1">
                      <Cell
                        value={draft.ref}
                        disabled={locked}
                        label="Referência"
                        testId="new-line-ref"
                        onFocus={(element) => { setHighlight(0); placeSuggest("ref", element); }}
                        onKeyDown={onSuggestKey}
                        onChange={(value) => { setHighlight(0); setDraft((current) => ({ ...current, ref: value.toUpperCase() })); }}
                      />
                    </td>
                    {showCosts && wide ? <td /> : null}
                    {showCosts && wide ? <td className="bg-[#d7ebf8]" /> : null}
                    <td className="bg-[#f6b26b] px-0.5 py-1"><Cell value={draft.quantity} disabled={locked} align="right" narrow label="Quantidade da nova linha" onKeyDown={onDraftEnter} onChange={(value) => setDraft((current) => ({ ...current, quantity: value }))} /></td>
                    <td className="px-0.5 py-1 text-right"><VatSelect value={draft.vatRate} disabled={locked} allowDefault testId="new-line-vat" onChange={(vatRate) => setDraft((current) => ({ ...current, vatRate }))} /></td>
                    {showCosts && wide ? <td /> : null}
                    {showCosts ? <td className="px-0.5 py-1"><Cell value={draft.unitPrice} disabled={locked} align="right" narrow label="Preço da nova linha" onKeyDown={onDraftEnter} onChange={(value) => setDraft((current) => ({ ...current, unitPrice: value }))} /></td> : null}
                    {showCosts ? <td /> : null}
                    {showCosts && wide ? <td className="bg-[#e1e2e5]" /> : null}
                    {showCosts ? <td className="bg-[#e1e2e5]" /> : null}
                    {wide ? <td /> : null}
                    {wide ? <td /> : null}
                    <td />
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="text-[16px] font-semibold text-[var(--charcoal)]">
                    {showCosts ? (
                      <>
                        <td className="px-1 py-1" colSpan={beforePrice}>s/IVA {formatEUR(base)}</td>
                        <td className="px-1 py-1 text-right" colSpan={2}>Aprovado {formatEUR(base)}</td>
                        {wide ? <td className="bg-[#e1e2e5] px-1 py-1 text-right">{formatEUR(base)}</td> : null}
                        <td className="bg-[#e1e2e5] px-1 py-1 text-right">{formatEUR(pvp)}</td>
                        <td colSpan={wide ? 3 : 1} />
                      </>
                    ) : <td colSpan={totalCols} className="px-1 py-1 text-[14px] font-normal text-[var(--muted-text)]">{draftPending ? "Carrega Enter ou + para adicionar a linha escrita." : ""}</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex items-center gap-2 px-2 py-1 text-[var(--steel)]">
              <button
                type="button"
                data-testid="edit-line"
                title={lineEditMode ? "Concluir edição das linhas" : "Editar linhas"}
                aria-label={lineEditMode ? "Concluir edição das linhas" : "Editar linhas"}
                aria-pressed={lineEditMode}
                disabled={locked}
                onClick={() => (lineEditMode ? leaveLineEdit() : setLineEditMode(true))}
                className={`grid size-8 cursor-pointer place-items-center rounded text-[18px] disabled:cursor-not-allowed disabled:opacity-40 ${lineEditMode ? "bg-[var(--glow)] text-white" : "text-[var(--charcoal)] hover:bg-[var(--mist)] hover:text-[var(--glow)]"}`}
              >
                ✎
              </button>
              {lineEditMode ? (
                <button type="button" data-testid="concluir-linhas" onClick={leaveLineEdit} className="h-8 rounded border border-[var(--glow)] bg-white px-3 text-[16px] font-semibold text-[var(--glow)]">
                  Concluir
                </button>
              ) : null}
              <button type="button" data-testid="colunas" onClick={() => setWide((current) => !current)} className="h-8 rounded px-2 text-[15px] text-[var(--charcoal)] hover:bg-[var(--mist)] hover:text-[var(--glow)]">
                {wide ? "Colunas compactas" : "Todas as colunas"}
              </button>
            </div>
            {suggestField && matches.length && suggestBox
              ? createPortal(
                  <ul
                    role="listbox"
                    aria-label="Artigos em stock"
                    className="fixed z-50 max-h-64 overflow-auto rounded-lg border border-[var(--line)] bg-white py-1 text-xs shadow-lg"
                    style={{ top: suggestBox.top, left: suggestBox.left, width: suggestBox.width }}
                  >
                    {matches.map((article, index) => {
                      const margin = defaultMargin({ family: article.family, ref: article.ref });
                      return (
                        <li key={article.id} role="option" aria-selected={index === highlight}>
                          <button
                            type="button"
                            className={`flex w-full items-baseline justify-between gap-3 px-2 py-1.5 text-left ${index === highlight ? "bg-[var(--mist)] text-[var(--ink)]" : ""}`}
                            onMouseEnter={() => setHighlight(index)}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              chooseArticle(article);
                            }}
                          >
                            <span>
                              <span className="font-mono font-semibold">{article.ref}</span> {normalizeArticleDescription(article.description)}
                            </span>
                            <span className="shrink-0 text-[var(--muted-text)]">{article.family} · {margin}% · {formatEUR(salePrice(prefillUnitCost(article), margin))}</span>
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
        {error ? <p className="px-2 pt-2 text-[17px] text-red-700" role="alert">{error}</p> : null}
        <div className="no-print fixed bottom-0 left-0 z-30 flex h-12 w-full items-center gap-3 border-t border-[#eaeaf2] bg-white px-3 text-[16px] lg:left-[var(--rail)] lg:w-[calc(100%-var(--rail))]">
          <label className="flex items-center gap-2 text-[var(--steel)]">
            Atribuída a
            <select data-testid="atribuida-a" defaultValue="Balcão" className="h-9 rounded border border-[#e1e2e5] bg-[var(--paper)] px-2 text-[16px] text-[var(--charcoal)]">
              <option>Balcão</option>
              {technicians.map((user) => <option key={user.id}>{user.name}</option>)}
            </select>
          </label>
          <input type="range" disabled value={40} title="Indisponível nesta versão" className="h-1 w-40 cursor-not-allowed accent-[var(--glow)]" />
          <span className="text-[var(--charcoal)]">{statusLabel || "Aprovado"}</span>
          {billingNote ? <span data-testid="estado-faturacao" className="ml-auto truncate text-[var(--steel)]">{billingNote}</span> : null}
        </div>
      </div>
      <aside className="sticky top-2 flex max-h-[calc(100dvh-12rem)] flex-col gap-2 pb-1">
        <div className="shrink-0 rounded border border-[var(--glow)] bg-white p-2 text-[16px] text-[var(--charcoal)]">
          <label className="grid gap-1">
            Técnico
            <select data-testid="tecnico-obra" value={technicianOf(documentId || "")} disabled={locked || !documentId} onChange={(event) => { if (documentId) assignTechnician(documentId, event.target.value); }} className="h-10 rounded border border-[var(--line)] bg-white px-2">
              <option value="">Sem técnico</option>
              {technicians.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <p data-testid="tempo-trabalhado" className="mt-2 text-[22px] font-semibold">Tempo trabalhado: {formatClock(workedMs(documentId || "", clockNow))}</p>
        </div>
        <div className="min-h-[7rem] flex-1 overflow-y-auto rounded border border-[#eaeaf2] bg-white p-2 text-[16px] text-[var(--charcoal)]">
        <label className="block text-center">
          <span className="text-[14px] tracking-wide text-[var(--steel)] uppercase">Matrícula</span>
          <input
            aria-label="Matrícula"
            value={plate}
            disabled={locked}
            placeholder="AA-00-AA"
            onChange={(event) => onPlate(event.target.value.toUpperCase())}
            className="mt-0.5 h-10 w-full border-0 border-b-2 border-[var(--glow)] bg-transparent text-center font-mono text-[26px] font-bold tracking-wide uppercase outline-none"
          />
        </label>
        <div className="mt-1 flex gap-1">
          <button type="button" className="h-8 flex-1 text-[16px] text-[var(--glow)]" disabled={locked} onClick={onLookup}>Procurar</button>
          {onClearVehicle && !locked && (plate || brand || model || vin) ? (
            <button type="button" data-testid="limpar-viatura" title="Limpar viatura" aria-label="Limpar viatura" className="inline-flex h-8 items-center gap-1 rounded px-2 text-[15px] text-[var(--steel)] hover:bg-[var(--mist)]" onClick={onClearVehicle}>
              <X className="size-3.5" />
              Limpar
            </button>
          ) : null}
        </div>
        {clientVehicles && clientVehicles.length && onPickVehicle && !locked && !clientVehicles.some((item) => item.plate === plate) ? (
          <div data-testid="viaturas-cliente" className="mt-1 grid gap-1">
            <p className="text-[13px] text-[var(--steel)]">Viaturas deste cliente</p>
            <div className="flex flex-wrap gap-1">
              {clientVehicles.slice(0, 6).map((item) => (
                <button key={item.id} type="button" title={item.label} onClick={() => onPickVehicle(item.id)} className="rounded border border-[var(--glow)] bg-white px-2 py-0.5 font-mono text-[14px] text-[var(--glow)] hover:bg-[var(--mist)]">
                  {item.plate}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <CarSide color={carColor(plate || "x")} className="mx-auto h-12 w-36" />
        <p className="mb-1 text-center text-[16px] text-[var(--steel)]">{brand} {model}</p>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <Spec label="N.º chassi" value={vin} onChange={onVin} disabled={locked} wide />
          <Spec label="Cilindrada" value={version} onChange={onVersion} disabled={locked} />
          <Spec label="Potência" value={engine} onChange={onEngine} disabled={locked} />
          <Spec label="Combustível" value={fuel} onChange={onFuel} disabled={locked} />
          <Spec label="Código Motor" value={engineCode} onChange={onEngineCode} disabled={locked} />
          <Spec label="Óleo do motor" value={oil} onChange={onOil} disabled={locked} />
          <Spec label="Ano" value={year} onChange={onYear} disabled={locked} />
          <Spec label="Marca" value={brand} onChange={onBrand} disabled={locked} />
          <Spec label="Modelo" value={model} onChange={onModel} disabled={locked} />
          <Spec label="Kms entrada" value={km} onChange={onKm} disabled={locked} />
          <Spec label="Kms saída" value={kmOut} onChange={onKmOut} disabled={locked} />
          <Spec label="Próxima IPO" value={nextInspection} onChange={onNextInspection} disabled={locked} />
          <Spec label="Próxima revisão" value={nextService} onChange={onNextService} disabled={locked} />
        </div>
        <div className="mt-2 rounded border border-[#eaeaf2] bg-[var(--paper)] p-1.5">
          <p className="text-[14px] font-semibold tracking-wide text-[var(--steel)] uppercase">Histórico</p>
          <p className="mt-0.5">{dateIn || "—"} · {formatEUR(pvp)}</p>
        </div>
        </div>
        <div data-testid="acoes-obra" className="no-print grid max-h-[60%] min-h-0 w-full shrink-0 gap-1.5 overflow-y-auto rounded border border-[#eaeaf2] bg-white p-2">
          {isNew ? (
            <>
              <Button type="button" data-testid="gravar-obra" className="h-10 bg-[var(--glow)] text-[17px] hover:bg-[var(--glow-deep)]" disabled={locked || pending} onClick={() => withDraft((props) => props.onSave())}>
                Criar obra
              </Button>
              <p className="text-[14px] text-[var(--muted-text)]">O número só aparece quando gravares. Se saíres agora, não fica nenhuma obra vazia.</p>
            </>
          ) : (
            <p data-testid="guardado" className="text-right text-[16px] text-[var(--steel)]">
              {saveState === "error" ? "Não gravado" : saveState === "saving" ? "A guardar…" : saveState === "dirty" ? "Por guardar" : "Guardado"}
            </p>
          )}
          {allowQuote ? <Button type="button" data-testid="gerar-orcamento" variant="outline" className="h-10 border-[var(--glow)] bg-white text-[17px] text-[var(--glow)]" disabled={locked || pending} onClick={onQuote}>
            Gerar orçamento
          </Button> : null}
          {quoteNumber && quoteHref ? (
            <Link href={quoteHref} data-testid="abrir-orcamento" className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--glow)] bg-white text-[17px] font-medium text-[var(--glow)]">
              Abrir orçamento
            </Link>
          ) : null}
          <div className="grid grid-cols-3 gap-1">
            {([
              ["aguarda", "Aguarda aprovação", "border-[#f5a524] bg-[#f5a524] text-[var(--ink)]", "border-[#f5a524] bg-white text-[#8a5a00]"],
              ["aprovado", "Aprovado", "border-[#1f9d55] bg-[#1f9d55] text-white", "border-[#1f9d55] bg-white text-[#1f9d55]"],
              ["recusado", "Não aprovado", "border-[#d64545] bg-[#d64545] text-white", "border-[#d64545] bg-white text-[#d64545]"],
            ] as const).map(([value, label, filled, outlined]) => (
              <button
                key={value}
                type="button"
                data-testid={`approval-${value}`}
                aria-pressed={approval === value}
                disabled={locked || pending || !onApproval || !allowApprove}
                onClick={() => onApproval?.(value)}
                className={`min-h-10 rounded-lg border px-1 text-[14px] leading-tight font-semibold disabled:opacity-50 ${approval === value ? filled : outlined}`}
              >
                {label}
              </button>
            ))}
          </div>
          {allowClose ? <Button type="button" className="h-10 bg-[var(--glow)] text-[17px] hover:bg-[var(--glow-deep)]" disabled={locked || pending} onClick={() => withDraft((props) => props.onSave("concluida"))}>Fechar Processo</Button> : null}
          {canInvoice && allowInvoice ? <Button type="button" data-testid="faturar" className="h-10 bg-[var(--glow)] text-[17px] hover:bg-[var(--glow-deep)]" disabled={pending || Boolean(invoiceHint && !draftPending)} title={invoiceHint ?? undefined} onClick={() => withDraft((props) => props.onInvoice())}>Faturar</Button> : null}
          {canInvoice && allowInvoice && invoiceHint && !draftPending ? <p data-testid="faturar-dica" className="text-[14px] text-[var(--muted-text)]">{invoiceHint}</p> : null}
          {invoiceNumber ? (onOpenInvoice ? <button type="button" data-testid="imprimir-fatura" className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--glow)] text-[17px] font-semibold text-white" onClick={onOpenInvoice}>Imprimir fatura</button> : <Link href={`/ordens/${documentId}/fatura?imprimir=1`} data-testid="imprimir-fatura" className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--glow)] text-[17px] font-semibold text-white">Imprimir fatura</Link>) : null}
          {invoiceNumber && !paid ? <Button type="button" data-testid="registar-pagamento" className="h-10 bg-[#1f9d55] text-[17px] hover:bg-[#188a48]" disabled={pending} onClick={onMarkPaid}>Registar pagamento</Button> : null}
          {invoiceNumber && onOpenReceipt ? <button type="button" data-testid="imprimir-recibo" className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--charcoal)] text-[17px] font-semibold text-white" onClick={onOpenReceipt}>Imprimir recibo</button> : paid ? <Link href={`/ordens/${documentId}/recibo?imprimir=1`} data-testid="imprimir-recibo" className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--charcoal)] text-[17px] font-semibold text-white">Imprimir recibo</Link> : null}
          {invoiceNumber && onOpenInvoice ? (
            <button type="button" data-testid="abrir-fatura" className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--glow)] bg-white text-[17px] font-medium text-[var(--glow)]" onClick={onOpenInvoice}>Abrir fatura</button>
          ) : invoiceNumber && invoiceHref ? (
            /^https?:\/\//i.test(invoiceHref) ? (
              <a href={invoiceHref} target="_blank" rel="noopener noreferrer" data-testid="abrir-fatura" className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--glow)] bg-white text-[17px] font-medium text-[var(--glow)]">
                Abrir fatura
              </a>
            ) : (
              <Link href={invoiceHref} data-testid="abrir-fatura" className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--glow)] bg-white text-[17px] font-medium text-[var(--glow)]">
                Abrir fatura
              </Link>
            )
          ) : null}
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
            postalCode: client.postalCode ?? "",
            city: client.city ?? "",
            notes: client.notes ?? "",
          }}
          onClose={() => setClientOpen(false)}
          onSave={onSaveClient}
        />
      ) : null}
      {newClientOpen ? (
        <NewClientDialog
          initial={newClientSeed ?? undefined}
          clients={clients}
          onUseExisting={(id) => onClientRef.current(id)}
          onClose={() => { setNewClientOpen(false); setNewClientSeed(null); }}
          onSave={onCreateClient}
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
            const article = articles.find((item) => item.ref.toLocaleLowerCase("pt-PT") === input.ref.toLocaleLowerCase("pt-PT"))
              ?? articles.find((item) => item.id === stockLine.articleId);
            const family = article?.family || (isOilArticle({ ref: input.ref }) ? "Óleo" : "Produto");
            onLine(stockLine.key, { ref: input.ref, ...(article ? { articleId: article.id, kind: "peca" } : {}) });
            return onCommitStock({
              lineKey: stockLine.key,
              ref: input.ref,
              description: stockLine.description,
              family,
              margin: article?.marginPercent ?? defaultMargin({ family, ref: input.ref }),
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
      <p className="text-[17px] font-semibold leading-none">Sintomas/Requisitos do Cliente</p>
      {items.length ? (
        <ul className="mt-1 grid gap-0.5">
          {items.map((item) => (
            <li key={item.id} data-testid="symptom-item" className="flex items-center gap-1.5 text-[17px]">
              <input
                type="checkbox"
                checked={item.done}
                aria-label={`Concluído: ${item.text}`}
                onChange={() => commit(items.map((current) => (current.id === item.id ? { ...current, done: !current.done } : current)))}
                className="size-3.5 accent-[var(--glow)]"
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
                  className="h-8 min-w-0 flex-1 rounded border border-[var(--glow)] bg-white px-2 text-[17px] outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditingText(item.text);
                  }}
                  className={`min-w-0 flex-1 truncate text-left ${item.done ? "text-[var(--steel)] line-through" : "text-[var(--charcoal)]"}`}
                >
                  {item.text}
                </button>
              )}
              <button
                type="button"
                aria-label="Tirar sintoma"
                onClick={() => commit(items.filter((current) => current.id !== item.id))}
                className="inline-grid size-5 shrink-0 place-items-center rounded-full bg-[#6971f9] text-[12px] leading-none text-white"
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
        className="mt-1 h-9 w-full rounded border border-[#e1e2e5] bg-white px-2 text-[17px] text-[var(--charcoal)] outline-none placeholder:text-[var(--steel)]"
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
      <p className="text-[14px] tracking-wide text-[var(--muted-text)] uppercase">{label}</p>
      <div className="font-medium">{children}</div>
    </div>
  );
}

function MiniSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block h-8 rounded-md border border-[var(--line)] bg-white px-2 text-xs">
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
  testId,
  onFocus,
  onKeyDown,
  onChange,
}: {
  value: string;
  disabled: boolean;
  align?: "right";
  narrow?: boolean;
  label?: string;
  testId?: string;
  onFocus?: (element: HTMLInputElement) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      data-testid={testId}
      aria-label={label}
      aria-autocomplete={onKeyDown ? "list" : undefined}
      onFocus={(event) => onFocus?.(event.currentTarget)}
      onKeyDown={onKeyDown}
      onChange={(event) => {
        onChange(event.target.value);
        onFocus?.(event.currentTarget);
      }}
      className={`box-border h-8 w-full min-w-0 bg-transparent px-1 text-[16px] text-[var(--charcoal)] outline-none ${narrow ? "text-center" : ""} ${align === "right" ? "text-right" : ""}`}
    />
  );
}

function parseLooseDecimal(input: string) {
  const cleaned = input.replace("%", "").trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned || cleaned === "." || cleaned === "-" || cleaned === "-.") return null;
  const normalized = cleaned.endsWith(".") ? cleaned.slice(0, -1) : cleaned;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function NumberCell({
  value,
  disabled,
  label,
  testId,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  label: string;
  testId: string;
  onCommit: (value: number) => void;
}) {
  const formatted = precise(value);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      data-testid={testId}
      aria-label={label}
      value={draft ?? formatted}
      disabled={disabled}
      inputMode="decimal"
      onFocus={() => setDraft((current) => current ?? formatted)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const text = (draft ?? "").trim();
        const parsed = text === "" ? 0 : parseLooseDecimal(text);
        if (parsed !== null) onCommit(parsed);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="box-border h-8 w-full min-w-0 bg-transparent px-0 text-right text-[16px] outline-none"
    />
  );
}

function moneyInput(value: number) {
  // Keeps the precision typed (12,265 · 40,077465): unit prices are not rounded to cents.
  return precise(value);
}

function precise(value: number) {
  return roundPrice(value).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 6, useGrouping: false });
}

function lineBase(value: number) {
  return `${roundPrice(value).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €`;
}

function pt2(value: number) {
  return round2(value).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Spec({ label, value, onChange, disabled, wide }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; wide?: boolean }) {
  return (
    <label className={wide ? "col-span-2 block min-w-0" : "block min-w-0"}>
      <span className="block text-[13px] tracking-wide text-[var(--steel)] uppercase">{label}</span>
      <input aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-8 w-full border-0 border-b border-[#eaeaf2] bg-transparent px-0 text-[16px] outline-none disabled:text-[var(--charcoal)]" />
    </label>
  );
}


function VatSelect({ value, disabled, allowDefault, testId, onChange }: { value: string; disabled: boolean; allowDefault?: boolean; testId?: string; onChange: (value: string) => void }) {
  const current = (parseDecimal(value) ?? null) === null ? "" : String(parseDecimal(value));
  const options = current && !VAT_CHOICES.includes(current) ? [...VAT_CHOICES, current] : VAT_CHOICES;
  return (
    <select data-testid={testId} aria-label="IVA %" value={current} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-8 w-full min-w-0 bg-transparent text-right text-[16px] tabular-nums outline-none">
      {allowDefault ? <option value="">Auto</option> : null}
      {options.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
    </select>
  );
}

function WrapCell({ value, disabled, label, onChange }: { value: string; disabled: boolean; label?: string; onChange: (value: string) => void }) {
  return (
    <textarea
      value={value}
      disabled={disabled}
      aria-label={label}
      rows={1}
      onChange={(event) => onChange(event.target.value.replace(/\n/g, " "))}
      onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
      className="box-border block min-h-8 w-full min-w-0 resize-none overflow-hidden bg-transparent px-1 py-1 text-[16px] leading-snug break-words whitespace-pre-wrap text-[var(--charcoal)] outline-none [field-sizing:content]"
    />
  );
}
