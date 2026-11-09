"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { toast } from "sonner";
import { savePurchases } from "@/app/actions/purchases";
import { saveSupplier } from "@/app/actions/records";
import { Field, Select } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ECOLUB_REF,
  ECOLUB_UNIT_COST,
  ecolubAmount,
  includesSearch,
  inheritedPurchaseHeader,
  isOilArticle,
  normalizeRef,
  parseDecimal,
  salePrice,
  sumTotals,
} from "@/lib/domain";
import { formatEUR, formatQty } from "@/lib/format";
import { readEcolubRate, subscribeEcolubRate } from "@/lib/ecolub-settings";
import { DOCUMENT_TYPES, FAMILIES, PAYMENT_METHODS } from "@/lib/labels";
import { ecolubDefaults, purchaseTypeMovesStock, purchaseTypes } from "@/src/config";

export type GridArticle = {
  id: string;
  ref: string;
  description: string;
  family: string;
  costPrice: number;
  marginPercent: number;
  vatRate: number;
  stockQty: number;
  isOil: boolean;
};

export type GridSupplier = { id: string; name: string };

type Line = {
  key: string;
  date: string;
  supplierId: string;
  documentType: string;
  invoiceNumber: string;
  paymentMethod: string;
  ref: string;
  description: string;
  quantity: string;
  cost: string;
  vat: string;
  margin: string;
  family: string;
  tipologia: string;
  articleId: string | null;
  isNew: boolean;
  isOil: boolean;
};

function num(value: number) {
  return String(value).replace(".", ",");
}

function blankLine(today: string, previous?: Line): Line {
  const header = inheritedPurchaseHeader(today, previous);
  return {
    key: crypto.randomUUID(),
    ...header,
    ref: "",
    description: "",
    quantity: "",
    cost: "",
    vat: "23",
    margin: "40",
    family: "Produto",
    tipologia: "produto",
    articleId: null,
    isNew: false,
    isOil: false,
  };
}

