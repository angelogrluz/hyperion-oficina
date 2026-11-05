import { DocumentEditor } from "@/components/document-editor";
import { PageHeader } from "@/components/page-header";
import { editorCatalog } from "@/lib/editor-data";

export const metadata = { title: "Nova ordem" };

export default async function NewOrderPage() {
  const catalog = await editorCatalog();
  return (
    <div>
      <PageHeader title="Nova ordem de reparação" description="Cliente, viatura, problema e as linhas de mão de obra e peças." />
      <DocumentEditor
        mode="order"
        savedStatus="aberta"
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
          validUntil: "",
          km: "",
          problem: "",
          notes: "",
          status: "aberta",
          lines: [],
        }}
      />
    </div>
  );
}
