import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function SupplierFields({
  supplier,
}: {
  supplier?: { name: string; nif: string; phone: string; email: string; address: string; notes: string };
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Nome" className="md:col-span-2">
        <Input name="name" required defaultValue={supplier?.name} className="h-10 bg-background" />
      </Field>
      <Field label="NIF">
        <Input name="nif" defaultValue={supplier?.nif} className="h-10 bg-background" />
      </Field>
      <Field label="Telefone">
        <Input name="phone" defaultValue={supplier?.phone} className="h-10 bg-background" />
      </Field>
      <Field label="E-mail" className="md:col-span-2">
        <Input name="email" type="email" defaultValue={supplier?.email} className="h-10 bg-background" />
      </Field>
      <Field label="Morada" className="md:col-span-2">
        <Textarea name="address" defaultValue={supplier?.address} />
      </Field>
      <Field label="Notas" className="md:col-span-2">
        <Textarea name="notes" defaultValue={supplier?.notes} />
      </Field>
    </div>
  );
}
