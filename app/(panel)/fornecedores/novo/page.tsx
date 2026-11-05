import { saveSupplier } from "@/app/actions/records";
import { PageHeader } from "@/components/page-header";
import { SaveForm } from "@/components/save-form";
import { SupplierFields } from "@/components/supplier-fields";

export const metadata = { title: "Novo fornecedor" };

export default function NewSupplierPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Novo fornecedor" description="O NIF é opcional, mas se o indicar tem de ser válido." />
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <SaveForm action={saveSupplier.bind(null, null)} next={(id) => `/fornecedores/${id}`}>
          <SupplierFields />
        </SaveForm>
      </div>
    </div>
  );
}
