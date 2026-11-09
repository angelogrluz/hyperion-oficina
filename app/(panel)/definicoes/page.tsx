import { EcolubSettings } from "@/components/ecolub-settings";
import { prisma } from "@/lib/db";
import { formatEUR } from "@/lib/format";

export const metadata = { title: "Parametrização" };

export default async function SettingsPage() {
  const workshop = await prisma.workshop.findUnique({ where: { id: "default" } });
  if (!workshop) return null;
  const sections = [
    ["Dados Gerais da Empresa", `${workshop.legalName} · NIF ${workshop.nif} · ${workshop.address}, ${workshop.postalCode} ${workshop.city}`],
    ["Preço/Hora Serviço da Empresa", formatEUR(workshop.labourRate)],
    ["Contacto", `${workshop.phone} · ${workshop.email}`],
    ["Faturação", "Adaptador Moloni em simulação. Sem certificação da AT."],
    ["ECOLUB", "Taxa por litro nas compras e nas folhas de óleo."],
    ["Consulta de matrículas", "Adaptador simulado. Uma API paga portuguesa pode substituí-lo."],
  ];
  return (
    <section className="max-w-3xl">
      <h1 className="mb-3 text-lg font-semibold">Parametrização Geral da Empresa</h1>
      <div className="divide-y divide-[#d5ebed] rounded-xl border border-[#d5ebed] bg-white">
        {sections.map(([title, body]) => (
          <details key={title} open className="px-4 py-3">
            <summary className="cursor-pointer font-medium text-[#0b8f9c]">{title}</summary>
            <p className="mt-2 text-sm text-[#4d6d73]">{body}</p>
          </details>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-[#d5ebed] bg-white p-4">
        <EcolubSettings />
      </div>
    </section>
  );
}