export function PurchaseGrid({
  today,
  articles,
  suppliers,
}: {
  today: string;
  articles: GridArticle[];
  suppliers: GridSupplier[];
}) {
  const router = useRouter();
  const [supplierList, setSupplierList] = useState(suppliers);
  const [lines, setLines] = useState<Line[]>(() => [blankLine(today)]);
  const catalog = articles;
  const [activeRef, setActiveRef] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [offer, setOffer] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [createIndex, setCreateIndex] = useState<number | null>(null);
  const [createFamily, setCreateFamily] = useState("Produto");
  const saveRef = useRef<() => void>(() => {});
  const ecolubRate = useSyncExternalStore(subscribeEcolubRate, readEcolubRate, () => ecolubDefaults.rate);

  const activeLine = activeRef === null ? null : lines[activeRef];
  const suggestions = useMemo(() => {
    if (!activeLine) return [];
    const query = activeLine.ref.trim();
    return catalog
      .filter((article) => !query || includesSearch(`${article.ref} ${article.description}`, query))
      .slice(0, 8);
  }, [activeLine, catalog]);
  const typedRef = normalizeRef(activeLine?.ref ?? "");
  const exact = catalog.some((article) => article.ref === typedRef);
  const showCreate = Boolean(typedRef.length >= 2 && !exact);

  const totals = sumTotals(
    lines.map((line) => ({
      quantity: parseDecimal(line.quantity) ?? 0,
      unitPrice: parseDecimal(line.cost) ?? 0,
      unitCost: 0,
      vatRate: parseDecimal(line.vat) ?? 0,
    })),
  );

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "Enter")) {
        event.preventDefault();
        saveRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function patch(index: number, partial: Partial<Line>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...partial } : line)));
  }

  function addLine(after?: number) {
    setLines((current) => {
      const index = after ?? Math.max(current.length - 1, 0);
      const next = blankLine(today, current[index]);
      const copy = [...current];
      copy.splice(index + 1, 0, next);
      return copy;
    });
    setActiveRef(null);
    focusCell((after ?? Math.max(lines.length - 1, 0)) + 1, "ref");
  }

  function removeLine(index: number) {
    setLines((current) => {
      const next = current.filter((_, lineIndex) => lineIndex !== index);
      return next.length ? next : [blankLine(today)];
    });
    if (offer === index) setOffer(null);
  }

  useEffect(() => {
    setLines((current) => {
      const litres = current.reduce((sum, line) => {
        if (line.ref.toUpperCase() === ECOLUB_REF) return sum;
        if (line.tipologia !== "oleo" && !line.isOil) return sum;
        return sum + (parseDecimal(line.quantity) ?? 0);
      }, 0);
      const source = [...current].reverse().find((line) => line.ref.toUpperCase() !== ECOLUB_REF && (line.tipologia === "oleo" || line.isOil));
      const known = catalog.find((article) => article.ref === ECOLUB_REF);
      const header = inheritedPurchaseHeader(today, source);
      const eco: Line = {
        key: current.find((line) => line.ref.toUpperCase() === ECOLUB_REF)?.key ?? crypto.randomUUID(),
        ...header,
        ref: ECOLUB_REF,
        description: known?.description ?? ecolubDefaults.description,
        quantity: num(litres),
        cost: num(ecolubRate),
        vat: "23",
        margin: "0",
        family: "Eco Taxa",
        tipologia: "oleo",
        articleId: known?.id ?? null,
        isNew: !known,
        isOil: false,
      };
      const rest = current.filter((line) => line.ref.toUpperCase() !== ECOLUB_REF);
      if (litres <= 0) return rest.length === current.length ? current : rest;
      const existing = current.find((line) => line.ref.toUpperCase() === ECOLUB_REF);
      const same = existing
        && existing.quantity === eco.quantity
        && existing.cost === eco.cost
        && existing.margin === "0"
        && rest.length + 1 === current.length;
      if (same) return current;
      const anchor = rest.findIndex((line) => line.key === source?.key);
      const next = [...rest];
      next.splice(anchor >= 0 ? anchor + 1 : next.length, 0, eco);
      return next;
    });
  }, [lines, ecolubRate, catalog, today]);

  function focusCell(row: number, col: string) {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`)?.focus();
    });
  }

  function move(row: number, col: string) {
    const order = ["date", "supplierId", "documentType", "invoiceNumber", "paymentMethod", "ref", "description", "quantity", "cost", "vat", "margin", "tipologia"];
    const colIndex = order.indexOf(col);
    if (col === "tipologia") {
      addLine(row);
      return;
    }
    focusCell(row, order[colIndex + 1] ?? "ref");
  }

  function applyArticle(index: number, article: GridArticle) {
    const oil = article.isOil || isOilArticle(article);
    patch(index, {
      ref: article.ref,
      description: article.description,
      cost: num(article.costPrice),
      vat: num(article.vatRate),
      margin: num(article.marginPercent),
      family: article.family,
      tipologia: oil ? "oleo" : "produto",
      articleId: article.id,
      isNew: false,
      isOil: oil,
    });
    setActiveRef(null);
    setOffer(oil ? index : offer === index ? null : offer);
    focusCell(index, "quantity");
  }

  function addEcolub(index: number) {
    const source = lines[index];
    if (!source) return;
    const litres = parseDecimal(source.quantity);
    if (litres === null || litres <= 0) {
      setError("Indique os litros na linha de óleo antes de lançar a ECOLUB.");
      return;
    }
    const known = catalog.find((article) => article.ref === ECOLUB_REF);
    const header = inheritedPurchaseHeader(today, source);
    const ecolub: Line = {
      key: crypto.randomUUID(),
      ...header,
      ref: ECOLUB_REF,
      description: known?.description ?? "ECO TAXA LUBRIFICANTES",
      quantity: num(litres),
      cost: num(ECOLUB_UNIT_COST),
      vat: "23",
      margin: "0",
      family: "Eco Taxa",
      tipologia: "oleo",
      articleId: known?.id ?? null,
      isNew: !known,
      isOil: false,
    };
    setLines((current) => [...current.slice(0, index + 1), ecolub, ...current.slice(index + 1)]);
    setOffer(null);
    setError(null);
    toast.success(`Linha ECOLUB de ${formatEUR(ecolubAmount(litres))} adicionada.`);
  }

  function save() {
    const payload: Array<{
      date: string;
      supplierId: string;
      documentType: string;
      invoiceNumber: string;
      paymentMethod: string;
      ref: string;
      description: string;
      quantity: number;
      cost: number;
      vat: number;
      margin: number;
      family: string;
      tipologia: string;
    }> = [];
    for (const line of lines) {
      const empty = !line.ref.trim() && !line.description.trim() && !line.quantity.trim();
      if (empty) continue;
      const quantity = parseDecimal(line.quantity);
      const cost = parseDecimal(line.cost);
      const vat = parseDecimal(line.vat);
      const margin = parseDecimal(line.margin) ?? 0;
      if (quantity === null || cost === null || vat === null) {
        setError("Há linhas com quantidade, custo ou IVA inválidos.");
        return;
      }
      if (!purchaseTypeMovesStock(line.tipologia) && line.description.trim().length < 2) {
        setError("Indique a descrição da despesa.");
        return;
      }
      payload.push({
        date: line.date,
        supplierId: line.supplierId,
        documentType: line.documentType,
        invoiceNumber: line.invoiceNumber.trim(),
        paymentMethod: line.paymentMethod,
        ref: line.ref,
        description: line.description || line.ref,
        quantity,
        cost,
        vat,
        margin,
        family: line.family,
        tipologia: line.tipologia,
      });
    }
    if (payload.length === 0) {
      setError("Adicione pelo menos uma linha completa.");
      return;
    }
    startTransition(async () => {
      const result = await savePurchases(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setLines([blankLine(today)]);
      setOffer(null);
      toast.success(`Compra lançada. Stock e custo atualizados em ${result.articles} artigo(s).`);
      router.refresh();
    });
  }

  useEffect(() => {
    saveRef.current = save;
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Enter avança o campo. Enter na tipologia, ou + Linha, acrescenta outra linha. Só Produto e Óleo mexem no stock. A taxa ECOLUB acompanha os litros de óleo.
        </p>
        <Button type="button" variant="outline" className="h-10" onClick={() => setSupplierOpen(true)}>
          Novo fornecedor
        </Button>
      </div>

      {lines.map((line, index) => {
        const pvp = salePrice(parseDecimal(line.cost) ?? 0, parseDecimal(line.margin) ?? 0);
        const open = activeRef === index;
        const litres = parseDecimal(line.quantity);
        return (
          <div key={line.key} className={`rounded-xl bg-card p-3 ring-1 ring-foreground/10 ${open ? "relative z-30" : ""}`}>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              <Field label="Data">
                <Input data-cell={`${index}:date`} type="date" value={line.date} className="h-10 bg-background" onKeyDown={(event) => onEnter(event, index, "date")} onChange={(event) => patch(index, { date: event.target.value })} />
              </Field>
              <Field label="Fornecedor">
                <Select data-cell={`${index}:supplierId`} value={line.supplierId} onKeyDown={(event) => onEnter(event, index, "supplierId")} onChange={(event) => patch(index, { supplierId: event.target.value })}>
                  <option value="">Escolher…</option>
                  {supplierList.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Documento">
                <Select data-cell={`${index}:documentType`} value={line.documentType} onKeyDown={(event) => onEnter(event, index, "documentType")} onChange={(event) => patch(index, { documentType: event.target.value })}>
                  {DOCUMENT_TYPES.map((type) => <option key={type}>{type}</option>)}
                </Select>
              </Field>
              <Field label="N.º do documento">
                <Input data-cell={`${index}:invoiceNumber`} value={line.invoiceNumber} className="h-10 bg-background" onKeyDown={(event) => onEnter(event, index, "invoiceNumber")} onChange={(event) => patch(index, { invoiceNumber: event.target.value })} />
              </Field>
              <Field label="Pagamento">
                <Select data-cell={`${index}:paymentMethod`} value={line.paymentMethod} onKeyDown={(event) => onEnter(event, index, "paymentMethod")} onChange={(event) => patch(index, { paymentMethod: event.target.value })}>
                  {PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-6 xl:grid-cols-12">
              <Field label="REF" className="relative md:col-span-2 xl:col-span-2">
                <Input
                  data-cell={`${index}:ref`}
                  value={line.ref}
                  className="h-10 bg-background font-mono uppercase"
                  autoComplete="off"
                  onFocus={() => { setActiveRef(index); setHighlight(0); }}
                  onKeyDown={(event) => onRefKey(event, index)}
                  onChange={(event) => {
                    patch(index, { ref: event.target.value.toUpperCase(), articleId: null, isNew: false });
                    setActiveRef(index);
                    setHighlight(0);
                  }}
                />
                {open ? (
                  <ul className="absolute z-50 mt-1 max-h-64 w-80 overflow-auto rounded-lg border bg-popover p-1 shadow-lg">
                    {suggestions.map((article, suggestionIndex) => (
                      <li key={article.id}>
                        <button
                          type="button"
                          className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm ${highlight === suggestionIndex ? "bg-muted" : ""}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applyArticle(index, article);
                          }}
                        >
                          <span className="font-mono">{article.ref}</span>
                          <span className="text-muted-foreground">{article.description} · stock {formatQty(article.stockQty)}</span>
                        </button>
                      </li>
                    ))}
                    {showCreate ? (
                      <li>
                        <button
                          type="button"
                          className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${highlight === suggestions.length ? "bg-muted" : ""}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setCreateIndex(index);
                            setCreateFamily(isOilArticle({ ref: typedRef }) ? "Óleo" : "Produto");
                            setActiveRef(null);
                          }}
                        >
                          Criar artigo {typedRef}
                        </button>
                      </li>
                    ) : null}
                    {suggestions.length === 0 && !showCreate ? <li className="px-2 py-1.5 text-sm text-muted-foreground">Sem resultados.</li> : null}
                  </ul>
                ) : null}
              </Field>
              <Field label="Descrição" className="md:col-span-4 xl:col-span-4">
                <Input data-cell={`${index}:description`} value={line.description} className="h-10 bg-background uppercase" onKeyDown={(event) => onEnter(event, index, "description")} onChange={(event) => patch(index, { description: event.target.value })} />
              </Field>
              <Field label="Qtd" className="xl:col-span-1">
                <Input data-cell={`${index}:quantity`} value={line.quantity} inputMode="decimal" className="h-10 bg-background" onKeyDown={(event) => onEnter(event, index, "quantity")} onChange={(event) => patch(index, { quantity: event.target.value })} />
              </Field>
              <Field label="Custo" className="xl:col-span-1">
                <Input data-cell={`${index}:cost`} value={line.cost} inputMode="decimal" className="h-10 bg-background" onKeyDown={(event) => onEnter(event, index, "cost")} onChange={(event) => patch(index, { cost: event.target.value })} />
              </Field>
              <Field label="IVA" className="xl:col-span-1">
                <Input data-cell={`${index}:vat`} value={line.vat} inputMode="decimal" className="h-10 bg-background" onKeyDown={(event) => onEnter(event, index, "vat")} onChange={(event) => patch(index, { vat: event.target.value })} />
              </Field>
              <Field label="Margem %" className="xl:col-span-1">
                <Input data-cell={`${index}:margin`} value={line.margin} inputMode="decimal" className="h-10 bg-background" onKeyDown={(event) => onEnter(event, index, "margin")} onChange={(event) => patch(index, { margin: event.target.value })} />
              </Field>
              <Field label="Tipologia" className="xl:col-span-2">
                <Select
                  data-cell={`${index}:tipologia`}
                  data-testid={`tipologia-${index}`}
                  value={line.tipologia}
                  disabled={line.ref.toUpperCase() === ECOLUB_REF}
                  onKeyDown={(event) => onEnter(event, index, "tipologia")}
                  onChange={(event) => {
                    const tipologia = event.target.value;
                    patch(index, {
                      tipologia,
                      isOil: tipologia === "oleo",
                      margin: tipologia === "oleo" ? "30" : tipologia === "produto" ? "40" : line.margin,
                      family: tipologia === "oleo" ? "Óleo" : line.family,
                    });
                  }}
                >
                  {purchaseTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                </Select>
              </Field>
              <Field label="PVP s/ IVA" className="xl:col-span-2">
                <div className="flex h-10 items-center px-1 font-medium tabular-nums">{formatEUR(pvp)}</div>
              </Field>
            </div>
            {false && line.isOil && offer === index ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p>
                  Linha de óleo. Adicionar ECOLUB a {formatEUR(ECOLUB_UNIT_COST)} × {litres ?? 0} L
                  {litres ? ` = ${formatEUR(ecolubAmount(litres ?? 0))}` : ""}, margem 0%?
                </p>
                <div className="flex gap-2">
                  <Button type="button" className="h-9" disabled={!litres} onClick={() => addEcolub(index)}>Adicionar ECOLUB</Button>
                  <Button type="button" variant="outline" className="h-9" onClick={() => setOffer(null)}>Agora não</Button>
                </div>
              </div>
            ) : null}
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                data-testid={`remove-line-${index}`}
                onClick={() => removeLine(index)}
              >
                Remover linha
              </Button>
            </div>
          </div>
        );
      })}

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sidebar px-4 py-3 text-sidebar-foreground shadow-lg">
        <div className="text-sm">
          <p>Custo s/ IVA {formatEUR(totals.base)} · IVA {formatEUR(totals.vat)}</p>
          <p className="text-base font-semibold">Total do lançamento {formatEUR(totals.total)}</p>
          <p data-testid="totais-tipologia" className="mt-1 text-xs">
            {purchaseTypes.map((type) => {
              const amount = lines.reduce((sum, line) => {
                if (line.tipologia !== type.id) return sum;
                if (!line.ref.trim() && !line.description.trim()) return sum;
                const quantity = parseDecimal(line.quantity) ?? 0;
                const cost = parseDecimal(line.cost) ?? 0;
                const vat = parseDecimal(line.vat) ?? 0;
                return sum + quantity * cost * (1 + vat / 100);
              }, 0);
              if (amount <= 0) return null;
              return <span key={type.id} className="mr-3">{type.label}: {formatEUR(amount)}</span>;
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" data-testid="add-line" variant="outline" className="h-10 bg-transparent text-sidebar-foreground" onClick={() => addLine()}>
            + Linha
          </Button>
          <Button type="button" variant="outline" className="h-10 bg-transparent text-sidebar-foreground" onClick={() => { setLines([blankLine(today)]); setOffer(null); }}>
            Limpar
          </Button>
          <Button type="button" className="h-10" disabled={pending} onClick={save}>
            {pending ? "A lançar…" : "Lançar compra"}
          </Button>
        </div>
      </div>

      <Dialog open={createIndex !== null} onOpenChange={(open) => { if (!open) setCreateIndex(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo artigo {createIndex !== null ? normalizeRef(lines[createIndex]?.ref ?? "") : ""}</DialogTitle>
          </DialogHeader>
          <Field label="Família">
            <Select
              value={createFamily}
              onChange={(event) => {
                setCreateFamily(event.target.value);
                if (createIndex === null) return;
                const ref = lines[createIndex]?.ref ?? "";
                patch(createIndex, {
                  family: event.target.value,
                  margin: num(isOilArticle({ family: event.target.value, ref }) ? 30 : event.target.value === "Eco Taxa" ? 0 : 40),
                  isOil: isOilArticle({ family: event.target.value, ref }),
                });
              }}
            >
              {FAMILIES.map((family) => <option key={family}>{family}</option>)}
            </Select>
          </Field>
          <p className="text-sm text-muted-foreground">A descrição, o custo e a margem estão na linha. O stock entra com a quantidade desta compra.</p>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (createIndex === null) return;
                const ref = normalizeRef(lines[createIndex]?.ref ?? "");
                patch(createIndex, { ref, isNew: true, articleId: null, family: createFamily, isOil: isOilArticle({ family: createFamily, ref }) });
                if (isOilArticle({ family: createFamily, ref })) setOffer(createIndex);
                setCreateIndex(null);
                focusCell(createIndex, "description");
              }}
            >
              Usar nesta linha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewSupplier
        open={supplierOpen}
        onOpenChange={setSupplierOpen}
        onCreated={(supplier) => {
          setSupplierList((current) => [...current, supplier].sort((a, b) => a.name.localeCompare(b.name, "pt")));
          setLines((current) => current.map((line) => (line.supplierId ? line : { ...line, supplierId: supplier.id })));
        }}
      />
    </div>
  );

  function onEnter(event: ReactKeyboardEvent<HTMLElement>, row: number, col: string) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    move(row, col);
  }

  function onRefKey(event: ReactKeyboardEvent<HTMLInputElement>, index: number) {
    const optionCount = suggestions.length + (showCreate ? 1 : 0);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveRef(index);
      setHighlight((current) => Math.min(current + 1, Math.max(optionCount - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Escape") {
      setActiveRef(null);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (activeRef === index && highlight < suggestions.length && suggestions[highlight]) {
        applyArticle(index, suggestions[highlight]);
        return;
      }
      if (activeRef === index && showCreate && highlight === suggestions.length) {
        setCreateIndex(index);
        setCreateFamily(isOilArticle({ ref: typedRef }) ? "Óleo" : "Produto");
        setActiveRef(null);
        return;
      }
      const found = catalog.find((article) => article.ref === normalizeRef(lines[index]?.ref ?? ""));
      if (found) {
        applyArticle(index, found);
        return;
      }
      move(index, "ref");
    }
  }
}

function NewSupplier({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (supplier: GridSupplier) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo fornecedor</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await saveSupplier(null, formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onCreated({ id: result.id, name: result.name });
              onOpenChange(false);
            });
          }}
        >
          <Field label="Nome"><Input name="name" required className="h-10" /></Field>
          <Field label="NIF"><Input name="nif" className="h-10" /></Field>
          <Field label="Telefone"><Input name="phone" className="h-10" /></Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending} className="h-10">{pending ? "A guardar…" : "Criar"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
