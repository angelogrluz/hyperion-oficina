"use client";

import { useState, useSyncExternalStore } from "react";
import { PinDialog } from "@/components/pin-dialog";
import { pinMatches, readUsers, subscribeAccess } from "@/lib/user-settings";
import { punch, readPunches, subscribeOps, writePunches, type Punch } from "@/lib/workshop-ops";

function stamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PontosPage() {
  const users = useSyncExternalStore(subscribeAccess, readUsers, readUsers).filter((user) => user.active && user.clocksIn);
  const punches = useSyncExternalStore(subscribeOps, readPunches, readPunches);
  const [userId, setUserId] = useState("");
  const [pinFor, setPinFor] = useState("");
  const [pinError, setPinError] = useState("");
  const [editing, setEditing] = useState<Punch | null>(null);
  const person = users.find((user) => user.id === userId);
  const rows = punches.filter((item) => item.userId === userId).sort((a, b) => a.inAt.localeCompare(b.inAt));

  return (
    <div data-testid="pagina-pontos" className="grid gap-4">
      <h1 className="text-[28px] font-semibold">Página de Pontos</h1>
      {!person ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {users.map((user) => (
            <button key={user.id} type="button" data-testid="ponto-nome" className="h-24 rounded-2xl bg-[var(--glow)] text-[28px] font-semibold text-white" onClick={() => { setPinFor(user.id); setPinError(""); }}>{user.name}</button>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="h-12 rounded-xl border px-4 text-[18px]" onClick={() => setUserId("")}>{person.name}</button>
            <button type="button" data-testid="ponto-registar" className="h-14 rounded-xl bg-[#1f9d55] px-4 text-[20px] font-semibold text-white" onClick={() => punch(person.id)}>{rows.some((item) => !item.outAt) ? "Registar saída" : "Registar entrada"}</button>
          </div>
          <ul className="divide-y rounded-xl border bg-white">
            {rows.map((row) => (
              <li key={row.id} data-testid="ponto-linha" className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-[18px]">
                <span>Entrada {new Date(row.inAt).toLocaleString("pt-PT")} · Saída {row.outAt ? new Date(row.outAt).toLocaleString("pt-PT") : "—"}</span>
                <button type="button" data-testid="ponto-editar" aria-label="Editar ponto" onClick={() => setEditing(row)}>✎</button>
              </li>
            ))}
          </ul>
          <button type="button" className="h-12 w-fit rounded-xl border px-4 text-[18px]" onClick={() => setEditing({ id: crypto.randomUUID(), userId: person.id, inAt: new Date().toISOString(), outAt: null })}>Adicionar ponto em falta</button>
        </div>
      )}
      {pinFor ? <PinDialog title={users.find((user) => user.id === pinFor)?.name ?? "PIN"} error={pinError} onClose={() => setPinFor("")} onSubmit={(pin) => { if (!pinMatches(pinFor, pin)) { setPinError("PIN incorreto ou ainda não definido."); return; } setUserId(pinFor); setPinFor(""); }} /> : null}
      {editing ? (
        <form data-testid="ponto-form" className="grid max-w-lg gap-2 rounded-xl border bg-white p-4" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const inAt = new Date(String(data.get("in"))).toISOString();
          const outRaw = String(data.get("out") ?? "");
          const next = { ...editing, inAt, outAt: outRaw ? new Date(outRaw).toISOString() : null };
          const all = readPunches();
          writePunches(all.some((item) => item.id === next.id) ? all.map((item) => item.id === next.id ? next : item) : [...all, next]);
          setEditing(null);
        }}>
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
