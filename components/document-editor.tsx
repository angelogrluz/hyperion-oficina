"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { convertQuote, issueInvoice, saveOrder, saveQuote } from "@/app/actions/documents";
import { saveClient, saveVehicle } from "@/app/actions/records";
import { controlClass, Field, Select } from "@/components/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { includesSearch, lineAmounts, parseDecimal, salePrice, sumTotals } from "@/lib/domain";
import { formatEUR, formatQty } from "@/lib/format";
import { FUELS, ORDER_STATUSES, QUOTE_STATUSES } from "@/lib/labels";

export type EditorArticle = {
  id: string;
  ref: string;
  description: string;
  costPrice: number;
  marginPercent: number;
  vatRate: number;
  stockQty: number;
};

export type EditorClient = { id: string; name: string; nif: string };
export type EditorVehicle = {
  id: string;
  clientId: string;
  plate: string;
  brand: string;
  model: string;
  km: number;
};

type Line = {
  key: string;
  kind: "mao_de_obra" | "peca";
  description: string;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  vatRate: string;
  articleId: string | null;
  ref: string;
};

function num(value: number) {
  return String(value).replace(".", ",");
}

export function DocumentEditor({
  mode,
  documentId,
  number,
  savedStatus,
  locked,
  labourRate,
  clients,
  vehicles,
  articles,
  initial,
  invoice,
  orderHref,
}: {
  mode: "order" | "quote";
  documentId?: string;
  number?: string;
  savedStatus: string;
  locked: boolean;
  labourRate: number;
  clients: EditorClient[];
  vehicles: EditorVehicle[];
  articles: EditorArticle[];
  invoice?: { number: string; provider: string } | null;
  orderHref?: string | null;
  initial: {
    clientId: string;
    vehicleId: string;
    dateIn: string;
    dateOut: string;
    validUntil: string;
    km: string;
    problem: string;
    notes: string;
    status: string;
    lines: Line[];
  };
}) {
  const router = useRouter();
  const [clientList, setClientList] = useState(clients);
  const [vehicleList, setVehicleList] = useState(vehicles);
  const [clientId, setClientId] = useState(initial.clientId);
  const [vehicleId, setVehicleId] = useState(initial.vehicleId);
  const [dateIn, setDateIn] = useState(initial.dateIn);
  const [dateOut, setDateOut] = useState(initial.dateOut);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [km, setKm] = useState(initial.km);
  const [problem, setProblem] = useState(initial.problem);
  const [notes, setNotes] = useState(initial.notes);
  const [status, setStatus] = useState(initial.status);
  const [lines, setLines] = useState<Line[]>(initial.lines);
  const [partQuery, setPartQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [clientOpen, setClientOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [issued, setIssued] = useState<string | null>(invoice?.number ?? null);

  const ownedVehicles = vehicleList.filter((vehicle) => vehicle.clientId === clientId);
  const matches = useMemo(() => {
    const query = partQuery.trim();
    return articles
      .filter((article) => !query || includesSearch(`${article.ref} ${article.description}`, query))
      .slice(0, 8);
  }, [articles, partQuery]);

  const totals = sumTotals(
    lines.map((line) => ({
      quantity: parseDecimal(line.quantity) ?? 0,
      unitPrice: parseDecimal(line.unitPrice) ?? 0,
      unitCost: parseDecimal(line.unitCost) ?? 0,
      vatRate: parseDecimal(line.vatRate) ?? 0,
    })),
  );

  function touch() {
    setDirty(true);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    touch();
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLabour() {
    touch();
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        kind: "mao_de_obra",
        description: "",
        quantity: "1",
        unitPrice: num(labourRate),
        unitCost: "0",
        vatRate: "23",
        articleId: null,
        ref: "",
      },
    ]);
  }

  function addPart(article: EditorArticle) {
    touch();
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        kind: "peca",
        description: article.description,
        quantity: "1",
        unitPrice: num(salePrice(article.costPrice, article.marginPercent)),
        unitCost: num(article.costPrice),
        vatRate: num(article.vatRate),
        articleId: article.id,
        ref: article.ref,
      },
    ]);
    setPartQuery("");
  }

  function payloadLines() {
    return lines.map((line) => {
      const quantity = parseDecimal(line.quantity);
      const unitPrice = parseDecimal(line.unitPrice);
      const unitCost = parseDecimal(line.unitCost);
      const vatRate = parseDecimal(line.vatRate);
      if (!line.description.trim() || quantity === null || unitPrice === null || unitCost === null || vatRate === null) {
        return null;
      }
      return {
        kind: line.kind,
        description: line.description.trim(),
        quantity,
        unitPrice,
        unitCost,
        vatRate,
        articleId: line.articleId,
      };
    });
  }

  function save() {
    const kmValue = Number(km);
    if (!Number.isInteger(kmValue) || kmValue < 0) {
      setError("Indique os quilómetros em número inteiro.");
      return;
    }
    const parsedLines = payloadLines();
    if (parsedLines.some((line) => line === null)) {
      setError("Há linhas com quantidade ou preço inválido.");
      return;
    }
    const body = {
      clientId,
      vehicleId,
      km: kmValue,
      problem,
      notes,
      status,
      lines: parsedLines,
    };
    startTransition(async () => {
      const result =
        mode === "order"
          ? await saveOrder(documentId ?? null, { ...body, dateIn, dateOut })
          : await saveQuote(documentId ?? null, { ...body, date: dateIn, validUntil });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.success(mode === "order" ? "Ordem guardada." : "Orçamento guardado.");
      if (!documentId) {
        router.push(mode === "order" ? `/ordens/${result.id}` : `/orcamentos/${result.id}`);
      } else {
        setDirty(false);
        router.refresh();
      }
    });
  }

  const statuses =
    mode === "order"
      ? ORDER_STATUSES.filter((item) => item.value !== "faturada" || status === "faturada")
      : QUOTE_STATUSES.filter((item) => item.value !== "convertido" || status === "convertido");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid gap-4">
        {locked ? (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            {mode === "order"
              ? `Ordem faturada${issued ? ` com o documento simulado ${issued}` : ""}. Já não pode ser alterada.`
              : "Orçamento convertido numa ordem de reparação."}
            {orderHref ? (
              <>
                {" "}
                <a className="font-medium underline" href={orderHref}>
                  Abrir a ordem
                </a>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:grid-cols-2">
          <Field label="Cliente">
            <Select
              value={clientId}
              disabled={locked}
              onChange={(event) => {
                touch();
                setClientId(event.target.value);
                setVehicleId("");
              }}
            >
              <option value="">Escolher…</option>
              {clientList.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} · {client.nif}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Viatura">
            <Select
              value={vehicleId}
              disabled={locked || !clientId}
              onChange={(event) => {
                touch();
                const next = event.target.value;
                setVehicleId(next);
                const vehicle = ownedVehicles.find((item) => item.id === next);
                if (vehicle) setKm(String(vehicle.km));
              }}
            >
              <option value="">{clientId ? "Escolher…" : "Escolha primeiro o cliente"}</option>
              {ownedVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate} · {vehicle.brand} {vehicle.model}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="button" variant="outline" className="h-9" disabled={locked} onClick={() => setClientOpen(true)}>
              Novo cliente
            </Button>
            <Button type="button" variant="outline" className="h-9" disabled={locked || !clientId} onClick={() => setVehicleOpen(true)}>
              Nova viatura
            </Button>
          </div>
          <Field label={mode === "order" ? "Data de entrada" : "Data"}>
            <Input type="date" className="h-10 bg-card" value={dateIn} disabled={locked} onChange={(event) => { touch(); setDateIn(event.target.value); }} />
          </Field>
          {mode === "order" ? (
            <Field label="Data de saída" hint="Se ficar vazia, a conclusão usa o dia de hoje.">
              <Input type="date" className="h-10 bg-card" value={dateOut} disabled={locked} onChange={(event) => { touch(); setDateOut(event.target.value); }} />
            </Field>
          ) : (
            <Field label="Válido até">
              <Input type="date" className="h-10 bg-card" value={validUntil} disabled={locked} onChange={(event) => { touch(); setValidUntil(event.target.value); }} />
            </Field>
          )}
          <Field label="Quilómetros">
            <Input className="h-10 bg-card" inputMode="numeric" value={km} disabled={locked} onChange={(event) => { touch(); setKm(event.target.value); }} />
          </Field>
          <Field label="Estado">
            <Select value={status} disabled={locked} onChange={(event) => { touch(); setStatus(event.target.value); }}>
              {statuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={mode === "order" ? "Problema relatado" : "Trabalho a orçamentar"} className="md:col-span-2">
            <Textarea value={problem} disabled={locked} onChange={(event) => { touch(); setProblem(event.target.value); }} />
          </Field>
          <Field label="Notas internas" className="md:col-span-2">
            <Textarea value={notes} disabled={locked} onChange={(event) => { touch(); setNotes(event.target.value); }} />
          </Field>
        </div>

        <div className="rounded-xl bg-card ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <h2 className="font-medium">Linhas</h2>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-9" disabled={locked} onClick={addLabour}>
                Mão de obra
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 font-medium">Qtd</th>
                  <th className="px-3 py-2 font-medium">Preço s/ IVA</th>
                  <th className="px-3 py-2 font-medium">IVA</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-muted-foreground">
                      Ainda sem linhas. Acrescente mão de obra ou uma peça.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => {
                    const amounts = lineAmounts({
                      quantity: parseDecimal(line.quantity) ?? 0,
                      unitPrice: parseDecimal(line.unitPrice) ?? 0,
                      unitCost: parseDecimal(line.unitCost) ?? 0,
                      vatRate: parseDecimal(line.vatRate) ?? 0,
                    });
                    return (
                      <tr key={line.key} className="border-t">
                        <td className="px-3 py-2">
                          <p className="mb-1 text-xs text-muted-foreground">
                            {line.kind === "mao_de_obra" ? "Mão de obra" : line.ref || "Peça"}
                          </p>
                          <Input
                            value={line.description}
                            disabled={locked}
                            className="h-10 bg-background"
                            onChange={(event) => updateLine(line.key, { description: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={line.quantity}
                            disabled={locked}
                            inputMode="decimal"
                            className="h-10 w-20 bg-background"
                            aria-label={line.kind === "mao_de_obra" ? "Horas" : "Quantidade"}
                            onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={line.unitPrice}
                            disabled={locked}
                            inputMode="decimal"
                            className="h-10 w-28 bg-background"
                            onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={line.vatRate}
                            disabled={locked}
                            inputMode="decimal"
                            className="h-10 w-16 bg-background"
                            onChange={(event) => updateLine(line.key, { vatRate: event.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatEUR(amounts.total)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button type="button" variant="ghost" disabled={locked} onClick={() => { touch(); setLines((current) => current.filter((item) => item.key !== line.key)); }}>
                            Tirar
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-3">
            <Field label="Adicionar peça do stock">
              <Input
                value={partQuery}
                disabled={locked}
                placeholder="Referência ou descrição"
                className="h-10 bg-background"
                onChange={(event) => setPartQuery(event.target.value)}
              />
            </Field>
            {partQuery && !locked ? (
              <ul className="mt-2 divide-y rounded-lg border">
                {matches.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">Sem artigos.</li> : null}
                {matches.map((article) => (
                  <li key={article.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => addPart(article)}
                    >
                      <span>
                        <span className="font-mono">{article.ref}</span> {article.description}
                      </span>
                      <span className="text-muted-foreground">
                        stock {formatQty(article.stockQty)} · {formatEUR(salePrice(article.costPrice, article.marginPercent))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">O stock só é atualizado nas compras a fornecedores.</p>
          </div>
        </div>
      </div>

      <aside className="h-fit rounded-xl bg-card p-4 ring-1 ring-foreground/10 lg:sticky lg:top-6">
        <p className="text-sm text-muted-foreground">{number ?? (mode === "order" ? "Nova ordem" : "Novo orçamento")}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><dt>Base s/ IVA</dt><dd className="tabular-nums">{formatEUR(totals.base)}</dd></div>
          <div className="flex justify-between"><dt>IVA</dt><dd className="tabular-nums">{formatEUR(totals.vat)}</dd></div>
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatEUR(totals.total)}</dd></div>
          <div className="flex justify-between text-muted-foreground"><dt>Margem bruta</dt><dd className="tabular-nums">{formatEUR(totals.margin)}</dd></div>
        </dl>
        {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
        <div className="mt-4 grid gap-2">
          {locked ? null : (
            <Button type="button" className="h-10" disabled={pending} onClick={save}>
              {pending ? "A guardar…" : "Guardar"}
            </Button>
          )}
          {mode === "order" && savedStatus === "concluida" && !locked ? (
            <Button type="button" className="h-10" disabled={pending} onClick={() => setInvoiceOpen(true)}>
              Faturar
            </Button>
          ) : null}
          {mode === "order" && savedStatus !== "concluida" && savedStatus !== "faturada" ? (
            <p className="text-xs text-muted-foreground">Mude o estado para Concluída e guarde antes de faturar.</p>
          ) : null}
          {mode === "order" && dirty && savedStatus === "concluida" ? (
            <p className="text-xs text-muted-foreground">Há alterações por guardar. A fatura usa a ordem tal como está gravada.</p>
          ) : null}
          {mode === "quote" && documentId && !locked && savedStatus !== "recusado" ? (
            <Button
              type="button"
              variant="secondary"
              className="h-10"
              disabled={pending || dirty}
              onClick={() => {
                startTransition(async () => {
                  const result = await convertQuote(documentId);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  toast.success("Orçamento convertido.");
                  router.push(`/ordens/${result.orderId}`);
                });
              }}
            >
              Converter em OR
            </Button>
          ) : null}
        </div>
      </aside>

      <QuickClient
        open={clientOpen}
        onOpenChange={setClientOpen}
        onCreated={(client) => {
          setClientList((current) => [...current, client].sort((a, b) => a.name.localeCompare(b.name, "pt")));
          setClientId(client.id);
          setVehicleId("");
          touch();
        }}
      />
      <QuickVehicle
        open={vehicleOpen}
        clientId={clientId}
        onOpenChange={setVehicleOpen}
        onCreated={(vehicle) => {
          setVehicleList((current) => [...current, vehicle]);
          setVehicleId(vehicle.id);
          setKm(String(vehicle.km));
          touch();
        }}
      />
      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Emitir fatura simulada</DialogTitle>
            <DialogDescription>
              O adaptador ativo é a Moloni em modo de simulação. O documento fica numerado, mas não tem validade fiscal
              nem é enviado à Autoridade Tributária.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Total a comunicar: {formatEUR(totals.total)} ({formatEUR(totals.base)} + IVA).
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInvoiceOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={pending || !documentId}
              onClick={() => {
                if (!documentId) return;
                startTransition(async () => {
                  const result = await issueInvoice(documentId);
                  if (!result.ok) {
                    setError(result.error);
                    setInvoiceOpen(false);
                    return;
                  }
                  setIssued(result.documentNumber);
                  toast.success(`Documento simulado ${result.documentNumber}`);
                  setInvoiceOpen(false);
                  router.refresh();
                });
              }}
            >
              {pending ? "A emitir…" : "Emitir simulação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuickClient({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (client: EditorClient) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>Fica disponível de imediato nesta ordem.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await saveClient(null, formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onCreated({ id: result.id, name: result.name, nif: result.nif });
              setError(null);
              onOpenChange(false);
            });
          }}
        >
          <Field label="Nome"><Input name="name" required className="h-10" /></Field>
          <Field label="NIF"><Input name="nif" required className="h-10" /></Field>
          <Field label="Telefone"><Input name="phone" className="h-10" /></Field>
          <Field label="E-mail"><Input name="email" type="email" className="h-10" /></Field>
          <Field label="Morada"><Textarea name="address" /></Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending} className="h-10">{pending ? "A guardar…" : "Criar cliente"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickVehicle({
  open,
  clientId,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  clientId: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (vehicle: EditorVehicle) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova viatura</DialogTitle>
          <DialogDescription>A matrícula fica no formato AA-00-AA.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            formData.set("clientId", clientId);
            startTransition(async () => {
              const result = await saveVehicle(null, formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onCreated(result);
              setError(null);
              onOpenChange(false);
            });
          }}
        >
          <Field label="Matrícula"><Input name="plate" required className="h-10 font-mono uppercase" /></Field>
          <Field label="Marca"><Input name="brand" required className="h-10" /></Field>
          <Field label="Modelo"><Input name="model" required className="h-10" /></Field>
          <Field label="Ano"><Input name="year" required inputMode="numeric" className="h-10" /></Field>
          <Field label="VIN"><Input name="vin" className="h-10 font-mono uppercase" /></Field>
          <Field label="Km"><Input name="km" defaultValue="0" inputMode="numeric" className="h-10" /></Field>
          <Field label="Combustível" className="sm:col-span-2">
            <select name="fuel" className={controlClass} defaultValue="Gasolina">
              {FUELS.map((fuel) => (
                <option key={fuel}>{fuel}</option>
              ))}
            </select>
          </Field>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <Button type="submit" disabled={pending} className="h-10 sm:col-span-2">{pending ? "A guardar…" : "Criar viatura"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
