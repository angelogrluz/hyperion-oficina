import { saveVehicle } from "@/app/actions/records";
import { PageHeader } from "@/components/page-header";
import { SaveForm } from "@/components/save-form";
import { VehicleFields } from "@/components/vehicle-fields";
import { prisma } from "@/lib/db";

export const metadata = { title: "Nova viatura" };

export default async function NewVehiclePage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="max-w-2xl">
      <PageHeader title="Nova viatura" description="A matrícula atual portuguesa, no formato AA-00-AA." />
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <SaveForm action={saveVehicle.bind(null, null)} next={(id) => `/viaturas/${id}`}>
          <VehicleFields clients={clients} clientId={cliente} />
        </SaveForm>
      </div>
    </div>
  );
}
