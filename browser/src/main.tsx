import { StrictMode, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { Toaster } from "sonner";
import { JobBoard } from "@/components/job-board";
import { LoginForm } from "@/components/login-form";
import { CloudLogin } from "@/components/cloud-login";
import { ImportBanner } from "@/components/import-banner";
import { Logo } from "@/components/logo";
import { PageHeader } from "@/components/page-header";
import { PurchaseGrid } from "@/components/purchase-grid";
import { StockMovements } from "@/components/stock-movements";
import { SaveForm } from "@/components/save-form";
import { Shell } from "@/components/shell";
import { SimulationBanner } from "@/components/simulation-banner";
import { TableShell, Td, Th } from "@/components/table-shell";
import { VehicleFields } from "@/components/vehicle-fields";
import { DocumentEditor } from "@/components/document-editor";
import { DocumentPaper } from "@/components/document-paper";
import { WorkshopSettings } from "@/components/workshop-settings";
import { OficinaMode, TechnicianStatus, type OficinaOrder } from "@/components/oficina-mode";
import { AgendaPage } from "@/components/agenda-page";
import { ResultsPage } from "@/components/results-page";
import { ClientAccount, invoiceTotal } from "@/components/client-account";
import { PontosPage } from "@/components/pontos-page";
import { companyDisplayName } from "@/lib/company-settings";
import { FolhaPrint } from "@/components/folha-print";
import { FolhaServicos } from "@/components/folha-servicos";
import { PrintButton } from "@/components/print-button";
import { lineAmounts, salePrice, sumTotals } from "@/lib/domain";
import { orderToPrintable } from "@/lib/printable";
import { formatEUR, formatMediumDate, lisbonISODate, lisbonParts, lisbonTime } from "@/lib/format";
import { normalizeApproval, APPROVAL_LABEL, type Approval } from "@/lib/approval";
import { resolveLineIdentity } from "@/lib/line-ref";
import { jobPresentation, orderTotal, shellTotals } from "@/lib/job-status";
import { readSession } from "./shims/auth";
import { bootCloud, cloudConfigured, readCloudUser, subscribeCloud } from "./cloud";
import { saveClient, saveVehicle } from "./shims/records";
import { clearWorkshopCache } from "@/lib/browser-cache";
import { readSnapshot, resetDemo, subscribeSnapshot, type Snapshot } from "./store";
import { AppUpdates } from "./updates";
import "./styles.css";

function useSnap() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      void readSnapshot().then((next) => {
        if (alive) setSnap(next);
      });
    };
    load();
    const unsubscribe = subscribeSnapshot(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return snap;
}

