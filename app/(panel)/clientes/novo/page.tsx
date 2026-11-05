import { saveClient } from "@/app/actions/records";
import { ClientFields } from "@/components/client-fields";
import { PageHeader } from "@/components/page-header";
import { SaveForm } from "@/components/save-form";

export const metadata = { title: "Novo cliente" };

export default function NewClientPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Novo cliente" description="O NIF é validado com o dígito de controlo português." />
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <SaveForm action={saveClient.bind(null, null)} nextBase="/clientes/">
          <ClientFields />
        </SaveForm>
      </div>
    </div>
  );
}
