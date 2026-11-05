"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { saveAppointment } from "@/app/actions/appointments";
import { Field, Select } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const PRESETS = ["Revisão", "Diagnóstico", "Travões", "Entrega da viatura", "Alinhamento"];

export function AppointmentForm({
  date,
  clients,
  vehicles,
}: {
  date: string;
  clients: Array<{ id: string; name: string }>;
  vehicles: Array<{ id: string; clientId: string; plate: string; brand: string; model: string }>;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const owned = useMemo(() => vehicles.filter((vehicle) => vehicle.clientId === clientId), [vehicles, clientId]);

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await saveAppointment(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setError(null);
          setTitle("");
          toast.success("Marcação criada.");
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="date" value={date} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hora">
          <Input name="time" type="time" required defaultValue="09:00" className="h-10 bg-background" />
        </Field>
        <Field label="Duração">
          <Select name="duration" defaultValue="60">
            <option value="30">30 min</option>
            <option value="45">45 min</option>
            <option value="60">1 hora</option>
            <option value="90">1 h 30</option>
            <option value="120">2 horas</option>
            <option value="180">3 horas</option>
          </Select>
        </Field>
      </div>
      <Field label="Cliente">
        <Select name="clientId" required value={clientId} onChange={(event) => setClientId(event.target.value)}>
          <option value="">Escolher…</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Viatura">
        <Select name="vehicleId" defaultValue="">
          <option value="">Sem viatura</option>
          {owned.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.plate} · {vehicle.brand} {vehicle.model}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Motivo">
        <Input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required className="h-10 bg-background" />
      </Field>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button key={preset} type="button" className="rounded-full bg-muted px-2.5 py-1 text-xs" onClick={() => setTitle(preset)}>
            {preset}
          </button>
        ))}
      </div>
      <Field label="Notas">
        <Textarea name="notes" />
      </Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending} className="h-10">{pending ? "A marcar…" : "Marcar"}</Button>
    </form>
  );
}
