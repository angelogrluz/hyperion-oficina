"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { convertAppointment, deleteAppointment, saveAppointment } from "@/browser/src/shims/appointments";
import { readServiceTypes, subscribeServiceTypes } from "@/lib/booking-settings";
import { lisbonISODate, lisbonTime } from "@/lib/format";
type Person = { id: string; name: string };
type Vehicle = { id: string; clientId: string | null; plate: string; brand: string; model: string };
type Slot = {
  id: string;
  startsAt: string;
  endsAt: string;
  clientId: string;
  vehicleId: string | null;
  title: string;
  notes: string;
  orderId?: string | null;
};

function shift(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function mondayOf(iso: string) {
  const weekday = (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
  return shift(iso, -weekday);
}

const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const STARTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"];

export function AgendaPage({ appointments, clients, vehicles, today }: { appointments: Slot[]; clients: Person[]; vehicles: Vehicle[]; today: string }) {
  const router = useRouter();
  const types = useSyncExternalStore(subscribeServiceTypes, readServiceTypes, () => readServiceTypes());
  const [cursor, setCursor] = useState(today);
  const [view, setView] = useState<"semana" | "dia">("semana");
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const week = mondayOf(cursor);
  const days = DAYS.map((label, index) => ({ label, iso: shift(week, index) }));
  const shown = view === "dia" ? days.filter((day) => day.iso === cursor) : days;
  const cars = vehicles.filter((vehicle) => vehicle.clientId === clientId);
  const chosen = types.find((item) => item.id === typeId) ?? types.find((item) => item.active);
  const outside = useMemo(() => appointments.filter((item) => {
    const iso = lisbonISODate(new Date(item.startsAt));
    const clock = lisbonTime(new Date(item.startsAt));
    const weekday = (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
    return weekday > 4 || clock < "09:00" || (clock >= "13:00" && clock < "14:30") || clock >= "18:00";
  }), [appointments]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!chosen) { setError("Cria um tipo de serviço em Configurações."); return; }
    const data = new FormData();
    data.set("clientId", clientId);
    data.set("vehicleId", vehicleId);
    data.set("title", chosen.name);
    data.set("duration", String(chosen.minutes));
    data.set("date", date);
    data.set("time", time);
    data.set("notes", "");
    const result = await saveAppointment(data);
    if (!result.ok) { setError(result.error); return; }
    setError("");
    router.refresh();
  }

  async function openOrder(id: string) {
    const result = await convertAppointment(id);
    if (!result.ok) { setError(result.error); return; }
    router.push(`/ordens/${result.id}`);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
          <div className="flex items-center gap-2 text-[16px]">
            <button type="button" className="rounded-md px-2 py-1 hover:bg-[var(--mist)]" onClick={() => setCursor(shift(view === "dia" ? cursor : week, view === "dia" ? -1 : -7))}>‹</button>
            <span className="font-medium">{view === "dia" ? cursor : `Semana de ${days[0].iso}`}</span>
            <button type="button" className="rounded-md px-2 py-1 hover:bg-[var(--mist)]" onClick={() => setCursor(shift(view === "dia" ? cursor : week, view === "dia" ? 1 : 7))}>›</button>
          </div>
          <div className="flex gap-2">
            <button type="button" className={`h-9 rounded-lg px-3 text-[15px] ${view === "dia" ? "bg-[var(--glow)] text-white" : "bg-[#f4f6f8]"}`} onClick={() => setView("dia")}>Dia</button>
            <button type="button" className={`h-9 rounded-lg px-3 text-[15px] ${view === "semana" ? "bg-[var(--glow)] text-white" : "bg-[#f4f6f8]"}`} onClick={() => setView("semana")}>Semana</button>
            <button type="button" className="h-9 rounded-lg px-3 text-[15px] text-[var(--glow)]" onClick={() => { setCursor(today); setDate(today); }}>Hoje</button>
          </div>
        </div>
        <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `72px repeat(${Math.max(shown.length, 1)}, minmax(0,1fr))` }}>
          <div />
          {shown.map((day) => (
            <button key={day.iso} type="button" onClick={() => { setCursor(day.iso); setDate(day.iso); setView("dia"); }} className={`border-l border-[var(--line)] px-2 py-2 text-center text-[15px] ${day.iso === date ? "bg-[var(--glow)] text-white" : "bg-[var(--mist)]"}`}>
              {day.label} {Number(day.iso.slice(8))}
            </button>
          ))}
          {STARTS.map((clock) => (
            <div key={clock} className="contents">
              <div className="border-t border-[var(--line)] px-2 py-2 text-[13px] text-[var(--muted-text)]">{clock}</div>
              {shown.map((day) => {
                const items = appointments.filter((item) => lisbonISODate(new Date(item.startsAt)) === day.iso && lisbonTime(new Date(item.startsAt)) === clock);
                return (
                  <div key={`${day.iso}-${clock}`} className="min-h-12 border-t border-l border-[var(--line)] p-1">
                    {items.map((item) => {
                      const client = clients.find((person) => person.id === item.clientId);
                      const vehicle = vehicles.find((car) => car.id === item.vehicleId);
                      return (
                        <div key={item.id} data-testid="marcacao" className="rounded-lg bg-[var(--mist)] px-2 py-1 text-[14px] text-[var(--ink)]">
                          <p className="font-semibold">{item.title}</p>
                          <p>{client?.name} · {vehicle ? `${vehicle.plate}` : "sem viatura"}</p>
                          <div className="mt-1 flex gap-2">
                            {item.orderId ? <a className="underline" href={`${import.meta.env.BASE_URL}ordens/${item.orderId}`}>Abrir obra</a> : <button type="button" className="underline" onClick={() => void openOrder(item.id)}>Passar a obra</button>}
                            <button type="button" className="text-[#d64545]" onClick={() => void deleteAppointment(item.id).then(() => router.refresh())}>Apagar</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {outside.length ? (
          <div className="border-t border-[var(--line)] px-3 py-2 text-[15px]">
            <p className="font-semibold">Marcações fora do horário habitual</p>
            <ul className="mt-1 grid gap-1">
              {outside.map((item) => <li key={item.id}>{lisbonISODate(new Date(item.startsAt))} {lisbonTime(new Date(item.startsAt))} · {item.title}</li>)}
            </ul>
          </div>
        ) : null}
      </section>
      <form data-testid="nova-marcacao" className="grid h-fit gap-2 rounded-xl border border-[var(--line)] bg-white p-3" onSubmit={(event) => void create(event)}>
        <h2 className="text-[20px] font-semibold">Nova marcação</h2>
        <label className="text-[15px]">Cliente
          <select required value={clientId} onChange={(event) => { setClientId(event.target.value); setVehicleId(""); }} className="mt-1 h-11 w-full rounded-lg border px-2">
            <option value="">Escolhe</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className="text-[15px]">Viatura
          <select required value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-2">
            <option value="">Escolhe</option>
            {cars.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.brand} {vehicle.model}</option>)}
          </select>
        </label>
        <label className="text-[15px]">Tipo de serviço
          <select value={typeId} onChange={(event) => setTypeId(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-2">
            {types.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.minutes} min</option>)}
          </select>
        </label>
        <label className="text-[15px]">Dia
          <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-2" />
        </label>
        <label className="text-[15px]">Hora
          <select value={time} onChange={(event) => setTime(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-2">
            {STARTS.map((clock) => <option key={clock}>{clock}</option>)}
          </select>
        </label>
        <p className="text-[14px] text-[var(--muted-text)]">A duração vem do tipo de serviço. A vaga tem de caber entre 9:00–13:00 ou 14:30–18:00, de segunda a sexta.</p>
        {error ? <p className="text-[15px] text-[#d64545]">{error}</p> : null}
        <button className="h-11 rounded-xl bg-[var(--glow)] font-semibold text-white">Marcar</button>
      </form>
    </div>
  );
}
