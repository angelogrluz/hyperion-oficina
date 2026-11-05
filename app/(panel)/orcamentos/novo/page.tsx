import { DocumentEditor } from "@/components/document-editor";
import { PageHeader } from "@/components/page-header";
import { addDays, editorCatalog } from "@/lib/editor-data";

export const metadata = { title: "Novo orçamento" };

export default async function NewQuotePage() {
  const catalog = await editorCatalog();
  return (
    <div>
      <PageHeader title="Novo orçamento" description="Quando o cliente aceitar, converta-o numa ordem de reparação." />
      <DocumentEditor
        mode="quote"
        savedStatus="aberto"
        locked={false}
        labourRate={catalog.labourRate}
        clients={catalog.clients}
        vehicles={catalog.vehicles}
        articles={catalog.articles}
        initial={{
          clientId: "",
          vehicleId: "",
          dateIn: catalog.today,
          dateOut: "",
          validUntil: addDays(catalog.today, 15),
          km: "",
          problem: "",
          notes: "",
          status: "aberto",
          lines: [],
        }}
      />
    </div>
  );
}
