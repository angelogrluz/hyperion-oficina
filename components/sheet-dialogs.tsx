"use client";

import { useState } from "react";
import { lookupNif } from "@/browser/src/lookup-api";
import { clientWithNif } from "@/lib/client-search";
import { includesSearch, isValidNif, normalizeNif, normalizeSearch, parseDecimal } from "@/lib/domain";
import { readPurchaseMemory, writePurchaseMemory } from "@/lib/browser-cache";
import { lisbonParts } from "@/lib/format";
import type { StockLink } from "@/lib/stock-entry";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ClientForm = {
  name: string;
  nif: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  notes: string;
};

type SupplierOption = { id: string; name: string };

export function ClientEditDialog({
  client,
  onClose,
  onSave,
}: {
  client: ClientForm;
  onClose: () => void;
  onSave: (data: ClientForm) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [name, setName] = useState(client.name);
  const [nif, setNif] = useState(client.nif);
  const [phone, setPhone] = useState(client.phone);
  const [email, setEmail] = useState(client.email);
  const [address, setAddress] = useState(client.address);
  const [postalCode, setPostalCode] = useState(client.postalCode);
  const [city, setCity] = useState(client.city);
  const [notes, setNotes] = useState(client.notes);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    const data: ClientForm = {
      name: name.trim(),
      nif: normalizeNif(nif),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      address: address.trim(),
      postalCode: postalCode.trim(),
      city: city.trim(),
      notes: notes.trim(),
    };
    if (data.name.length < 2) {
      setError("Indique o nome.");
      return;
    }
    if (!isValidNif(data.nif)) {
      setError("NIF inválido.");
      return;
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      setError("E-mail inválido.");
      return;
    }
    setPending(true);
    const result = await onSave(data);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>A folha passa a mostrar estes dados.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs sm:col-span-2">
            Nome
            <Input value={name} onChange={(event) => setName(event.target.value)} className="h-9" />
          </label>
          <label className="grid gap-1 text-xs">
            NIF
            <Input value={nif} onChange={(event) => setNif(event.target.value)} inputMode="numeric" className="h-9" />
          </label>
          <label className="grid gap-1 text-xs">
            Telefone
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} className="h-9" />
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">
            E-mail
            <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="h-9" />
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">
            Morada
            <Textarea value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-16" />
          </label>
          <label className="grid gap-1 text-xs">
            Código postal
            <Input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} className="h-9" />
          </label>
          <label className="grid gap-1 text-xs">
            Localidade
            <Input value={city} onChange={(event) => setCity(event.target.value)} className="h-9" />
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">
            Notas
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-16" />
          </label>
        </div>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" className="bg-[var(--glow)] hover:bg-[var(--glow-deep)]" disabled={pending} onClick={() => void save()}>
            {pending ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewClientDialog({
  onClose,
  onSave,
  initial,
  clients = [],
  onUseExisting,
  description = "Fica selecionado nesta folha de obra.",
}: {
  onClose: () => void;
  onSave: (data: ClientForm) => Promise<{ ok: true } | { ok: false; error: string }>;
  initial?: Partial<ClientForm>;
  clients?: Array<{ id: string; name: string; nif?: string; phone?: string; email?: string }>;
  onUseExisting?: (id: string) => void;
  description?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [nif, setNif] = useState(initial?.nif ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const existing = clientWithNif(clients, nif);
  const sameName = name.trim().length >= 3 ? clients.filter((client) => normalizeSearch(client.name) === normalizeSearch(name)).slice(0, 3) : [];

  function lookup() {
    const value = normalizeNif(nif);
    if (value.length !== 9 || clientWithNif(clients, value)) return;
    void lookupNif(value).then((result) => {
      if (!result.ok) { setNote(result.error); return; }
      if (result.name) setName((current) => current.trim() ? current : result.name);
      if (result.address) setAddress((current) => current.trim() ? current : result.address);
      if (result.postalCode) setPostalCode((current) => current.trim() ? current : result.postalCode);
      if (result.city) setCity((current) => current.trim() ? current : result.city);
      setNote(result.name ? "Dados preenchidos a partir do NIF." : "");
    }).catch(() => undefined);
  }

  async function save() {
    const data: ClientForm = {
      name: name.trim(),
      nif: normalizeNif(nif),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      address: address.trim(),
      postalCode: postalCode.trim(),
      city: city.trim(),
      notes: "",
    };
    if (data.name.length < 2) {
      setError("Indica o nome.");
      return;
    }
    if (!isValidNif(data.nif)) {
      setError("NIF inválido.");
      return;
    }
    if (existing) {
      setError(`Já existe um cliente com este NIF: ${existing.name}.`);
      return;
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      setError("E-mail inválido.");
      return;
    }
    setPending(true);
    let result: { ok: true } | { ok: false; error: string };
    try {
      result = await onSave(data);
    } catch (failure) {
      result = { ok: false, error: failure instanceof Error && failure.message ? failure.message : "Não foi possível criar o cliente." };
    }
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs sm:col-span-2">
            Nome
            <Input data-testid="novo-cliente-nome" value={name} autoFocus={!initial?.name} onChange={(event) => setName(event.target.value)} className="h-9" />
          </label>
          <label className="grid gap-1 text-xs">
            NIF
            <Input data-testid="novo-cliente-nif" value={nif} autoFocus={Boolean(initial?.name) && !initial?.nif} onChange={(event) => setNif(event.target.value)} onBlur={lookup} inputMode="numeric" className="h-9" />
          </label>
          <label className="grid gap-1 text-xs">
            Telefone
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} className="h-9" />
          </label>
          {existing ? (
            <div data-testid="cliente-duplicado" role="alert" className="grid gap-2 rounded-lg border border-[#f5a524] bg-[#f5a524]/15 px-3 py-2 text-sm sm:col-span-2">
              <span>Já existe um cliente com este NIF: <strong>{existing.name}</strong>.</span>
              {onUseExisting ? (
                <Button type="button" variant="outline" className="h-8 w-fit" onClick={() => { onUseExisting(existing.id); onClose(); }}>
                  Usar este cliente
                </Button>
              ) : null}
            </div>
          ) : null}
          {!existing && sameName.length ? (
            <div data-testid="cliente-mesmo-nome" className="grid gap-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm sm:col-span-2">
              <span>Já tens {sameName.length === 1 ? "um cliente" : "clientes"} com este nome:</span>
              {sameName.map((client) => (
                <span key={client.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{client.name}{client.nif ? ` · NIF ${client.nif}` : ""}</span>
                  {onUseExisting ? (
                    <Button type="button" variant="outline" className="h-7 px-2 text-xs" onClick={() => { onUseExisting(client.id); onClose(); }}>
                      Usar este
                    </Button>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
          {note ? <p className="text-[13px] text-[var(--muted-text)] sm:col-span-2">{note}</p> : null}
          <label className="grid gap-1 text-xs sm:col-span-2">
            E-mail
            <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="h-9" />
          </label>
          <label className="grid gap-1 text-xs sm:col-span-2">
            Morada
            <Textarea value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-16" />
          </label>
          <label className="grid gap-1 text-xs">
            Código postal
            <Input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} className="h-9" />
          </label>
          <label className="grid gap-1 text-xs">
            Localidade
            <Input value={city} onChange={(event) => setCity(event.target.value)} className="h-9" />
          </label>
        </div>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" data-testid="novo-cliente-criar" className="bg-[var(--glow)] hover:bg-[var(--glow-deep)]" disabled={pending || Boolean(existing)} onClick={() => void save()}>
            {pending ? "A guardar…" : "Criar cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StockEntryDialog({
  line,
  suppliers,
  onClose,
  onCreateSupplier,
  onSave,
  onRemove,
}: {
  line: {
    ref: string;
    description: string;
    quantity: string;
    unitCost: string;
    stockEntry?: StockLink | null;
  };
  suppliers: SupplierOption[];
  onClose: () => void;
  onCreateSupplier: (name: string) => Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }>;
  onSave: (input: {
    ref: string;
    quantity: number;
    supplierId: string;
    invoiceNumber: string;
    date: string;
    cost: number;
    vat: number;
    remember: boolean;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onRemove: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const entry = line.stockEntry;
  const memory = entry ? null : readPurchaseMemory();
  const initialSupplier = entry?.supplierId || memory?.supplierId || "";
  const [ref, setRef] = useState(line.ref);
  const [quantity, setQuantity] = useState(entry ? String(entry.quantity).replace(".", ",") : line.quantity);
  const [invoice, setInvoice] = useState(entry?.invoiceNumber || memory?.invoiceNumber || "");
  const [date, setDate] = useState(entry?.date || lisbonParts().iso);
  const [cost, setCost] = useState(entry ? String(entry.cost).replace(".", ",") : line.unitCost);
  const [vat, setVat] = useState(entry ? String(entry.vatRate).replace(".", ",") : "23");
  const [supplierId, setSupplierId] = useState(initialSupplier);
  const [supplierQuery, setSupplierQuery] = useState(
    suppliers.find((item) => item.id === initialSupplier)?.name || entry?.supplierName || "",
  );
  const [listOpen, setListOpen] = useState(false);
  const [remember, setRemember] = useState(Boolean(readPurchaseMemory()?.remember));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const filtered = suppliers.filter((item) => !supplierQuery.trim() || includesSearch(item.name, supplierQuery)).slice(0, 8);
  const canCreate = supplierQuery.trim().length >= 2 && !suppliers.some((item) => item.name.toLocaleLowerCase("pt-PT") === supplierQuery.trim().toLocaleLowerCase("pt-PT"));

  async function createSupplier() {
    setPending(true);
    const result = await onCreateSupplier(supplierQuery.trim());
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSupplierId(result.id);
    setSupplierQuery(result.name);
    setListOpen(false);
    setError(null);
  }

  async function save() {
    if (ref.trim().length < 2) {
      setError("Indique a referência do artigo.");
      return;
    }
    const parsedQty = parseDecimal(quantity);
    const parsedCost = parseDecimal(cost);
    const parsedVat = parseDecimal(vat);
    if (parsedQty === null || parsedQty <= 0) {
      setError("A quantidade tem de ser superior a zero.");
      return;
    }
    if (!supplierId) {
      setError("Escolha o fornecedor.");
      return;
    }
    if (!invoice.trim()) {
      setError("Indique o número da fatura.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Data inválida.");
      return;
    }
    if (parsedCost === null || parsedCost < 0) {
      setError("Custo inválido.");
      return;
    }
    if (parsedVat === null || parsedVat < 0 || parsedVat > 100) {
      setError("IVA inválido.");
      return;
    }
    setPending(true);
    const result = await onSave({
      ref: ref.trim().toUpperCase(),
      quantity: parsedQty,
      supplierId,
      invoiceNumber: invoice.trim(),
      date,
      cost: parsedCost,
      vat: parsedVat,
      remember,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    writePurchaseMemory(remember ? { remember: true, supplierId, invoiceNumber: invoice.trim() } : null);
    onClose();
  }

  async function remove() {
    setPending(true);
    const result = await onRemove();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Entrada de stock" : "Dar entrada de stock"}</DialogTitle>
          <DialogDescription>
            {entry ? `Ligado à fatura ${entry.invoiceNumber}.` : "Opcional. A quantidade entra no stock deste artigo."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs">
            Tipologia
            <Input value="Produto (stock)" readOnly className="h-9 bg-[var(--paper)]" />
          </label>
          <label className="grid gap-1 text-xs">
            Referência
            <Input value={ref} onChange={(event) => setRef(event.target.value.toUpperCase())} className="h-9 bg-white font-mono uppercase" aria-label="Referência" />
          </label>
          <label className="grid gap-1 text-xs">
            Descrição
            <Input value={line.description} readOnly className="h-9 bg-[var(--paper)]" />
          </label>
          <label className="grid gap-1 text-xs">
            Quantidade a dar entrada
            <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" className="h-9" />
          </label>
          <div className="relative grid gap-1 text-xs">
            <label htmlFor="fornecedor-stock">Fornecedor</label>
            <Input
              id="fornecedor-stock"
              value={supplierQuery}
              placeholder="Procurar ou criar"
              autoComplete="off"
              onFocus={() => setListOpen(true)}
              onBlur={() => setListOpen(false)}
              onChange={(event) => {
                setSupplierQuery(event.target.value);
                setSupplierId("");
                setListOpen(true);
              }}
              className="h-9"
            />
            {listOpen ? (
              <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-40 overflow-auto rounded-lg border border-[var(--line)] bg-white py-1 shadow-lg">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full px-2 py-1.5 text-left hover:bg-[var(--mist)]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSupplierId(item.id);
                      setSupplierQuery(item.name);
                      setListOpen(false);
                    }}
                  >
                    {item.name}
                  </button>
                ))}
                {canCreate ? (
                  <button
                    type="button"
                    className="block w-full px-2 py-1.5 text-left font-medium text-[var(--glow)] hover:bg-[var(--mist)]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void createSupplier()}
                  >
                    Criar fornecedor «{supplierQuery.trim()}»
                  </button>
                ) : null}
                {!filtered.length && !canCreate ? <p className="px-2 py-1.5 text-[var(--steel)]">Sem fornecedores.</p> : null}
              </div>
            ) : null}
          </div>
          <label className="grid gap-1 text-xs">
            Nº fatura de compra
            <Input value={invoice} onChange={(event) => setInvoice(event.target.value)} className="h-9" />
          </label>
          <label className="grid gap-1 text-xs">
            Data da fatura
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-9" />
          </label>
          <label className="grid gap-1 text-xs">
            Custo unitário s/IVA
            <Input value={cost} onChange={(event) => setCost(event.target.value)} inputMode="decimal" className="h-9" />
          </label>
          <label className="grid gap-1 text-xs">
            IVA
            <Input value={vat} onChange={(event) => setVat(event.target.value)} inputMode="decimal" className="h-9" />
          </label>
          <label className="flex items-center gap-2 text-xs sm:col-span-2">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            Lembrar fornecedor e nº fatura
          </label>
        </div>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        <DialogFooter>
          {entry ? (
            <Button type="button" variant="outline" className="sm:mr-auto" disabled={pending} onClick={() => void remove()}>
              Retirar entrada
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" className="bg-[var(--glow)] hover:bg-[var(--glow-deep)]" disabled={pending} onClick={() => void save()}>
            {pending ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
