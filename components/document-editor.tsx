"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { convertQuote, issueInvoice, saveOrder, saveQuote } from "@/app/actions/documents";
import { lookupPlate } from "@/app/actions/plates";
import { saveClient, saveVehicle } from "@/app/actions/records";
import { controlClass, Field, Select } from "@/components/field";
import { FolhaView } from "@/components/folha-view";
import { LineGrid } from "@/components/line-grid";
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
import { includesSearch, lineAmounts, normalizePlate, parseDecimal, salePrice, sumTotals } from "@/lib/domain";
import { formatEUR, formatQty } from "@/lib/format";
import { FUELS, QUOTE_STATUSES } from "@/lib/labels";

export type EditorArticle = {
  id: string;
  ref: string;
  description: string;
  costPrice: number;
  marginPercent: number;
  vatRate: number;
  stockQty: number;
  family?: string;
};

export type EditorClient = {
  id: string;
  name: string;
  nif: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
};
export type EditorVehicle = {
  id: string;
  clientId: string;
  plate: string;
  brand: string;
  model: string;
  version: string;
  year: number;
  vin: string;
  engine: string;
  km: number;
  fuel: string;
};

type Line = {
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
  userName = "Admin",
  printHref,
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
  userName?: string;
  printHref?: string;
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
  const startingVehicle = vehicles.find((vehicle) => vehicle.id === initial.vehicleId);
  const [plate, setPlate] = useState(startingVehicle?.plate ?? "");
  const [brand, setBrand] = useState(startingVehicle?.brand ?? "");
  const [model, setModel] = useState(startingVehicle?.model ?? "");
  const [version, setVersion] = useState(startingVehicle?.version ?? "");
  const [year, setYear] = useState(startingVehicle ? String(startingVehicle.year) : "");
  const [vin, setVin] = useState(startingVehicle?.vin ?? "");
  const [engine, setEngine] = useState(startingVehicle?.engine ?? "");
  const [fuel, setFuel] = useState(startingVehicle?.fuel || "Gasolina");
  const [plateNote, setPlateNote] = useState<string | null>(null);
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
      discountPercent: parseDecimal(line.discount) ?? 0,
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
        discount: "0",
        vatRate: "23",
        note: "",
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
        discount: "0",
        vatRate: num(article.vatRate),
        note: "",
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
      const discountPercent = parseDecimal(line.discount) ?? 0;
      const vatRate = parseDecimal(line.vatRate);
      if (!line.description.trim() || quantity === null || unitPrice === null || unitCost === null || vatRate === null || discountPercent < 0 || discountPercent > 100) {
        return null;
      }
      return {
        kind: line.kind,
        description: line.description.trim(),
        quantity,
        unitPrice,
        unitCost,
        discountPercent,
        vatRate,
        internalNote: line.note ?? "",
        articleId: line.articleId,
      };
    });
  }

  function fillVehicle(vehicle: EditorVehicle | undefined) {
    if (!vehicle) {
      setPlate("");
      setBrand("");
      setModel("");
      setVersion("");
      setYear("");
      setVin("");
      setEngine("");
      setFuel("Gasolina");
      return;
    }
    setPlate(vehicle.plate);
    setBrand(vehicle.brand);
    setModel(vehicle.model);
    setVersion(vehicle.version);
    setYear(String(vehicle.year));
    setVin(vehicle.vin);
    setEngine(vehicle.engine);
    setFuel(vehicle.fuel || "Gasolina");
    setKm(String(vehicle.km));
  }

  function save(statusOverride?: string) {
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
    const nextStatus = statusOverride ?? status;
    if (statusOverride) setStatus(statusOverride);
    startTransition(async () => {
      let nextVehicleId = vehicleId;
      const formData = new FormData();
      formData.set("clientId", clientId);
      formData.set("plate", plate);
      formData.set("brand", brand);
      formData.set("model", model);
      formData.set("version", version);
      formData.set("year", year || String(new Date().getFullYear()));
      formData.set("vin", vin);
      formData.set("engine", engine);
      formData.set("km", String(kmValue));
      formData.set("fuel", fuel || "Gasolina");
      if (!nextVehicleId && plate.trim()) {
        if (!clientId) {
          setError("Escolha o cliente na barra lateral.");
          return;
        }
        const created = await saveVehicle(null, formData);
        if (!created.ok) {
          setError(created.error);
          return;
        }
        nextVehicleId = created.id;
        setVehicleId(created.id);
        setVehicleList((current) => [
          ...current,
          {
            id: created.id,
            clientId,
            plate: created.plate,
            brand: created.brand,
            model: created.model,
            version,
            year: Number(year) || new Date().getFullYear(),
            vin,
            engine,
            km: created.km,
            fuel: fuel || "Gasolina",
          },
        ]);
      } else if (nextVehicleId) {
        const savedVehicle = await saveVehicle(nextVehicleId, formData);
        if (!savedVehicle.ok) {
          setError(savedVehicle.error);
          return;
        }
      }
      const body = {
        clientId,
        vehicleId: nextVehicleId,
        km: kmValue,
        problem,
        notes,
        status: nextStatus,
        lines: parsedLines,
      };
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

  function addDraft(draft: { description: string; ref: string; quantity: string; unitPrice: string }) {
    touch();
    const article = articles.find((item) => item.ref.toLowerCase() === draft.ref.trim().toLowerCase());
    setLines((current) => [
      ...current,
      article
        ? {
            key: crypto.randomUUID(),
            kind: "peca" as const,
            description: draft.description || article.description,
            quantity: draft.quantity || "1",
            unitPrice: draft.unitPrice || num(salePrice(article.costPrice, article.marginPercent)),
            unitCost: num(article.costPrice),
            discount: "0",
            vatRate: num(article.vatRate),
            note: "",
            articleId: article.id,
            ref: article.ref,
          }
        : {
            key: crypto.randomUUID(),
            kind: (draft.ref.trim() ? "peca" : "mao_de_obra") as "peca" | "mao_de_obra",
            description: draft.description,
            quantity: draft.quantity || "1",
            unitPrice: draft.unitPrice || num(labourRate),
            unitCost: "0",
            discount: "0",
            vatRate: "23",
            note: "",
            articleId: null,
            ref: draft.ref,
          },
    ]);
  }

  const selectedClient = clientList.find((item) => item.id === clientId);

  const sheet = mode === "order";
  if (sheet) {
    return (
      <>
        <FolhaView
          number={number}
          userName={userName}
          printHref={printHref}
          locked={locked}
          pending={pending}
          client={selectedClient}
          clients={clientList}
          clientId={clientId}
          onClient={(id) => {
            touch();
            setClientId(id);
            setVehicleId("");
            fillVehicle(undefined);
          }}
          error={error}
          problem={problem}
          notes={notes}
          dateIn={dateIn}
          lines={lines}
          articles={articles}
          plate={plate}
          brand={brand}
          model={model}
          version={version}
          year={year}
          vin={vin}
          engine={engine}
          fuel={fuel}
          km={km}
          onProblem={(value) => { touch(); setProblem(value); }}
          onNotes={(value) => { touch(); setNotes(value); }}
          onDateIn={(value) => { touch(); setDateIn(value); }}
          onLine={(key, patch) => updateLine(key, patch)}
          onRemove={(key) => { touch(); setLines((current) => current.filter((item) => item.key !== key)); }}
          onAdd={addDraft}
          onPlate={(value) => { touch(); setPlate(value); }}
          onBrand={(value) => { touch(); setBrand(value); }}
          onModel={(value) => { touch(); setModel(value); }}
          onVersion={(value) => { touch(); setVersion(value); }}
          onYear={(value) => { touch(); setYear(value); }}
          onVin={(value) => { touch(); setVin(value); }}
          onEngine={(value) => { touch(); setEngine(value); }}
          onFuel={(value) => { touch(); setFuel(value); }}
          onKm={(value) => { touch(); setKm(value); }}
          onLookup={() => {
            startTransition(async () => {
              const result = await lookupPlate(plate);
              if (!result.found || !("vehicle" in result) || !result.vehicle) {
                setError(result.message);
                return;
              }
              const found = result.vehicle;
              touch();
              setError(null);
              setPlate(found.plate);
              setBrand(found.brand);
              setModel(found.model);
              setVersion(found.version);
              setYear(String(found.year));
              setFuel(found.fuel);
              setEngine(found.engine);
              setVin(found.vin ?? "");
              const known = vehicleList.find((item) => item.plate === normalizePlate(found.plate));
              if (known) {
                setVehicleId(known.id);
                setClientId(known.clientId);
              }
            });
          }}
          onSave={save}
          onInvoice={() => setInvoiceOpen(true)}
          canInvoice={(savedStatus === "concluida" || status === "concluida") && !locked}
        />
        <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Emitir fatura simulada</DialogTitle>
              <DialogDescription>
                O adaptador ativo é a Moloni em modo de simulação. O documento fica numerado, mas não tem validade fiscal nem é enviado à Autoridade Tributária.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Total a comunicar: {formatEUR(totals.total)} ({formatEUR(totals.base)} + IVA).
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInvoiceOpen(false)}>Cancelar</Button>
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
      </>
    );
  }

  const statuses = QUOTE_STATUSES.filter((item) => item.value !== "convertido" || status === "convertido");

  const gridLines = lines.map((line) => ({
    key: line.key,
    ref: line.ref,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discount: line.discount,
    vatRate: line.vatRate,
    total: lineAmounts({
      quantity: parseDecimal(line.quantity) ?? 0,
      unitPrice: parseDecimal(line.unitPrice) ?? 0,
      unitCost: parseDecimal(line.unitCost) ?? 0,
      discountPercent: parseDecimal(line.discount) ?? 0,
      vatRate: parseDecimal(line.vatRate) ?? 0,
    }).total,
  }));

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid min-w-0 gap-4">
        {locked ? (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            Orçamento convertido numa ordem de reparação.
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
                fillVehicle(undefined);
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
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="button" variant="outline" className="h-9" disabled={locked} onClick={() => setClientOpen(true)}>
              Novo cliente
            </Button>
            <Button type="button" variant="outline" className="h-9" disabled={locked || !clientId} onClick={() => setVehicleOpen(true)}>
              Nova viatura
            </Button>
          </div>
          <Field label="Data">
            <Input type="date" className="h-10 bg-card" value={dateIn} disabled={locked} onChange={(event) => { touch(); setDateIn(event.target.value); }} />
          </Field>
          <Field label="Válido até">
            <Input type="date" className="h-10 bg-card" value={validUntil} disabled={locked} onChange={(event) => { touch(); setValidUntil(event.target.value); }} />
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
          <Field label="Trabalho a orçamentar" className="md:col-span-2">
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
          <LineGrid
            lines={gridLines}
            locked={locked}
            onRemove={(key) => {
              touch();
              setLines((current) => current.filter((item) => item.key !== key));
            }}
            onChange={(key, patch) => {
              if (patch.ref !== undefined) {
                const article = articles.find((item) => item.ref.toLowerCase() === patch.ref!.trim().toLowerCase());
                if (article) {
                  updateLine(key, {
                    ref: article.ref,
                    description: article.description,
                    unitPrice: num(salePrice(article.costPrice, article.marginPercent)),
                    unitCost: num(article.costPrice),
                    vatRate: num(article.vatRate),
                    articleId: article.id,
                    kind: "peca",
                  });
                  return;
                }
                updateLine(key, { ref: patch.ref, articleId: null, kind: patch.ref.trim() ? "peca" : "mao_de_obra" });
              }
              const rest = { ...patch };
              delete rest.ref;
              if (Object.keys(rest).length > 0) updateLine(key, rest);
            }}
          />
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

      <aside className="grid gap-3 xl:sticky xl:top-16">
        <section className="rounded-xl border border-[#d5ebed] bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#0b8f9c]">Viatura</h2>
            <Button type="button" variant="outline" className="h-7 px-2 text-xs" disabled={locked || !clientId} onClick={() => setVehicleOpen(true)}>Nova</Button>
          </div>
          <Field label="Viatura do cliente">
            <Select
              value={vehicleId}
              disabled={locked || !clientId}
              onChange={(event) => {
                touch();
                const next = event.target.value;
                setVehicleId(next);
                fillVehicle(vehicleList.find((item) => item.id === next));
                setPlateNote(null);
              }}
            >
              <option value="">{clientId ? "Escolher…" : "Escolha primeiro o cliente"}</option>
              {ownedVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.brand} {vehicle.model}</option>
              ))}
            </Select>
          </Field>
          <div className="mt-2 flex items-end gap-2">
            <Field label="Matrícula" className="flex-1">
              <Input value={plate} disabled={locked} onChange={(event) => { touch(); setPlate(event.target.value.toUpperCase()); }} className="h-8 font-mono uppercase" />
            </Field>
            <Button
              type="button"
              variant="secondary"
              className="h-8"
              disabled={locked || pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await lookupPlate(plate);
                  if (!result.found || !("vehicle" in result) || !result.vehicle) {
                    setPlateNote(result.message);
                    return;
                  }
                  const found = result.vehicle;
                  touch();
                  setPlate(found.plate);
                  setBrand(found.brand);
                  setModel(found.model);
                  setVersion(found.version);
                  setYear(String(found.year));
                  setFuel(found.fuel);
                  setEngine(found.engine);
                  setVin(found.vin ?? "");
                  setPlateNote(result.message);
                });
              }}
            >
              Procurar
            </Button>
          </div>
          {plateNote ? <p className="mt-1 text-xs text-[#0b5f68]">{plateNote}</p> : <p className="mt-1 text-xs text-[#4d6d73]">Consulta simulada.</p>}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Marca"><Input value={brand} disabled={locked} onChange={(event) => { touch(); setBrand(event.target.value); }} className="h-8" /></Field>
            <Field label="Modelo"><Input value={model} disabled={locked} onChange={(event) => { touch(); setModel(event.target.value); }} className="h-8" /></Field>
            <Field label="Versão" className="col-span-2"><Input value={version} disabled={locked} onChange={(event) => { touch(); setVersion(event.target.value); }} className="h-8" /></Field>
            <Field label="Ano"><Input value={year} disabled={locked} inputMode="numeric" onChange={(event) => { touch(); setYear(event.target.value); }} className="h-8" /></Field>
            <Field label="Combustível">
              <Select value={fuel} disabled={locked} onChange={(event) => { touch(); setFuel(event.target.value); }}>
                {FUELS.map((item) => <option key={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label="Motor" className="col-span-2"><Input value={engine} disabled={locked} onChange={(event) => { touch(); setEngine(event.target.value); }} className="h-8" /></Field>
            <Field label="N.º de chassi / VIN" className="col-span-2"><Input value={vin} disabled={locked} onChange={(event) => { touch(); setVin(event.target.value.toUpperCase()); }} className="h-8 font-mono uppercase" /></Field>
            <Field label="Quilómetros" className="col-span-2"><Input value={km} disabled={locked} inputMode="numeric" onChange={(event) => { touch(); setKm(event.target.value); }} className="h-8" /></Field>
          </div>
        </section>
        <div className="rounded-xl border border-[#d5ebed] bg-white p-3">
        <p className="text-sm text-muted-foreground">{number ?? "Novo orçamento"}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><dt>Base s/ IVA</dt><dd className="tabular-nums">{formatEUR(totals.base)}</dd></div>
          <div className="flex justify-between"><dt>IVA</dt><dd className="tabular-nums">{formatEUR(totals.vat)}</dd></div>
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatEUR(totals.total)}</dd></div>
          <div className="flex justify-between text-muted-foreground"><dt>Margem bruta</dt><dd className="tabular-nums">{formatEUR(totals.margin)}</dd></div>
        </dl>
        {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
        <div className="mt-4 grid gap-2">
          {locked ? null : (
            <Button type="button" variant="secondary" className="h-10" disabled={pending} onClick={() => save()}>
              {pending ? "A guardar…" : "Guardar"}
            </Button>
          )}
          {documentId && !locked && savedStatus !== "recusado" ? (
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
          fillVehicle(vehicle);
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
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [version, setVersion] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [engine, setEngine] = useState("");
  const [fuel, setFuel] = useState("Gasolina");
  const [note, setNote] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova viatura</DialogTitle>
          <DialogDescription>A matrícula fica no formato AA-00-AA. A procura está em simulação.</DialogDescription>
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
              onCreated({
                id: result.id,
                clientId,
                plate: result.plate,
                brand: result.brand,
                model: result.model,
                version,
                year: Number(year) || new Date().getFullYear(),
                vin,
                engine,
                km: result.km,
                fuel,
              });
              setError(null);
              onOpenChange(false);
            });
          }}
        >
          <div className="sm:col-span-2">
            <div className="flex gap-2">
              <Field label="Matrícula" className="flex-1">
                <Input name="plate" required value={plate} onChange={(event) => setPlate(event.target.value.toUpperCase())} className="h-10 font-mono uppercase" />
              </Field>
              <Button
                type="button"
                variant="secondary"
                className="mt-6 h-10"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await lookupPlate(plate);
                    if (!result.found || !("vehicle" in result) || !result.vehicle) {
                      setNote(result.message);
                      return;
                    }
                    const found = result.vehicle;
                    setPlate(found.plate);
                    setBrand(found.brand);
                    setModel(found.model);
                    setVersion(found.version);
                    setYear(String(found.year));
                    setFuel(found.fuel);
                    setEngine(found.engine);
                    setVin(found.vin ?? "");
                    setNote(result.message);
                  });
                }}
              >
                Procurar
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Consulta simulada, sem API paga.</p>
            {note ? <p className="mt-1 text-xs text-[#0b5f68]">{note}</p> : null}
          </div>
          <Field label="Marca"><Input name="brand" required value={brand} onChange={(event) => setBrand(event.target.value)} className="h-10" /></Field>
          <Field label="Modelo"><Input name="model" required value={model} onChange={(event) => setModel(event.target.value)} className="h-10" /></Field>
          <Field label="Versão"><Input name="version" value={version} onChange={(event) => setVersion(event.target.value)} className="h-10" /></Field>
          <Field label="Ano"><Input name="year" required value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" className="h-10" /></Field>
          <Field label="Motor"><Input name="engine" value={engine} onChange={(event) => setEngine(event.target.value)} className="h-10" /></Field>
          <Field label="VIN"><Input name="vin" value={vin} onChange={(event) => setVin(event.target.value.toUpperCase())} className="h-10 font-mono uppercase" /></Field>
          <Field label="Km"><Input name="km" defaultValue="0" inputMode="numeric" className="h-10" /></Field>
          <Field label="Combustível">
            <select name="fuel" className={controlClass} value={fuel} onChange={(event) => setFuel(event.target.value)}>
              {FUELS.map((item) => (
                <option key={item}>{item}</option>
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