function ResetButton() {
  return (
    <button
      type="button"
      className="mb-2 w-full rounded-lg bg-white px-2 py-2 text-left text-xs font-semibold text-[#0b8f9c]"
      onClick={() => {
        if (!window.confirm("Repor dados de demonstração? As alterações neste browser serão apagadas.")) return;
        clearWorkshopCache();
        void resetDemo().then(() => window.location.assign(import.meta.env.BASE_URL));
      }}
    >
      Repor dados de demonstração
    </button>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const session = readSession();
  const snap = useSnap();
  const pathname = usePathname();
  const onSheet = /^\/ordens\/.+/.test(pathname);
  if (!session) return <Navigate to="/entrar" replace />;
  if (!snap) return <p className="p-8 text-sm text-[#4d6d73]">A carregar a oficina…</p>;
  const totals = shellTotals(snap.orders.map((order) => ({
    status: order.status,
    dateIn: new Date(order.dateIn),
    lines: snap.lines.filter((line) => line.orderId === order.id),
  })));
  return (
    <Shell user={{ name: session.name, email: session.email ?? "" }} totals={totals} footerExtra={cloudConfigured() ? null : <ResetButton />}>
      <ImportBanner />
      {onSheet ? null : (
        <p className="mb-2 bg-[#e7f7f8] px-2 py-1 text-[17px] text-[#0b5f68]">
          {cloudConfigured() ? "OficinaPlan. Os dados da oficina estão na tua conta." : "Servidor não configurado. Os dados ficam neste computador."}
        </p>
      )}
      {children}
    </Shell>
  );
}

function Home() {
  const snap = useSnap();
  const [filter, setFilter] = useState<Approval | "todas">("todas");
  if (!snap) return null;
  const jobs = snap.orders
    .filter((order) => order.status !== "faturada")
    .map((order) => {
      const vehicle = snap.vehicles.find((item) => item.id === order.vehicleId);
      const lines = snap.lines.filter((line) => line.orderId === order.id);
      const status = jobPresentation(order.status);
      const approval = normalizeApproval(order.approval, order.status);
      return {
        id: order.id,
        href: `/ordens/${order.id}`,
        plate: vehicle?.plate ?? "",
        model: `${vehicle?.brand ?? ""} ${vehicle?.model ?? ""}`.trim(),
        status: status.label,
        approval,
        approvalAt: order.approvalAt,
        approved: approval === "aprovado",
        total: orderTotal(lines),
        date: `${formatMediumDate(new Date(order.dateIn))} ${lisbonTime(new Date(order.dateIn))}`,
      };
    })
    .filter((job) => filter === "todas" || job.approval === filter);
  const filters: Array<Approval | "todas"> = ["todas", "aguarda", "aprovado", "recusado"];
  return (
    <div>
      <SimulationBanner />
      <div className="mt-4 flex flex-wrap gap-2" data-testid="approval-filters">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            data-testid={`filter-${item}`}
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
            className={`h-10 rounded-full px-4 text-[17px] font-semibold ${filter === item ? "bg-[#22272a] text-white" : "bg-white text-[#22272a] ring-1 ring-[#e1e2e5]"}`}
          >
            {item === "todas" ? "Todas" : APPROVAL_LABEL[item]}
          </button>
        ))}
      </div>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>{jobs.length === 0 ? <p className="text-sm text-[#8d939c]">Nenhuma obra neste estado.</p> : <JobBoard jobs={jobs} />}</div>
        <TechnicianStatus orders={ordersForOficina(snap)} />
      </div>
    </div>
  );
}

function editorCatalog(snap: Snapshot) {
  return {
    labourRate: snap.workshop.labourRate,
    clients: snap.clients.map((client) => ({
      id: client.id,
      name: client.name,
      nif: client.nif,
      phone: client.phone,
      email: client.email,
      address: client.address,
      postalCode: client.postalCode,
      city: client.city,
      notes: client.notes,
    })),
    vehicles: snap.vehicles.map((vehicle) => ({
      id: vehicle.id,
      clientId: vehicle.clientId,
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      version: vehicle.version,
      year: vehicle.year,
      vin: vehicle.vin,
      engine: vehicle.engine,
      engineCode: vehicle.engineCode ?? "",
      oil: vehicle.oil ?? "",
      nextInspection: vehicle.nextInspection ?? "",
      nextService: vehicle.nextService ?? "",
      km: vehicle.km,
      fuel: vehicle.fuel,
    })),
    articles: snap.articles.filter((article) => article.active).map((article) => ({
      id: article.id,
      ref: article.ref,
      description: article.description,
      costPrice: article.costPrice,
      marginPercent: article.marginPercent,
      vatRate: article.vatRate,
      stockQty: article.stockQty,
      family: article.family,
      isOil: article.isOil,
    })),
    suppliers: snap.suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name })),
  };
}

function linesFor(snap: Snapshot, orderId: string) {
  return snap.lines
    .filter((line) => line.orderId === orderId)
    .sort((a, b) => a.position - b.position)
    .map((line) => {
      const identity = resolveLineIdentity(line, snap.articles, snap.purchaseLines);
      return {
        key: line.id,
        kind: line.kind === "mao_de_obra" ? "mao_de_obra" as const : "peca" as const,
        description: line.description,
        quantity: String(line.quantity).replace(".", ","),
        unitPrice: String(line.unitPrice).replace(".", ","),
        unitCost: String(line.unitCost).replace(".", ","),
        discount: String(line.discountPercent ?? 0).replace(".", ","),
        vatRate: String(line.vatRate).replace(".", ","),
        note: line.internalNote ?? "",
        articleId: identity.articleId,
        ref: identity.ref,
        stockEntry: line.stockEntry ?? null,
      };
    });
}

