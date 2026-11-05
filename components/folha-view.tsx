"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CarSide, carColor } from "@/components/car-side";
import { useSetSheetHeader, useSetSheetSidebar } from "@/components/sheet-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { defaultMargin, includesSearch, lineAmounts, normalizeArticleDescription, parseDecimal, round2, salePrice } from "@/lib/domain";
import { formatEUR } from "@/lib/format";
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
};

const TABS = ["Folha de obra", "Consumíveis", "Checklist de Verificação", "Notas"] as const;

export function FolhaView({
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
}: {
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
  onClientRef.current = onClient;
  useEffect(() => {
    setSidebar(
      <div className="grid gap-2 text-xs">
        <p className="text-[10px] tracking-wide text-white/70 uppercase">Contacto cliente</p>
        <select
          aria-label="Cliente"
          value={clientId}
          disabled={locked}
          onChange={(event) => onClientRef.current(event.target.value)}
          className="h-8 rounded bg-white px-1 text-xs text-[#14343a]"
        >
          <option value="">Escolher cliente…</option>
          {clients.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <p className="text-sm font-semibold">{client?.name || "Sem cliente"}</p>
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
  headerActions.current = { onDateIn, setPromiseQuote, setPromiseDelivery };
  useEffect(() => {
    setHeader(
      <div className="grid items-end gap-2 px-3 py-1.5 text-[11px] text-[#22272a] md:grid-cols-[1.1fr_1fr_1.2fr_1.2fr_auto]">
        <div>
          <p className="text-[10px] tracking-wide text-[#8d939c] uppercase">Folha de Obra</p>
          <p className="text-[13px] leading-tight font-semibold">{number ?? "Nova"}</p>
        </div>
        <label className="block">
          <span className="text-[10px] tracking-wide text-[#8d939c] uppercase">Dia de chegada</span>
          <input type="date" value={dateIn} disabled={locked} onChange={(event) => headerActions.current.onDateIn(event.target.value)} className="mt-0.5 h-7 w-full rounded border border-[#e1e2e5] px-1 text-[12px]" />
        </label>
        <label className="block">
          <span className="text-[10px] tracking-wide text-[#8d939c] uppercase">Promessa de orçamento</span>
          <input value={promiseQuote} disabled={locked} placeholder="00/00/0000 00:00" onChange={(event) => headerActions.current.setPromiseQuote(event.target.value)} className="mt-0.5 h-7 w-full rounded border border-[#e1e2e5] px-1 text-[12px]" />
        </label>
        <label className="block">
          <span className="text-[10px] tracking-wide text-[#8d939c] uppercase">Promessa de entrega</span>
          <input value={promiseDelivery} disabled={locked} placeholder="00/00/0000 00:00" onChange={(event) => headerActions.current.setPromiseDelivery(event.target.value)} className="mt-0.5 h-7 w-full rounded border border-[#e1e2e5] px-1 text-[12px]" />
        </label>
        <div className="pb-1 text-right text-[12px] font-semibold">{userName}</div>
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
    return { line, quantity, unitPrice, unitCost, amounts, family, margin, diff: round2(amounts.base - unitCost * quantity), gross: round2(quantity * unitPrice) };
  });
  const visible = tab === "Consumíveis"
    ? computed.filter((row) => ["Óleo", "Filtros", "Eco Taxa"].includes(row.family))
    : computed;
  const custo = round2(computed.reduce((sum, row) => sum + row.unitCost * row.quantity, 0));
  const pvp = round2(computed.reduce((sum, row) => sum + row.amounts.total, 0));
  const lucro = round2(computed.reduce((sum, row) => sum + row.amounts.margin, 0));
  const mo = round2(computed.filter((row) => row.line.kind === "mao_de_obra").reduce((sum, row) => sum + row.amounts.base, 0));
  const produtos = round2(computed.filter((row) => row.line.kind === "peca").reduce((sum, row) => sum + row.amounts.base, 0));
  const desc = round2(computed.reduce((sum, row) => sum + (row.gross - row.amounts.base), 0));
  const iva = round2(computed.reduce((sum, row) => sum + row.amounts.vat, 0));
  const base = round2(computed.reduce((sum, row) => sum + row.amounts.base, 0));

  return (
    <div className="grid items-start gap-2 pb-12 xl:grid-cols-[minmax(0,1fr)_248px]">
      <div className="min-w-0 bg-white text-[#22272a]">
        <div className="px-2 pt-2">
          <p className="text-[13px] font-semibold">Sintomas/Requisitos do Cliente</p>
          <input disabled placeholder="Adicionar sintoma/requisito do cliente" title="Indisponível nesta versão" className="mt-1 h-8 w-full cursor-not-allowed rounded border border-[#e1e2e5] bg-[#f7f8fa] px-2 text-[12px] text-[#8d939c]" />
        </div>
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
              <table className="w-full min-w-[980px] border-collapse text-[12px] text-[#22272a] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_td:nth-child(3)]:min-w-[240px] [&_td:nth-child(3)]:whitespace-normal">
                <thead className="text-[11px] text-[#22272a]">
                  <tr>
                    <th className="bg-[#e1e2e5] px-1 py-1" />
                    {["Família", "Descrição", "Obs. internas", "Ref.", "Custo", "Qtd.", "Marg.", "PVP Base s/IVA", "Desc. %"].map((label) => (
                      <th key={label} className="bg-[#e1e2e5] px-1 py-1 text-left font-semibold">{label}</th>
                    ))}
                    {["PVP Cliente s/IVA", "PVP Cliente c/IVA"].map((label) => (
                      <th key={label} className="bg-[#b3b8c1] px-1 py-1 text-left font-semibold">{label}</th>
                    ))}
                    <th className="bg-[#e1e2e5] px-1 py-1 text-left font-semibold">A</th>
                    <th className="bg-[#e1e2e5]" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.line.key} className={row.line.kind === "peca" ? "bg-[#f5f6fa]" : "bg-white"}>
                      <td className="border-b border-[#eaeaf2] px-1 text-center">
                        <span className="inline-grid size-4 place-items-center rounded-full bg-[#6971f9] text-[9px] leading-none text-white">×</span>
                      </td>
                      <td className="border-b border-[#eaeaf2] px-1 py-0.5">{row.family}</td>
                      <td className="border-b border-[#eaeaf2] px-1 py-0.5"><Cell value={row.line.description} disabled={locked} onChange={(value) => onLine(row.line.key, { description: value })} /></td>
                      <td className="border-b border-[#eaeaf2] px-1 py-0.5"><Cell value={row.line.note} disabled={locked} onChange={(value) => onLine(row.line.key, { note: value })} /></td>
                      <td className="border-b border-[#eaeaf2] px-1 py-0.5"><Cell value={row.line.ref} disabled={locked} onChange={(value) => onLine(row.line.key, { ref: value })} /></td>
                      <td className="border-b border-[#eaeaf2] bg-[#f7f8fb] px-1 py-0.5"><Cell value={row.line.unitCost} disabled={locked} align="right" onChange={(value) => onLine(row.line.key, { unitCost: value })} /></td>
                      <td className="w-10 border-b border-[#eaeaf2] bg-[#f3ebc7] px-0.5 py-0.5"><Cell value={row.line.quantity} disabled={locked} align="right" narrow onChange={(value) => onLine(row.line.key, { quantity: value })} /></td>
                      <td className="border-b border-[#eaeaf2] px-1 py-0.5 text-right tabular-nums">{row.margin}%</td>
                      <td className="border-b border-[#eaeaf2] px-1 py-0.5"><Cell value={row.line.unitPrice} disabled={locked} align="right" onChange={(value) => onLine(row.line.key, { unitPrice: value })} /></td>
                      <td className="border-b border-[#eaeaf2] px-1 py-0.5"><Cell value={row.line.discount} disabled={locked} align="right" narrow onChange={(value) => onLine(row.line.key, { discount: value })} /></td>
                      <td className="border-b border-[#eaeaf2] bg-[#e1e2e5] px-1 py-0.5 text-right tabular-nums">{formatEUR(row.amounts.base)}</td>
                      <td className="border-b border-[#eaeaf2] bg-[#e1e2e5] px-1 py-0.5 text-right tabular-nums">{formatEUR(row.amounts.total)}</td>
                      <td className="border-b border-[#eaeaf2] px-1 text-center"><span className="inline-grid size-4 place-items-center rounded-full bg-[#6971f9] text-[9px] text-white">●</span></td>
                      <td className="border-b border-[#eaeaf2] px-1"><button type="button" className="text-[#8d939c]" disabled={locked} onClick={() => onRemove(row.line.key)} aria-label="Tirar linha">×</button></td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#eaeaf2]">
                    <td className="px-1 text-center"><span className="inline-grid size-4 place-items-center rounded-full bg-[#f5a623] text-[12px] leading-none text-white">+</span></td>
                    <td className="px-1 py-1 text-[11px] text-[#8d939c]">Novo</td>
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
                    <td className="bg-[#f7f8fb]" />
                    <td className="w-10 bg-[#f3ebc7] px-0.5 py-1"><Cell value={draft.quantity} disabled={locked} align="right" narrow onChange={(value) => setDraft((current) => ({ ...current, quantity: value }))} /></td>
                    <td />
                    <td className="px-1 py-1"><Cell value={draft.unitPrice} disabled={locked} align="right" onChange={(value) => setDraft((current) => ({ ...current, unitPrice: value }))} /></td>
                    <td colSpan={4} className="px-1 text-right">
                      <button
                        type="button"
                        className="text-[#0b8f9c]"
                        disabled={locked || !draft.description.trim()}
                        onClick={addFreeLine}
                      >
                        Adicionar linha
                      </button>
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="text-[11px] font-semibold text-[#22272a]">
                    <td className="px-1 py-1" colSpan={9}>s/IVA {formatEUR(base)}</td>
                    <td className="bg-[#e1e2e5] px-1 py-1">IVA {formatEUR(iva)}</td>
                    <td className="bg-[#e1e2e5] px-1 py-1 text-right">c/IVA {formatEUR(pvp)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
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
        <div className="fixed bottom-0 left-0 z-30 flex h-9 w-full items-center justify-between border-t border-[#eaeaf2] bg-white px-3 text-[12px] lg:left-[210px] lg:w-[calc(100%-210px)]">
          <label className="flex items-center gap-2 text-[#8d939c]">
            Atribuída a
            <select disabled title="Indisponível nesta versão" className="h-6 cursor-not-allowed rounded border border-[#e1e2e5] bg-[#f7f8fa] px-1 text-[#22272a]">
              <option>Balcão</option>
            </select>
          </label>
          <span className="text-[#8d939c]">Estados do serviço · {userName}</span>
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
          <Spec label="Tipo" value={version || model} onChange={onVersion} disabled={locked} />
          <Spec label="Ano" value={year} onChange={onYear} disabled={locked} />
          <Spec label="1.º registo" value={year ? `01/${year}` : ""} onChange={() => undefined} disabled />
          <Spec label="Cilindrada" value={version} onChange={onVersion} disabled={locked} />
          <Spec label="Potência" value={engine} onChange={onEngine} disabled={locked} />
          <Spec label="Combustível" value={fuel} onChange={onFuel} disabled={locked} />
          <Spec label="Cód. motor" value={engine} onChange={onEngine} disabled={locked} />
          <Spec label="Cód. cor" value={brand.slice(0, 3).toUpperCase()} onChange={() => undefined} disabled />
          <Spec label="Marca" value={brand} onChange={onBrand} disabled={locked} />
          <Spec label="Modelo" value={model} onChange={onModel} disabled={locked} />
          <Spec label="Kms entrada" value={km} onChange={onKm} disabled={locked} />
          <Spec label="Kms saída" value={kmOut} onChange={setKmOut} disabled={locked} />
          <Spec label="Próxima IPO" value="" onChange={() => undefined} disabled />
          <Spec label="Próx. revisão" value="" onChange={() => undefined} disabled />
        </div>
        <div className="mt-2 rounded border border-[#eaeaf2] bg-[#f7f8fa] p-1.5">
          <p className="text-[10px] font-semibold tracking-wide text-[#8d939c] uppercase">Histórico</p>
          <p className="mt-0.5">{dateIn || "—"} · {formatEUR(pvp)}</p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1">
          <Button type="button" variant="outline" className="h-8 border-[#00a9fd] text-[12px] text-[#00a9fd]" disabled={locked || pending} onClick={() => onSave("aberta")}>Por Aprovar</Button>
          <Button type="button" className="h-8 bg-[#00a9fd] text-[12px] hover:bg-[#0096e0]" disabled={locked || pending} onClick={() => onSave("em_curso")}>Aprovado</Button>
        </div>
        <Button type="button" className="mt-1 h-8 w-full bg-[#00a9fd] text-[12px] hover:bg-[#0096e0]" disabled={locked || pending} onClick={() => onSave("concluida")}>Fechar Processo</Button>
        {canInvoice ? <Button type="button" className="mt-1 h-8 w-full bg-[#00a9fd] text-[12px] hover:bg-[#0096e0]" disabled={pending} onClick={onInvoice}>Faturar</Button> : null}
      </aside>
    </div>
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
      className={`h-6 bg-transparent px-0.5 outline-none ${narrow ? "w-10 text-center" : "w-full px-1"} ${align === "right" ? "text-right" : ""}`}
    />
  );
}

function moneyInput(value: number) {
  return String(round2(value)).replace(".", ",");
}

function Spec({ label, value, onChange, disabled, wide }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; wide?: boolean }) {
  return (
    <label className={wide ? "col-span-2 block min-w-0" : "block min-w-0"}>
      <span className="block text-[9px] tracking-wide text-[#8d939c] uppercase">{label}</span>
      <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-5 w-full border-0 border-b border-[#eaeaf2] bg-transparent px-0 text-[11px] outline-none disabled:text-[#22272a]" />
    </label>
  );
}
