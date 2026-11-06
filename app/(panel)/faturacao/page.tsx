import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SimulationBanner } from "@/components/simulation-banner";
import { prisma } from "@/lib/db";
import { formatEUR, formatMediumDate } from "@/lib/format";
import { getInvoiceAdapter } from "@/lib/invoice";
import type { InvoiceDraft } from "@/lib/invoice/types";

export const metadata = { title: "Faturação" };

export default async function BillingPage() {
  const adapter = getInvoiceAdapter();
  const logs = await prisma.invoiceLog.findMany({
    include: { order: { include: { client: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Faturação"
        description="Camada de integração. O botão Faturar de uma ordem concluída envia o documento ao adaptador e guarda o número devolvido."
      />
      <SimulationBanner />
      <section className="mt-5 grid gap-3 md:grid-cols-3">
        <article className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">Adaptador ativo</p>
          <p className="mt-1 text-lg font-semibold">{adapter.label}</p>
          <p className="text-sm text-muted-foreground">{adapter.simulated ? "Sem comunicação com a AT." : "Modo certificado."}</p>
        </article>
        <article className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">Identificador</p>
          <p className="mt-1 font-mono text-lg">{adapter.id}</p>
          <p className="text-sm text-muted-foreground">Variável INVOICE_PROVIDER</p>
        </article>
        <article className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">Documentos emitidos</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{logs.length}</p>
          <p className="text-sm text-muted-foreground">Todos simulados nesta instalação.</p>
        </article>
      </section>
      <section className="mt-6 grid gap-3">
        {logs.map((log) => {
          const draft = JSON.parse(log.requestJson) as InvoiceDraft;
          return (
            <article key={log.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{log.documentNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {log.providerLabel} · {formatMediumDate(log.createdAt)} · {log.order.client?.name ?? "Sem cliente"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium tabular-nums">{formatEUR(draft.totals.total)}</p>
                  <Link href={`/ordens/${log.orderId}`} className="text-sm text-primary">{log.order.number}</Link>
                </div>
              </div>
              {log.simulated ? (
                <p className="mt-2 text-sm text-amber-800">Simulação — sem validade fiscal.</p>
              ) : null}
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Pedido enviado ao adaptador</summary>
                <pre className="mt-2 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(draft, null, 2)}</pre>
              </details>
            </article>
          );
        })}
        {logs.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há documentos. Conclua uma ordem e use Faturar.</p> : null}
      </section>
    </div>
  );
}
