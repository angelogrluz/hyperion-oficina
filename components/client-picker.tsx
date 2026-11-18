"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, X } from "lucide-react";
import { matchClients, seedFromQuery, type ClientSeed, type SearchableClient, type SearchableVehicle } from "@/lib/client-search";

type Tone = "light" | "dark";

/**
 * Search box for clients: as you type, the matching clients appear to pick from.
 * When none fits, the last option opens the new-client form with what was typed.
 */
export function ClientSearch<T extends SearchableClient>({
  clients,
  vehicles,
  onPick,
  onCreate,
  disabled,
  tone = "light",
  placeholder = "Escreve o nome, NIF, telefone ou matrícula…",
  autoFocus,
}: {
  clients: T[];
  vehicles?: SearchableVehicle[];
  onPick: (client: T) => void;
  onCreate?: (seed: ClientSeed) => void;
  disabled?: boolean;
  tone?: Tone;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => matchClients(clients, query, vehicles), [clients, query, vehicles]);
  const typed = query.trim();
  const canCreate = Boolean(onCreate && typed);
  const options = matches.length + (canCreate ? 1 : 0);
  const showList = open && typed.length > 0 && !disabled;
  const [place, setPlace] = useState<{ style: CSSProperties; host: Element } | null>(null);

  // The list floats over everything (side panels clip their content), placed under the box or above it when there is no room.
  useLayoutEffect(() => {
    if (!showList) return;
    function measure() {
      const box = inputRef.current?.getBoundingClientRect();
      if (!box) return;
      const width = Math.max(box.width, 300);
      const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
      const below = window.innerHeight - box.bottom - 8;
      const above = box.top - 8;
      const up = below < 220 && above > below;
      const maxHeight = Math.max(160, Math.min(320, (up ? above : below) - 4));
      const host = inputRef.current?.closest("[data-theme]") ?? document.body;
      setPlace({
        host,
        style: up
          ? { position: "fixed", left, width, bottom: window.innerHeight - box.top + 4, maxHeight }
          : { position: "fixed", left, width, top: box.bottom + 4, maxHeight },
      });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [showList, typed]);

  function pick(client: T) {
    setQuery("");
    setOpen(false);
    setHighlight(0);
    onPick(client);
  }

  function create() {
    if (!onCreate || !typed) return;
    const seed = seedFromQuery(typed);
    setQuery("");
    setOpen(false);
    setHighlight(0);
    onCreate(seed);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && options) {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => (current + 1) % options);
    } else if (event.key === "ArrowUp" && options) {
      event.preventDefault();
      setHighlight((current) => (current - 1 + options) % options);
    } else if (event.key === "Enter") {
      if (!typed) return;
      event.preventDefault();
      const chosen = matches[highlight];
      if (chosen) pick(chosen);
      else if (canCreate) create();
    } else if (event.key === "Escape") {
      if (query) setQuery("");
      setOpen(false);
    }
  }

  const inputClass = tone === "dark"
    ? "h-8 w-full rounded border-0 bg-white pr-7 pl-7 text-[16px] text-[var(--charcoal)] placeholder:text-[#7a8590]"
    : "h-10 w-full rounded-lg border border-input bg-background pr-8 pl-8 text-[16px] text-foreground";

  return (
    <div className="relative">
      <Search aria-hidden className={`pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-[#7a8590] ${tone === "dark" ? "left-2" : "left-2.5"}`} />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Procurar cliente"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        data-testid="procurar-cliente"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={inputClass}
      />
      {query && !disabled ? (
        <button
          type="button"
          aria-label="Apagar pesquisa"
          title="Apagar pesquisa"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { setQuery(""); inputRef.current?.focus(); }}
          className={`absolute top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-[#7a8590] hover:text-[var(--charcoal)] ${tone === "dark" ? "right-1" : "right-1.5"}`}
        >
          <X className="size-4" />
        </button>
      ) : null}
      {showList && place ? createPortal(
        <ul
          id={listId}
          role="listbox"
          data-testid="sugestoes-cliente"
          style={place.style}
          className="z-[100] overflow-y-auto rounded-lg border border-[var(--line)] bg-popover p-1 text-[16px] text-popover-foreground shadow-lg"
        >
          {matches.map((client, index) => (
            <li key={client.id} role="option" aria-selected={highlight === index}>
              <button
                type="button"
                data-testid="sugestao-cliente"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(client)}
                className={`grid w-full rounded px-2 py-1.5 text-left ${highlight === index ? "bg-[#428ac8]/20" : ""}`}
              >
                <span className="font-semibold">{client.name}</span>
                <span className="text-[14px] text-muted-foreground">
                  {[client.nif ? `NIF ${client.nif}` : "", client.phone ?? "", client.email ?? ""].filter(Boolean).join(" · ") || "Sem NIF nem contactos"}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 ? (
            <li className="px-2 py-1.5 text-[15px] text-muted-foreground">Nenhum cliente com «{typed}».</li>
          ) : null}
          {canCreate ? (
            <li role="option" aria-selected={highlight === matches.length}>
              <button
                type="button"
                data-testid="criar-cliente-pesquisa"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(matches.length)}
                onClick={create}
                className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left font-semibold text-[var(--glow)] ${highlight === matches.length ? "bg-[#428ac8]/20" : ""}`}
              >
                <Plus className="size-4 shrink-0" />
                Criar cliente novo «{typed}»
              </button>
            </li>
          ) : null}
        </ul>,
        place.host,
      ) : null}
    </div>
  );
}

/** The chosen client with a button to remove it, or the search box when none is chosen. */
export function ClientPicker<T extends SearchableClient>({
  clients,
  vehicles,
  value,
  onChange,
  onCreate,
  disabled,
}: {
  clients: T[];
  vehicles?: SearchableVehicle[];
  value: string;
  onChange: (id: string) => void;
  onCreate?: (seed: ClientSeed) => void;
  disabled?: boolean;
}) {
  const selected = clients.find((client) => client.id === value);
  if (!selected) {
    return <ClientSearch clients={clients} vehicles={vehicles} onPick={(client) => onChange(client.id)} onCreate={onCreate} disabled={disabled} />;
  }
  return (
    <div data-testid="cliente-escolhido" className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-1.5">
      <span className="min-w-0">
        <span className="block truncate font-semibold">{selected.name}</span>
        {selected.nif ? <span className="block text-[14px] text-muted-foreground">NIF {selected.nif}</span> : null}
      </span>
      {disabled ? null : (
        <button
          type="button"
          data-testid="limpar-cliente"
          aria-label="Limpar cliente"
          title="Limpar cliente"
          onClick={() => onChange("")}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-input px-2 text-[15px] hover:bg-muted"
        >
          <X className="size-4" />
          Limpar
        </button>
      )}
    </div>
  );
}
