"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CarSide, carColor } from "@/components/car-side";
import { useSetSheetSidebar } from "@/components/sheet-sidebar";
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
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 rounded-xl border border-[#d5ebed] bg-white">
        <div className="grid gap-2 border-b border-[#d5ebed] px-3 py-2 text-xs md:grid-cols-5">
          <HeaderField label="Folha de Obra">{number ?? "Nova"}</HeaderField>
          <HeaderField label="Dia de chegada">
            <Input type="date" value={dateIn} disabled={locked} onChange={(event) => onDateIn(event.target.value)} className="h-7 text-xs" />
          </HeaderField>
          <HeaderField label="Promessa de orçamento">
            <Input type="datetime-local" value={promiseQuote} disabled={locked} onChange={(event) => setPromiseQuote(event.target.value)} className="h-7 text-xs" />
          </HeaderField>
          <HeaderField label="Promessa de entrega">
            <Input type="datetime-local" value={promiseDelivery} disabled={locked} onChange={(event) => setPromiseDelivery(event.target.value)} className="h-7 text-xs" />
          </HeaderField>
          <HeaderField label="Utilizador">{userName}</HeaderField>
        </div>
        <div className="flex flex-wrap items-end gap-2 border-b border-[#d5ebed] px-3 py-2">
          <label className="min-w-48 flex-1 text-xs">
            Observações do cliente
            <Textarea value={problem} disabled={locked} onChange={(event) => onProblem(event.target.value)} className="mt-1 min-h-14 text-xs" />
          </label>
          <MiniSelect label="Chave de segurança" value={keyBox} onChange={setKeyBox} />
          <MiniSelect label="Livro de manutenção" value={book} onChange={setBook} />
          <MiniSelect label="Documentos" value={docs} onChange={setDocs} />
          <div className="ml-auto flex gap-2">
            {printHref ? <a href={printHref} className="inline-flex h-8 items-center rounded-lg border border-[#d5ebed] px-3 text-xs">Imprimir</a> : null}
            <Button type="button" variant="outline" className="h-8 text-xs" disabled={locked || pending} onClick={() => onSave()}>Editar</Button>
          </div>
        </div>
        <div className="flex gap-1 border-b border-[#d5ebed] px-2 pt-2">
          {TABS.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-t-md px-3 py-1.5 text-xs ${tab === item ? "bg-[#e7f7f8] font-semibold text-[#0b8f9c]" : "text-[#4d6d73]"}`}>
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
            <div className="flex flex-wrap gap-3 bg-[#f4fbfb] px-3 py-1.5 text-[11px] text-[#0b5f68]">
              <span>Custo {formatEUR(custo)}</span>
              <span>PVP {formatEUR(pvp)}</span>
              <span>Lucro {formatEUR(lucro)}</span>
              <span>MO {formatEUR(mo)}</span>
              <span>Produtos {formatEUR(produtos)}</span>
              <span>Desc. {formatEUR(desc)}</span>
              <span>IVA {formatEUR(iva)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-[11px]">
                <colgroup>
                  <col className="w-[4.5rem]" />
                  <col />
                  <col className="w-[5.5rem]" />
                  <col className="w-14" />
                  <col className="w-[4.5rem]" />
                  <col className="w-14" />
                  <col className="w-10" />
                  <col className="w-12" />
                  <col className="w-16" />
                  <col className="w-[4.75rem]" />
                  <col className="w-[4.75rem]" />
                  <col className="w-6" />
                  <col className="w-14" />
                  <col className="w-6" />
                </colgroup>
                <thead className="bg-[#e7f7f8] text-[#0b5f68]">
                  <tr>
                    {["Família", "Descrição", "Obs. internas", "Ref.", "Liq. s/ desc.", "Custo", "Qtd.", "Marg.", "PVP Base", "PVP Cliente s/IVA", "PVP Cliente c/IVA", "A", "Dif."].map((label) => (
                      <th key={label} className={`px-1 py-1 text-left font-semibold ${label === "Qtd." ? "w-10" : ""}`}>{label}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, index) => (
                    <tr key={row.line.key} className={index % 2 ? "bg-[#f7fcfc]" : "bg-white"}>
                      <td className="px-1 py-0.5">{row.family}</td>
                      <td className="px-1 py-0.5"><Cell value={row.line.description} disabled={locked} onChange={(value) => onLine(row.line.key, { description: value })} /></td>
                      <td className="px-1 py-0.5"><Cell value={row.line.note} disabled={locked} onChange={(value) => onLine(row.line.key, { note: value })} /></td>
                      <td className="px-1 py-0.5"><Cell value={row.line.ref} disabled={locked} onChange={(value) => onLine(row.line.key, { ref: value })} /></td>
                      <td className="bg-[#e7f7f8] px-1 py-0.5 text-right tabular-nums">{formatEUR(row.gross)}</td>
                      <td className="bg-[#e7f7f8] px-1 py-0.5"><Cell value={row.line.unitCost} disabled={locked} align="right" onChange={(value) => onLine(row.line.key, { unitCost: value })} /></td>
                      <td className="w-10 bg-[#ffe6cc] px-0.5 py-0.5"><Cell value={row.line.quantity} disabled={locked} align="right" narrow onChange={(value) => onLine(row.line.key, { quantity: value })} /></td>
                      <td className="px-1 py-0.5 text-right tabular-nums">{row.margin}%</td>
                      <td className="px-1 py-0.5"><Cell value={row.line.unitPrice} disabled={locked} align="right" onChange={(value) => onLine(row.line.key, { unitPrice: value })} /></td>
                      <td className="px-1 py-0.5 text-right tabular-nums">{formatEUR(row.amounts.base)}</td>
                      <td className="px-1 py-0.5 text-right font-medium text-[#0b8f9c] tabular-nums">{formatEUR(row.amounts.total)}</td>
                      <td className="px-1 py-0.5 text-center text-[#0b8f9c]">●</td>
                      <td className="bg-[#fde8ea] px-1 py-0.5 text-right text-[#9b3040] tabular-nums">{formatEUR(row.diff)}</td>
                      <td className="px-1"><button type="button" className="text-[#4d6d73]" disabled={locked} onClick={() => onRemove(row.line.key)} aria-label="Tirar linha">×</button></td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#d5ebed]">
                    <td className="px-1 py-1 text-[#4d6d73]">Novo</td>
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
                    <td className="bg-[#e7f7f8]" />
                    <td className="bg-[#e7f7f8]" />
                    <td className="w-10 bg-[#ffe6cc] px-0.5 py-1"><Cell value={draft.quantity} disabled={locked} align="right" narrow onChange={(value) => setDraft((current) => ({ ...current, quantity: value }))} /></td>
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
                  <tr className="border-t border-[#0b8f9c]/30 bg-[#e7f7f8] font-semibold text-[#0b5f68]">
                    <td className="px-1 py-1" colSpan={9}>s/IVA {formatEUR(base)}</td>
                    <td className="px-1 py-1">IVA {formatEUR(iva)}</td>
                    <td className="px-1 py-1 text-right">c/IVA {formatEUR(pvp)}</td>
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
        {error ? <p className="px-3 pt-2 text-sm text-red-700" role="alert">{error}</p> : null}
        <div className="flex flex-wrap gap-2 border-t border-[#d5ebed] p-3">
          <Button type="button" variant="outline" className="h-8 text-xs" disabled={locked || pending} onClick={() => onSave("aberta")}>Por Aprovar</Button>
          <Button type="button" variant="outline" className="h-8 text-xs" disabled={locked || pending} onClick={() => onSave("em_curso")}>Aprovado</Button>
          <Button type="button" className="h-8 text-xs" disabled={locked || pending} onClick={() => onSave("concluida")}>Fechar Processo</Button>
          {canInvoice ? <Button type="button" className="h-8 text-xs" disabled={pending} onClick={onInvoice}>Faturar</Button> : null}
        </div>
      </div>
      <aside className="rounded-xl border border-[#d5ebed] bg-white p-3 text-xs">
        <label className="block text-center">
          <span className="text-[10px] tracking-wide text-[#4d6d73] uppercase">Matrícula</span>
          <input
            aria-label="Matrícula"
            value={plate}
            disabled={locked}
            placeholder="AA-00-AA"
            onChange={(event) => onPlate(event.target.value.toUpperCase())}
            className="mt-1 h-10 w-full rounded-lg border border-[#0b8f9c] bg-white text-center font-mono text-lg font-semibold tracking-wide uppercase"
          />
        </label>
        <Button type="button" variant="secondary" className="mt-2 h-8 w-full text-xs" disabled={locked} onClick={onLookup}>Procurar</Button>
        <CarSide color={carColor(plate || "x")} />
        <p className="mb-2 text-center text-[#4d6d73]">{brand} {model}</p>
        <Field label="N.º de chassi" value={vin} onChange={onVin} disabled={locked} />
        <Field label="Tipo de viatura" value={version || model} onChange={onVersion} disabled={locked} />
        <Field label="Ano de construção" value={year} onChange={onYear} disabled={locked} />
        <Field label="Primeiro registo" value={year ? `01/${year}` : ""} onChange={() => undefined} disabled />
        <Field label="Cilindrada" value={version} onChange={onVersion} disabled={locked} />
        <Field label="Potência" value={engine} onChange={onEngine} disabled={locked} />
        <Field label="Combustível" value={fuel} onChange={onFuel} disabled={locked} />
        <Field label="Código do motor" value={engine} onChange={onEngine} disabled={locked} />
        <Field label="Código de cor" value={brand.slice(0, 3).toUpperCase()} onChange={() => undefined} disabled />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Kms entrada" value={km} onChange={onKm} disabled={locked} />
          <Field label="Kms saída" value={kmOut} onChange={setKmOut} disabled={locked} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="Próxima IPO" value="" onChange={() => undefined} disabled={locked} />
          <Field label="Próxima revisão" value="" onChange={() => undefined} disabled={locked} />
        </div>
        <div className="mt-3 rounded-lg bg-[#f4fbfb] p-2">
          <p className="font-semibold text-[#0b8f9c]">Histórico</p>
          <p className="mt-1 text-[#4d6d73]">{dateIn || "—"} · {formatEUR(pvp)}</p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label="Marca" value={brand} onChange={onBrand} disabled={locked} />
          <Field label="Modelo" value={model} onChange={onModel} disabled={locked} />
        </div>
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

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label className="mt-1 block">
      <span className="text-[10px] tracking-wide text-[#4d6d73] uppercase">{label}</span>
      <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-7 w-full rounded border border-[#d5ebed] px-1.5" />
    </label>
  );
}
