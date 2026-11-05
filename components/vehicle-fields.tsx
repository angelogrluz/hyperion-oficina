import { controlClass, Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { FUELS } from "@/lib/labels";

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
    year: number;
    vin: string;
    km: number;
    fuel: string;
  };
}) {
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
      <Field label="Matrícula" hint="Formato AA-00-AA. Pode escrever sem hífens.">
        <Input name="plate" required defaultValue={vehicle?.plate} className="h-10 bg-background font-mono uppercase" />
      </Field>
      <Field label="Combustível">
        <select name="fuel" defaultValue={vehicle?.fuel ?? "Gasolina"} className={controlClass}>
          {FUELS.map((fuel) => <option key={fuel}>{fuel}</option>)}
        </select>
      </Field>
      <Field label="Marca">
        <Input name="brand" required defaultValue={vehicle?.brand} className="h-10 bg-background" />
      </Field>
      <Field label="Modelo">
        <Input name="model" required defaultValue={vehicle?.model} className="h-10 bg-background" />
      </Field>
      <Field label="Ano">
        <Input name="year" required defaultValue={vehicle?.year} inputMode="numeric" className="h-10 bg-background" />
      </Field>
      <Field label="Quilómetros">
        <Input name="km" defaultValue={vehicle?.km ?? 0} inputMode="numeric" className="h-10 bg-background" />
      </Field>
      <Field label="VIN" className="md:col-span-2" hint="17 caracteres, se o souber. Sem as letras I, O e Q.">
        <Input name="vin" defaultValue={vehicle?.vin} className="h-10 bg-background font-mono uppercase" />
      </Field>
    </div>
  );
}