function syntheticLines() {
  const row = (key: string, kind: "mao_de_obra" | "peca", description: string, quantity: string, unitPrice: string, unitCost: string, ref: string) => ({
    key, kind, description, quantity, unitPrice, unitCost, discount: "0", vatRate: "23", note: "", articleId: null, ref,
  });
  return [
    row("v1", "mao_de_obra", "DIAGNÓSTICO DE SUSPENSÃO", "0,50", "45,00", "0,00", ""),
    row("v2", "peca", "FILTRO DE ÓLEO", "1,00", "8,84", "6,80", "FLT-OL"),
    row("v3", "mao_de_obra", "SUBSTITUIÇÃO DE PASTILHAS", "0,50", "45,00", "0,00", ""),
    row("v4", "peca", "PASTILHAS DIANTEIRAS", "1,00", "42,38", "28,50", "PST-FR"),
    row("v5", "peca", "ÓLEO MOTOR 5W30", "4,00", "8,84", "6,80", "OLEO-5W30"),
  ];
}

function OrderScreen() {
  const { id } = useParams();
  const vitrine = new URLSearchParams(useLocation().search).get("vitrine") === "1" || sessionStorage.getItem("hyperion-vitrine") === "1";
  const snap = useSnap();
  if (!snap || !id) return null;
  const order = snap.orders.find((item) => item.id === id);
  if (!order) return <p>Obra não encontrada.</p>;
  const catalog = editorCatalog(snap);
  return (
    <DocumentEditor
      key={order.id}
      mode="order"
      documentId={order.id}
      number={order.number}
      savedStatus={order.status}
      locked={order.status === "faturada"}
      userName="Rita Almeida"
      labourRate={catalog.labourRate}
      clients={catalog.clients}
      vehicles={catalog.vehicles}
      articles={catalog.articles}
      suppliers={catalog.suppliers}
      invoice={order.invoiceNumber ? { number: order.invoiceNumber, provider: order.invoiceProvider ?? "Simulação" } : null}
      paid={Boolean(order.paidAt)}
      quoteNumber={order.quoteNumber ?? null}
      quoteUrl={order.quoteUrl ?? null}
      invoiceUrl={order.invoiceUrl ?? null}
      initial={{
        clientId: order.clientId ?? "",
        vehicleId: order.vehicleId ?? "",
        dateIn: lisbonISODate(new Date(order.dateIn)),
        dateOut: order.dateOut ? lisbonISODate(new Date(order.dateOut)) : "",
        validUntil: "",
        km: String(order.km),
        kmOut: order.kmOut == null ? "" : String(order.kmOut),
        problem: order.problem,
        notes: order.notes,
        status: order.status,
        approval: order.approval,
        approvalAt: order.approvalAt,
        lines: vitrine ? syntheticLines() : linesFor(snap, order.id),
      }}
    />
  );
}

function NewOrder() {
  const snap = useSnap();
  if (!snap) return null;
  const catalog = editorCatalog(snap);
  return (
    <DocumentEditor
      mode="order"
      savedStatus="aberta"
      locked={false}
      userName="Rita Almeida"
      labourRate={catalog.labourRate}
      clients={catalog.clients}
      vehicles={catalog.vehicles}
      articles={catalog.articles}
      suppliers={catalog.suppliers}
      initial={{
        clientId: "",
        vehicleId: "",
        dateIn: lisbonParts().iso,
        dateOut: "",
        validUntil: "",
        km: "",
        problem: "",
        notes: "",
        status: "aberta",
        lines: [],
      }}
    />
  );
}

