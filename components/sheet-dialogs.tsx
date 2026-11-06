"use client";

import { useState } from "react";
import { includesSearch, isValidNif, normalizeNif, parseDecimal } from "@/lib/domain";
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
          <Button type="button" className="bg-[#00a9fd] hover:bg-[#0096e0]" disabled={pending} onClick={() => void save()}>
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
}: {
  onClose: () => void;
  onSave: (data: ClientForm) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [name, setName] = useState("");
  const [nif, setNif] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
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
      notes: "",
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
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>Fica selecionado nesta folha de obra.</DialogDescription>
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
        </div>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" className="bg-[#00a9fd] hover:bg-[#0096e0]" disabled={pending} onClick={() => void save()}>
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
            Referência
            <Input value={line.ref} readOnly className="h-9 bg-[#f7f8fa] font-mono" />
          </label>
          <label className="grid gap-1 text-xs">
            Descrição
            <Input value={line.description} readOnly className="h-9 bg-[#f7f8fa]" />
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
              <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-40 overflow-auto rounded-lg border border-[#d5ebed] bg-white py-1 shadow-lg">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full px-2 py-1.5 text-left hover:bg-[#e7f7f8]"
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
                    className="block w-full px-2 py-1.5 text-left font-medium text-[#0b8f9c] hover:bg-[#e7f7f8]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void createSupplier()}
                  >
                    Criar fornecedor «{supplierQuery.trim()}»
                  </button>
                ) : null}
                {!filtered.length && !canCreate ? <p className="px-2 py-1.5 text-[#8d939c]">Sem fornecedores.</p> : null}
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
          <Button type="button" className="bg-[#00a9fd] hover:bg-[#0096e0]" disabled={pending} onClick={() => void save()}>
            {pending ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
