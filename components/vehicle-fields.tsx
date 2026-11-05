"use client";

import { useState } from "react";
import { PlateSearch } from "@/components/plate-search";
import { controlClass, Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { FUELS } from "@/lib/labels";
import type { PlateVehicle } from "@/lib/plates/types";

export function VehicleFields({
  clients,
  vehicle,
  clientId,
}: {
  clients: Array<{ id: string; name: string }>;
  clientId?: string;
  vehicle?: {
    clientId: string;
    plate: string;
    brand: string;
    model: string;
    version?: string;
    year: number;
    vin: string;
    engine?: string;
    km: number;
    fuel: string;
  };
}) {
  const [plate, setPlate] = useState(vehicle?.plate ?? "");
  const [brand, setBrand] = useState(vehicle?.brand ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [version, setVersion] = useState(vehicle?.version ?? "");
  const [year, setYear] = useState(vehicle?.year ? String(vehicle.year) : "");
  const [fuel, setFuel] = useState(vehicle?.fuel ?? "Gasolina");
  const [engine, setEngine] = useState(vehicle?.engine ?? "");
  const [vin, setVin] = useState(vehicle?.vin ?? "");

  function applyLookup(found: PlateVehicle) {
    setBrand(found.brand);
    setModel(found.model);
    setVersion(found.version);
    setYear(String(found.year));
    setFuel(found.fuel);
    setEngine(found.engine);
    setVin(found.vin ?? "");
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Cliente" className="md:col-span-2">
        <select name="clientId" required defaultValue={vehicle?.clientId ?? clientId ?? ""} className={controlClass}>
          <option value="">Escolher…</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
      </Field>
      <div className="md:col-span-2">
        <PlateSearch plate={plate} onPlateChange={setPlate} onFound={applyLookup} />
      </div>
      <Field label="Marca">
        <Input name="brand" required value={brand} onChange={(event) => setBrand(event.target.value)} className="h-10 bg-background" />
      </Field>
      <Field label="Modelo">
        <Input name="model" required value={model} onChange={(event) => setModel(event.target.value)} className="h-10 bg-background" />
      </Field>
      <Field label="Versão">
        <Input name="version" value={version} onChange={(event) => setVersion(event.target.value)} className="h-10 bg-background" />
      </Field>
      <Field label="Ano">
        <Input name="year" required value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" className="h-10 bg-background" />
      </Field>
      <Field label="Combustível">
        <select name="fuel" value={fuel} onChange={(event) => setFuel(event.target.value)} className={controlClass}>
          {FUELS.map((item) => <option key={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="Motor">
        <Input name="engine" value={engine} onChange={(event) => setEngine(event.target.value)} className="h-10 bg-background" />
      </Field>
      <Field label="Quilómetros">
        <Input name="km" defaultValue={vehicle?.km ?? 0} inputMode="numeric" className="h-10 bg-background" />
      </Field>
      <Field label="VIN" className="md:col-span-2" hint="17 caracteres, se o souber. Sem as letras I, O e Q.">
        <Input name="vin" value={vin} onChange={(event) => setVin(event.target.value.toUpperCase())} className="h-10 bg-background font-mono uppercase" />
      </Field>
    </div>
  );
}