function Clients() {
  const snap = useSnap();
  if (!snap) return null;
  return (
    <div>
      <PageHeader title="Listagem de Clientes" description="Selecione um cliente na tabela." action={<a className="inline-flex h-10 items-center rounded-lg bg-[#0b8f9c] px-4 text-sm text-white" href={`${import.meta.env.BASE_URL}clientes/novo`}>Novo cliente</a>} />
      <TableShell>
        <thead><tr><Th>Nome</Th><Th>NIF</Th><Th>Telefone</Th><Th>E-mail</Th></tr></thead>
        <tbody>
          {snap.clients.map((client) => (
            <tr key={client.id} className="border-t border-[#d5ebed]">
              <Td><a className="font-medium text-[#0b8f9c]" href={`${import.meta.env.BASE_URL}clientes/${client.id}`}>{client.name}</a></Td>
              <Td>{client.nif}</Td>
              <Td>{client.phone}</Td>
              <Td>{client.email}</Td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

function NewClient() {
  return (
    <div className="max-w-2xl rounded-xl border border-[#d5ebed] bg-white p-4">
      <PageHeader title="Novo cliente" />
      <SaveForm action={(formData) => saveClient(null, formData)} next={(id) => `/clientes/${id}`}>
        <input name="name" required placeholder="Nome" className="h-10 rounded-lg border px-3" />
        <input name="nif" required placeholder="NIF" className="h-10 rounded-lg border px-3" />
        <input name="phone" placeholder="Telefone" className="h-10 rounded-lg border px-3" />
        <input name="email" placeholder="E-mail" className="h-10 rounded-lg border px-3" />
        <textarea name="address" placeholder="Morada" className="rounded-lg border px-3 py-2" />
        <textarea name="notes" placeholder="Notas" className="rounded-lg border px-3 py-2" />
      </SaveForm>
    </div>
  );
}

function NewVehicle() {
  const snap = useSnap();
  if (!snap) return null;
  return (
    <div className="max-w-2xl rounded-xl border border-[#d5ebed] bg-white p-4">
      <PageHeader title="Nova viatura" description="A procura da matrícula está em simulação." />
      <SaveForm action={(formData) => saveVehicle(null, formData)} next={(id) => `/viaturas/${id}`}>
        <VehicleFields clients={snap.clients} />
      </SaveForm>
    </div>
  );
}

function Vehicles() {
  const snap = useSnap();
  if (!snap) return null;
  return (
    <div>
      <PageHeader title="Listagem de Viaturas" action={<a className="text-sm font-medium text-[#0b8f9c]" href={`${import.meta.env.BASE_URL}viaturas/nova`}>Nova viatura</a>} />
      <TableShell>
        <thead><tr><Th>Viatura</Th><Th>Modelo</Th><Th>Cliente</Th></tr></thead>
        <tbody>
          {snap.vehicles.map((vehicle) => (
            <tr key={vehicle.id} className="border-t border-[#d5ebed]">
              <Td className="font-mono">{vehicle.plate}</Td>
              <Td>{vehicle.brand} {vehicle.model}</Td>
              <Td>{snap.clients.find((client) => client.id === vehicle.clientId)?.name}</Td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

function Articles() {
  const snap = useSnap();
  if (!snap) return null;
  return (
    <div>
      <PageHeader title="Inventário de Stock" />
      <TableShell>
        <thead><tr><Th>Família</Th><Th>Descrição</Th><Th>Ref.</Th><Th className="text-right">Custo</Th><Th className="text-right">PVP</Th><Th className="text-right">Qtd</Th></tr></thead>
        <tbody>
          {snap.articles.filter((article) => article.active).map((article) => (
            <tr key={article.id} className="border-t border-[#d5ebed]">
              <Td>{article.family}</Td>
              <Td>{article.description}</Td>
              <Td className="font-mono">{article.ref}</Td>
              <Td className="text-right">{formatEUR(article.costPrice)}</Td>
              <Td className="text-right">{formatEUR(salePrice(article.costPrice, article.marginPercent))}</Td>
              <Td className="text-right">{article.stockQty}</Td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}

function Movements() {
  const snap = useSnap();
  if (!snap) return null;
  const clients = new Map(snap.clients.map((client) => [client.id, client.name]));
  const vehicles = new Map(snap.vehicles.map((vehicle) => [vehicle.id, vehicle.plate]));
  const suppliers = new Map(snap.suppliers.map((supplier) => [supplier.id, supplier.name]));
  return (
    <StockMovements
      data={{
        articles: snap.articles.filter((article) => article.active).map((article) => ({
          id: article.id,
          ref: article.ref,
          description: article.description,
          family: article.family,
          isOil: article.isOil,
          stockQty: article.stockQty,
        })),
        purchases: snap.purchases.map((purchase) => ({
          id: purchase.id,
          date: purchase.date,
          createdAt: purchase.createdAt,
          documentType: purchase.documentType,
          invoiceNumber: purchase.invoiceNumber,
          voided: purchase.voided,
          supplierName: suppliers.get(purchase.supplierId) ?? "",
        })),
        purchaseLines: snap.purchaseLines.map((line) => ({
          id: line.id,
          purchaseId: line.purchaseId,
          articleId: line.articleId,
          tipologia: line.tipologia,
          ref: line.ref,
          quantity: line.quantity,
          cost: line.cost,
          position: line.position,
        })),
        orders: snap.orders.map((order) => ({
          id: order.id,
          number: order.number,
          dateIn: order.dateIn,
          createdAt: order.createdAt,
          invoiceNumber: order.invoiceNumber,
          clientName: order.clientId ? clients.get(order.clientId) ?? "" : "",
          plate: order.vehicleId ? vehicles.get(order.vehicleId) ?? "" : "",
        })),
        lines: snap.lines.map((line) => ({
          id: line.id,
          orderId: line.orderId,
          articleId: line.articleId,
          ref: line.ref,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          position: line.position,
          stockEntryPurchaseId: line.stockEntry?.purchaseId ?? null,
        })),
      }}
    />
  );
}

function Purchases() {
  const snap = useSnap();
  if (!snap) return null;
  return (
    <div>
      <PageHeader title="Compras a Fornecedores" description="Vista de linhas. Os dados ficam guardados neste browser." />
      <PurchaseGrid
        today={lisbonParts().iso}
        suppliers={snap.suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        articles={snap.articles.map((article) => ({
          id: article.id,
          ref: article.ref,
          description: article.description,
          family: article.family,
          costPrice: article.costPrice,
          marginPercent: article.marginPercent,
          vatRate: article.vatRate,
          stockQty: article.stockQty,
          isOil: article.isOil,
        }))}
      />
    </div>
  );
}

function LoginPage() {
  const cloudUser = useSyncExternalStore(subscribeCloud, readCloudUser, () => null);
  if (cloudConfigured()) {
    if (cloudUser?.role === "tecnico") return <Navigate to="/modo-oficina" replace />;
    if (cloudUser) return <Navigate to="/" replace />;
  } else if (readSession()) return <Navigate to="/" replace />;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden bg-[#0b8f9c] p-10 text-white lg:block">
        <Logo light />
        <h1 className="mt-16 max-w-md text-4xl font-semibold">OficinaPlan</h1>
        <p className="mt-4 max-w-md text-white/90">{cloudConfigured() ? "A oficina na nuvem. Os documentos impressos continuam com os dados da empresa." : "Servidor não configurado. Continuas neste computador, com o login da oficina."}</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="mb-1 text-2xl font-semibold">OficinaPlan</h2>
          <p className="mb-4 text-[15px] text-[#4d6d73]">{companyDisplayName()}</p>
          {cloudConfigured() ? <CloudLogin /> : <LoginForm />}
        </div>
      </section>
    </main>
  );
}

function BillingView({ kind }: { kind: "orcamento" | "fatura" | "recibo" }) {
  const { id } = useParams();
  const params = useSearchParams();
  const snap = useSnap();
  const imprimir = params.get("imprimir") === "1";
  useEffect(() => {
    if (!imprimir) return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [imprimir]);
  if (!snap || !id) return null;
  const order = snap.orders.find((item) => item.id === id);
  if (!order) return <p className="p-6">Documento não encontrado.</p>;
  const client = snap.clients.find((item) => item.id === order.clientId);
  const vehicle = snap.vehicles.find((item) => item.id === order.vehicleId);
  if (!client || !vehicle) return <p className="p-6">Indique o cliente e a viatura antes de abrir o documento.</p>;
  if (kind === "recibo" && !order.paidAt) return <p className="p-6">Este recibo só fica disponível depois do pagamento.</p>;
  const number = kind === "orcamento" ? order.quoteNumber : order.invoiceNumber;
  if (!number) return <p className="p-6">Este documento ainda não foi emitido.</p>;
  const lines = snap.lines
    .filter((line) => line.orderId === order.id)
    .sort((a, b) => a.position - b.position)
    .map((line) => {
      const identity = resolveLineIdentity(line, snap.articles, snap.purchaseLines);
      const article = snap.articles.find((item) => item.id === identity.articleId) ?? null;
      return {
        kind: line.kind,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        discountPercent: line.discountPercent,
        article: article ?? (identity.ref ? { ref: identity.ref } : null),
      };
    });
  const doc = orderToPrintable({
    number: order.number,
    status: order.status,
    dateIn: new Date(order.dateIn),
    dateOut: order.dateOut ? new Date(order.dateOut) : null,
    km: order.km,
    problem: order.problem,
    notes: order.notes,
    invoiceNumber: kind === "fatura" ? order.invoiceNumber ?? null : null,
    invoiceProvider: order.invoiceProvider,
    invoiceSimulated: order.invoiceSimulated,
    client,
    vehicle,
    lines,
  });
  doc.title = kind === "orcamento" ? "Orçamento" : kind === "recibo" ? "Recibo" : "Fatura";
  doc.kind = kind === "orcamento" ? "quote" : "order";
  doc.sheetNumber = order.number;
  doc.relatedNumber = kind === "fatura" ? order.quoteNumber || "—" : "—";
  doc.number = number;
  doc.statusLabel = "Simulação Moloni";
  doc.paymentMethod = kind === "fatura" ? order.paymentMethod ?? null : null;
  return (
    <main className="min-h-screen bg-stone-200 px-4 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <a href={`${import.meta.env.BASE_URL}ordens/${order.id}`} className="text-sm font-medium text-[#0b8f9c]">Voltar à folha</a>
        <PrintButton />
      </div>
      <p className="no-print mx-auto mb-3 max-w-[210mm] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Documento simulado pela Moloni. Não tem validade fiscal nem foi comunicado à Autoridade Tributária.
      </p>
      <DocumentPaper doc={doc} />
    </main>
  );
}

function SheetPrint() {
  const { id } = useParams();
  const snap = useSnap();
  if (!snap || !id) return null;
  const order = snap.orders.find((item) => item.id === id);
  if (!order) return <p className="p-6">Folha não encontrada.</p>;
  const client = snap.clients.find((item) => item.id === order.clientId) ?? null;
  const vehicle = snap.vehicles.find((item) => item.id === order.vehicleId) ?? null;
  const raw = snap.lines.filter((line) => line.orderId === order.id).sort((a, b) => a.position - b.position);
  const money = raw.map((line) => ({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    unitCost: line.unitCost,
    vatRate: line.vatRate,
    discountPercent: line.discountPercent,
  }));
  const totals = sumTotals(money);
  return (
    <FolhaPrint
      autoPrint
      backHref={`${import.meta.env.BASE_URL}ordens/${order.id}`}
      documentId={order.id}
      number={order.number}
      dateLabel={formatMediumDate(new Date(order.dateIn))}
      client={client}
      vehicle={vehicle ? {
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        vin: vehicle.vin,
        fuel: vehicle.fuel,
        km: order.km,
        kmOut: order.kmOut ?? null,
        oil: vehicle.oil ?? "",
      } : null}
      problem={order.problem}
      lines={raw.map((line, index) => ({
        kind: line.kind === "mao_de_obra" ? "mao_de_obra" : "peca",
        description: line.description,
        ref: resolveLineIdentity(line, snap.articles, snap.purchaseLines).ref || null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: lineAmounts(money[index]).total,
      }))}
      totals={{ base: totals.base, vat: totals.vat, total: totals.total }}
    />
  );
}

function SheetServices() {
  const { id } = useParams();
  const params = useSearchParams();
  const snap = useSnap();
  const session = readSession();
  if (!snap || !id) return null;
  const order = snap.orders.find((item) => item.id === id);
  if (!order) return <p className="p-6">Folha não encontrada.</p>;
  const vehicle = snap.vehicles.find((item) => item.id === order.vehicleId) ?? null;
  const lines = snap.lines
    .filter((line) => line.orderId === order.id)
    .sort((a, b) => a.position - b.position)
    .map((line) => ({
      description: line.description,
      ref: resolveLineIdentity(line, snap.articles, snap.purchaseLines).ref,
      quantity: line.quantity,
    }));
  return (
    <FolhaServicos
      autoPrint
      backHref={`${import.meta.env.BASE_URL}ordens/${order.id}`}
      documentId={order.id}
      number={order.number}
      enteredAt={order.createdAt || order.dateIn}
      promiseDelivery={params.get("promessa") ?? ""}
      userName={session?.name ?? "Oficina"}
      vehicle={vehicle ? {
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        vin: vehicle.vin,
        version: vehicle.version,
        km: order.km,
      } : null}
      lines={lines}
    />
  );
}

function SettingsPage() {
  return <WorkshopSettings />;
}

function AgendaScreen() {
  const snap = useSnap();
  if (!snap) return null;
  return (
    <AgendaPage
      today={lisbonParts().iso}
      appointments={snap.appointments}
      clients={snap.clients.map((client) => ({ id: client.id, name: client.name }))}
      vehicles={snap.vehicles.map((vehicle) => ({ id: vehicle.id, clientId: vehicle.clientId, plate: vehicle.plate, brand: vehicle.brand, model: vehicle.model }))}
    />
  );
}

function ResultsScreen() {
  const snap = useSnap();
  if (!snap) return null;
  return (
    <ResultsPage
      orders={snap.orders.map((order) => ({
        status: order.status,
        invoiceNumber: order.invoiceNumber,
        invoiceIssuedAt: order.invoiceIssuedAt,
        dateOut: order.dateOut,
        updatedAt: order.updatedAt,
        lines: snap.lines.filter((line) => line.orderId === order.id).map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice, discountPercent: line.discountPercent, vatRate: line.vatRate })),
      }))}
      purchases={snap.purchases.map((purchase) => ({ id: purchase.id, date: purchase.date, voided: purchase.voided }))}
      purchaseLines={snap.purchaseLines.map((line) => ({ purchaseId: line.purchaseId, quantity: line.quantity, cost: line.cost, vatRate: line.vatRate }))}
    />
  );
}

function ClientScreen() {
  const { id } = useParams();
  const snap = useSnap();
  if (!snap || !id) return null;
  const client = snap.clients.find((item) => item.id === id);
  if (!client) return <p className="p-6">Cliente não encontrado.</p>;
  const invoices = snap.orders.filter((order) => order.clientId === client.id && order.invoiceNumber).map((order) => ({
    id: order.id,
    number: order.invoiceNumber ?? "",
    issuedAt: order.invoiceIssuedAt || order.dateOut || order.updatedAt,
    total: invoiceTotal(snap.lines.filter((line) => line.orderId === order.id).map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice, discountPercent: line.discountPercent, vatRate: line.vatRate }))),
    paid: Boolean(order.paidAt),
    plate: snap.vehicles.find((vehicle) => vehicle.id === order.vehicleId)?.plate ?? "",
  }));
  return <ClientAccount client={{ id: client.id, name: client.name, nif: client.nif, phone: client.phone, email: client.email }} invoices={invoices} />;
}

function ordersForOficina(snap: NonNullable<ReturnType<typeof useSnap>>): OficinaOrder[] {
  return snap.orders.map((order) => {
    const vehicle = snap.vehicles.find((item) => item.id === order.vehicleId);
    const client = snap.clients.find((item) => item.id === order.clientId);
    return {
      id: order.id,
      number: order.number,
      plate: vehicle?.plate ?? "",
      vehicle: [vehicle?.brand, vehicle?.model].filter(Boolean).join(" "),
      clientName: client?.name ?? "",
      tasks: snap.lines.filter((line) => line.orderId === order.id && line.kind === "mao_de_obra").map((line) => line.description),
      serviceHours: (() => {
        const hours = snap.lines.filter((line) => line.orderId === order.id && line.kind === "mao_de_obra").reduce((sum, line) => sum + line.quantity, 0);
        return hours > 0 ? hours : null;
      })(),
    };
  });
}

function OficinaScreen() {
  const cloudUser = useSyncExternalStore(subscribeCloud, readCloudUser, () => null);
  const snap = useSnap();
  if (cloudConfigured() && !cloudUser) return <Navigate to="/entrar" replace />;
  if (!snap) return null;
  return (
    <>
      <ImportBanner />
      <OficinaMode orders={ordersForOficina(snap)} />
    </>
  );
}

function TecnicosScreen() {
  const snap = useSnap();
  if (!snap) return null;
  return <OficinaMode admin orders={ordersForOficina(snap)} />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/" element={<Frame><Home /></Frame>} />
      <Route path="/ordens/nova" element={<Frame><NewOrder /></Frame>} />
      <Route path="/ordens/:id/imprimir" element={<SheetPrint />} />
      <Route path="/ordens/:id/servicos" element={<SheetServices />} />
      <Route path="/ordens/:id/orcamento" element={<BillingView kind="orcamento" />} />
      <Route path="/ordens/:id/fatura" element={<BillingView kind="fatura" />} />
      <Route path="/ordens/:id/recibo" element={<BillingView kind="recibo" />} />
      <Route path="/ordens/:id" element={<Frame><OrderScreen /></Frame>} />
      <Route path="/clientes" element={<Frame><Clients /></Frame>} />
      <Route path="/clientes/novo" element={<Frame><NewClient /></Frame>} />
      <Route path="/clientes/:id" element={<Frame><ClientScreen /></Frame>} />
      <Route path="/viaturas" element={<Frame><Vehicles /></Frame>} />
      <Route path="/viaturas/nova" element={<Frame><NewVehicle /></Frame>} />
      <Route path="/artigos" element={<Frame><Articles /></Frame>} />
      <Route path="/compras" element={<Frame><Purchases /></Frame>} />
      <Route path="/movimentos" element={<Frame><Movements /></Frame>} />
      <Route path="/modo-oficina" element={<OficinaScreen />} />
      <Route path="/tecnicos" element={<Frame><TecnicosScreen /></Frame>} />
      <Route path="/pontos" element={<Frame><PontosPage /></Frame>} />
      <Route path="/definicoes" element={<Frame><SettingsPage /></Frame>} />
      <Route path="/agenda" element={<Frame><AgendaScreen /></Frame>} />
      <Route path="/resultados" element={<Frame><ResultsScreen /></Frame>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

function Root() {
  const configured = cloudConfigured();
  const [ready, setReady] = useState(!configured);
  useEffect(() => {
    if (!configured) return;
    void bootCloud().finally(() => setReady(true));
  }, [configured]);
  if (!ready) return <p className="p-8 text-[17px] text-[#4d6d73]">A ligar ao OficinaPlan…</p>;
  return (
    <BrowserRouter basename={basename}>
      <AppUpdates />
      <AppRoutes />
      <Toaster position="top-right" />
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
