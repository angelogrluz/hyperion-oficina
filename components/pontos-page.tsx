"use client";

import { useState, useSyncExternalStore } from "react";
import { readUsers, subscribeAccess } from "@/lib/user-settings";
import { readPunches, subscribeOps, writePunches, type Punch } from "@/lib/workshop-ops";

function stamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function when(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-PT");
}

export function PontosPage() {
  const users = useSyncExternalStore(subscribeAccess, readUsers, readUsers).filter((user) => user.active && user.clocksIn);
  const punches = useSyncExternalStore(subscribeOps, readPunches, readPunches);
  const [editing, setEditing] = useState<Punch | null>(null);
  const named = new Map(users.map((user) => [user.id, user.name]));
  const rows = [...punches].sort((a, b) => b.inAt.localeCompare(a.inAt));

  return (
    <div data-testid="pagina-pontos" className="grid gap-4">
      <div>
        <h1 className="text-[28px] font-semibold">Pontos</h1>
        <p className="text-[16px] text-[var(--muted-text)]">{rows.length === 1 ? "1 picagem." : `${rows.length} picagens.`} Entradas e saídas do modo oficina.</p>
      </div>
      {rows.length === 0 ? <p className="rounded-xl border border-[var(--line)] bg-white px-4 py-6 text-[16px] text-[var(--muted-text)]">Ainda não há picagens. No tablet, em Modo oficina, usa «Picar o ponto».</p> : (
        <ul className="divide-y rounded-xl border border-[var(--line)] bg-white">
          {rows.map((row) => (
            <li key={row.id} data-testid="ponto-linha" className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-[18px]">
              <span>
                <span className="block font-semibold">{named.get(row.userId) || "Colaborador"}</span>
                <span className="text-[16px] text-[var(--muted-text)]">Entrada {when(row.inAt)} · Saída {when(row.outAt)}</span>
              </span>
              <button type="button" data-testid="ponto-editar" aria-label="Editar ponto" onClick={() => setEditing(row)} className="h-10 rounded-lg border px-3">Editar</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="h-12 w-fit rounded-xl border px-4 text-[18px]" onClick={() => setEditing({ id: crypto.randomUUID(), userId: users[0]?.id ?? "", inAt: new Date().toISOString(), outAt: null })}>Adicionar ponto em falta</button>
      {editing ? (
        <form data-testid="ponto-form" className="grid max-w-lg gap-2 rounded-xl border bg-white p-4" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const inAt = new Date(String(data.get("in"))).toISOString();
          const outRaw = String(data.get("out") ?? "");
          const userId = String(data.get("user") ?? editing.userId);
          const next = { ...editing, userId, inAt, outAt: outRaw ? new Date(outRaw).toISOString() : null };
          const all = readPunches();
          writePunches(all.some((item) => item.id === next.id) ? all.map((item) => item.id === next.id ? next : item) : [...all, next]);
          setEditing(null);
        }}>
          <label className="text-[16px]">Colaborador
            <select name="user" defaultValue={editing.userId} className="mt-1 h-12 w-full rounded-lg border px-2 text-[18px]">
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label className="text-[16px]">Entrada<input name="in" type="datetime-local" defaultValue={stamp(editing.inAt)} className="mt-1 h-12 w-full rounded-lg border px-2 text-[18px]" /></label>
          <label className="text-[16px]">Saída<input name="out" type="datetime-local" defaultValue={editing.outAt ? stamp(editing.outAt) : ""} className="mt-1 h-12 w-full rounded-lg border px-2 text-[18px]" /></label>
          <div className="flex gap-2">
            <button className="h-12 rounded-xl bg-[var(--glow)] px-4 font-semibold text-white">Guardar ponto</button>
            <button type="button" className="h-12 rounded-xl border px-4" onClick={() => setEditing(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
