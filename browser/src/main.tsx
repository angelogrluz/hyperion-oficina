import { toLineKind } from "@/lib/line-kinds";
import { StrictMode, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams, type Location } from "react-router-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { Toaster } from "sonner";
import Link from "next/link";
import { JobBoard } from "@/components/job-board";
import { LoginForm } from "@/components/login-form";
import { CloudLogin } from "@/components/cloud-login";
import { ImportBanner } from "@/components/import-banner";
import { AccountHold } from "@/components/account-hold";
import { EntryBrand } from "@/components/entry-brand";
import { PlatformAdmin } from "@/components/platform-admin";
import { BrandedLogin, Landing, PlatformScreen, RegisterPage, SlugFinder, useSignedInSlug } from "@/components/site-pages";
import { getActiveSlug, OFFICE_ROLES, setActiveSlug, slugMatches, workshopPath } from "@/lib/workshop-slug";
import { PageHeader } from "@/components/page-header";
import { PurchaseGrid } from "@/components/purchase-grid";
import { StockMovements } from "@/components/stock-movements";
import { NifInput } from "@/components/nif-input";
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
import { FolhaPrint } from "@/components/folha-print";
import { FolhaServicos } from "@/components/folha-servicos";
import { PrintButton } from "@/components/print-button";
import { OrderListTable } from "@/components/order-list-table";
import { orderStatusLabel } from "@/lib/labels";
import { lineAmounts, salePrice, sumTotals } from "@/lib/domain";
import { orderToPrintable } from "@/lib/printable";
import { formatEUR, formatMediumDate, lisbonISODate, lisbonParts, lisbonTime } from "@/lib/format";
import { normalizeApproval, APPROVAL_LABEL, type Approval } from "@/lib/approval";
import { resolveLineIdentity } from "@/lib/line-ref";
import { jobPresentation, orderTotal, shellTotals } from "@/lib/job-status";
import { currentUser } from "@/lib/user-settings";
import { officialDocumentPdf, openDocumentUrl } from "@/browser/src/moloni";
import { rememberOfficialDocument } from "@/browser/src/store";
import { readSession } from "./shims/auth";
import { bootCloud, cloudConfigured, readCloudUser, signOut, subscribeCloud } from "./cloud";
import { saveClient, saveVehicle } from "./shims/records";
import { clearWorkshopCache } from "@/lib/browser-cache";
import { readSnapshot, resetDemo, subscribeSnapshot, type Snapshot } from "./store";
import { AppUpdates } from "./updates";
import "./styles.css";

function newestFirst(dateA: string, dateB: string, numberA: string, numberB: string) {
  const byDate = dateB.localeCompare(dateA);
  if (byDate !== 0) return byDate;
  return numberB.localeCompare(numberA, "pt", { numeric: true });
}

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
      className="mb-2 w-full rounded-lg bg-white px-2 py-2 text-left text-xs font-semibold text-[var(--glow)]"
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

function holdFor(user: ReturnType<typeof readCloudUser>) {
  if (!cloudConfigured() || !user || user.companyStatus === "active") return null;
  return user.companyStatus === "suspended" ? "suspended" : "pending";
}

function Frame({ children }: { children: ReactNode }) {
  const session = readSession();
  const cloudUser = useSyncExternalStore(subscribeCloud, readCloudUser, () => null);
  const snap = useSnap();
  const pathname = usePathname();
  const onSheet = /^\/ordens\/.+/.test(pathname);
  const held = holdFor(cloudUser);
  if (held) return <AccountHold status={held} platformAdmin={Boolean(cloudUser?.platformAdmin)} />;
  if (!session) return <Navigate to={getActiveSlug() ? `/${getActiveSlug()}` : "/entrar"} replace />;
  if (!snap) return <p className="p-8 text-sm text-[var(--muted-text)]">A carregar a oficina…</p>;
  const totals = shellTotals(snap.orders.map((order) => ({
    status: order.status,
    dateIn: new Date(order.dateIn),
    lines: snap.lines.filter((line) => line.orderId === order.id),
  })));
  return (
    <Shell user={{ name: session.name, email: session.email ?? "" }} totals={totals} footerExtra={cloudConfigured() ? null : <ResetButton />}>
      <ImportBanner />
      {onSheet ? null : (
        <p className="mb-2 bg-[var(--mist)] px-2 py-1 text-[17px] text-[var(--ink)]">
          {cloudConfigured() ? "OficinaPlan. Os dados da oficina estão na tua conta." : "Servidor não configurado. Os dados ficam neste computador."}
        </p>
      )}
      {children}
    </Shell>
  );
}

function DocumentLists({ kind }: { kind: "faturas" | "recibos" | "orcamentos" }) {
  const snap = useSnap();
  if (!snap) return null;
  const title = kind === "faturas" ? "Faturas" : kind === "recibos" ? "Recibos" : "Orçamentos";
  const rows = kind === "orcamentos"
    ? snap.quotes.map((quote) => ({ id: quote.id, href: `/ordens/${snap.orders.find((order) => order.quoteId === quote.id)?.id ?? ""}`, number: quote.number, detail: quote.problem || "Orçamento", when: quote.date })).sort((a, b) => newestFirst(a.when, b.when, a.number, b.number))
    : snap.orders
      .filter((order) => kind === "recibos" ? Boolean(order.paidAt) : Boolean(order.invoiceNumber))
      .map((order) => ({ id: order.id, href: `/ordens/${order.id}/${kind === "recibos" ? "recibo" : "fatura"}`, number: kind === "recibos" ? order.invoiceNumber ?? order.number : order.invoiceNumber ?? order.number, detail: order.problem || order.number, when: order.invoiceIssuedAt || order.dateIn }))
      .sort((a, b) => newestFirst(a.when, b.when, a.number, b.number));
  return (
    <section className="grid gap-3">
      <h1 className="text-[26px] font-semibold text-[var(--ink)]">{title}</h1>
      {rows.length === 0 ? <p className="text-[16px] text-[var(--muted-text)]">Ainda não há {title.toLowerCase()}.</p> : (
        <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-white">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={row.href || "/"} className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-[var(--paper)]">
                <span>
                  <span className="block font-semibold">{row.number}</span>
                  <span className="text-[15px] text-[var(--muted-text)]">{row.detail}</span>
                </span>
                <span className="text-[14px] text-[var(--steel)]">{row.when ? new Date(row.when).toLocaleDateString("pt-PT") : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
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
            className={`h-10 rounded-full px-4 text-[17px] font-semibold ${filter === item ? "bg-[var(--charcoal)] text-white" : "bg-white text-[var(--charcoal)] ring-1 ring-[#e1e2e5]"}`}
          >
            {item === "todas" ? "Todas" : APPROVAL_LABEL[item]}
          </button>
        ))}
      </div>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>{jobs.length === 0 ? <p className="text-sm text-[var(--steel)]">Nenhuma obra neste estado.</p> : <JobBoard jobs={jobs} />}</div>
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
        kind: toLineKind(line.kind),
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
  const row = (key: string, kind: "mao_de_obra" | "peca" | "servico" | "servico_externo", description: string, quantity: string, unitPrice: string, unitCost: string, ref: string) => ({
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
      // Remount only when the obra changes state (closed, invoiced), not after every autosave: a remount
      // per save redrew the whole sheet and could drop what was typed while the save was running.
      key={`${order.id}:${order.status}:${order.invoiceNumber ?? ""}:${order.paidAt ?? ""}:${order.quoteNumber ?? ""}`}
      mode="order"
      documentId={order.id}
      number={order.number}
      savedStatus={order.status}
      locked={order.status === "faturada"}
      userName={currentUser()?.name || "Utilizador"}
      labourRate={catalog.labourRate}
      clients={catalog.clients}
      vehicles={catalog.vehicles}
      articles={catalog.articles}
      suppliers={catalog.suppliers}
      invoice={order.invoiceNumber ? { number: order.invoiceNumber, provider: (order.invoiceProvider ?? "").toLowerCase() === "importado" || (order.invoiceProvider ?? "").toLowerCase() === "keymaster" ? "Importado" : (order.invoiceProvider ?? "Simulação") } : null}
      paid={Boolean(order.paidAt)}
      quoteNumber={order.quoteNumber ?? null}
      quoteUrl={order.quoteUrl ?? null}
      invoiceUrl={order.invoiceUrl ?? null}
      documentLookup={documentLookup(order)}
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
      userName={currentUser()?.name || "Utilizador"}
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

function Orders() {
  const snap = useSnap();
  if (!snap) return null;
  const rows = [...snap.orders]
    .sort((a, b) => newestFirst(a.dateIn, b.dateIn, a.invoiceNumber || a.number, b.invoiceNumber || b.number))
    .map((order) => {
      const client = snap.clients.find((item) => item.id === order.clientId);
      const vehicle = snap.vehicles.find((item) => item.id === order.vehicleId);
      const lines = snap.lines.filter((line) => line.orderId === order.id);
      return {
        id: order.id,
        href: `/ordens/${order.id}`,
        number: order.number,
        date: formatMediumDate(new Date(order.dateIn)),
        sortDate: order.dateIn,
        plate: vehicle?.plate ?? "",
        vehicle: vehicle ? `${vehicle.brand} ${vehicle.model}`.trim() : "",
        client: client?.name ?? "Sem cliente",
        status: orderStatusLabel(order.status),
        total: orderTotal(lines),
      };
    });
  return (
    <div>
      <PageHeader title="Obras / Serviços" description={`${snap.orders.length} ${snap.orders.length === 1 ? "obra" : "obras"}.`} action={<Link href="/ordens/nova" className="inline-flex h-10 items-center rounded-lg bg-[var(--glow)] px-4 text-sm text-white">Nova ordem</Link>} />
      <OrderListTable rows={rows} />
    </div>
  );
}

function Clients() {
  const snap = useSnap();
  if (!snap) return null;
  return (
    <div>
      <PageHeader title="Listagem de Clientes" description={`${snap.clients.length} ${snap.clients.length === 1 ? "cliente" : "clientes"}. Selecione um cliente na tabela.`} action={<Link href="/clientes/novo" className="inline-flex h-10 items-center rounded-lg bg-[var(--glow)] px-4 text-sm text-white">Novo cliente</Link>} />
      <TableShell>
        <thead><tr><Th>Nome</Th><Th>NIF</Th><Th>Telefone</Th><Th>E-mail</Th></tr></thead>
        <tbody>
          {snap.clients.map((client) => (
            <tr key={client.id} className="border-t border-[var(--line)]">
              <Td><Link className="font-medium text-[var(--glow)]" href={`/clientes/${client.id}`}>{client.name}</Link></Td>
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
    <div className="max-w-2xl rounded-xl border border-[var(--line)] bg-white p-4">
      <PageHeader title="Novo cliente" />
      <SaveForm action={(formData) => saveClient(null, formData)} next={(id) => `/clientes/${id}`}>
        <input name="name" required placeholder="Nome" className="h-10 rounded-lg border px-3" />
        <NifInput />
        <input name="postalCode" placeholder="Código postal" className="h-10 rounded-lg border px-3" />
        <input name="city" placeholder="Localidade" className="h-10 rounded-lg border px-3" />
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
    <div className="max-w-2xl rounded-xl border border-[var(--line)] bg-white p-4">
      <PageHeader title="Nova viatura" description="A procura da matrícula só corre quando a chave e o fornecedor estiverem definidos." />
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
      <PageHeader title="Listagem de Viaturas" description={`${snap.vehicles.length} ${snap.vehicles.length === 1 ? "viatura" : "viaturas"}.`} action={<Link href="/viaturas/nova" className="text-sm font-medium text-[var(--glow)]">Nova viatura</Link>} />
      <TableShell>
        <thead><tr><Th>Viatura</Th><Th>Modelo</Th><Th>Cliente</Th></tr></thead>
        <tbody>
          {snap.vehicles.map((vehicle) => (
            <tr key={vehicle.id} className="border-t border-[var(--line)]">
              <Td className="font-mono">{vehicle.plate}</Td>
              <Td>{vehicle.brand} {vehicle.model}</Td>
              <Td>{snap.clients.find((client) => client.id === vehicle.clientId)?.name || "Sem cliente"}</Td>
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
            <tr key={article.id} className="border-t border-[var(--line)]">
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
  if (cloudConfigured() && cloudUser) {
    if (cloudUser.companyStatus !== "active") {
      return <AccountHold status={cloudUser.companyStatus === "suspended" ? "suspended" : "pending"} platformAdmin={cloudUser.platformAdmin} />;
    }
    if (cloudUser.role === "tecnico") return <Navigate to="/modo-oficina" replace />;
    return <Navigate to="/" replace />;
  } else if (!cloudConfigured() && readSession()) return <Navigate to="/" replace />;
  return (
    <main className="grid min-h-screen md:grid-cols-[1.08fr_0.92fr]">
      <EntryBrand />
      <section className="flex flex-col items-center justify-center bg-[var(--paper)] px-5 py-10">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_12px_40px_rgba(14,36,51,.08)] sm:p-8">
          {cloudConfigured() ? <CloudLogin /> : (
            <>
              <h2 className="mb-1 text-[26px] font-semibold text-[var(--ink)]">Entrar</h2>
              <p className="mb-4 text-[15px] text-[var(--muted-text)]">Servidor não configurado. Continuas neste computador.</p>
              <LoginForm />
            </>
          )}
        </div>
        <p className="mt-6 text-[14px] text-[var(--muted-text)] md:hidden">© OficinaPlan · geral@oficinaplan.com</p>
      </section>
    </main>
  );
}

type OfficialOrder = { id?: string; invoiceProvider?: string | null; invoiceSimulated?: boolean; invoiceNumber?: string | null; invoiceExternalId?: string | null; invoiceUrl?: string | null; originalDocumentUrl?: string | null };

/** A local mock invoice (no invoicing account was connected): there is no official document to fetch. */
function isLocalSimulation(order: OfficialOrder) {
  const provider = (order.invoiceProvider ?? "").toLowerCase();
  if (String(order.invoiceExternalId ?? "").startsWith("sim_")) return true;
  if (provider.includes("simula")) return true;
  const fromAccount = provider === "importado" || provider === "keymaster" || provider.includes("teste") || provider.includes("rascunho") || provider.includes("certific");
  return Boolean(order.invoiceSimulated) && !fromAccount && !order.invoiceExternalId;
}

/**
 * Every invoiced order with a number is fetched from the connected invoicing account (certified, demo
 * «conta de teste», drafts and imported history alike). `invoiceSimulated` is ignored here: older versions
 * set it for demo-account documents, which are real documents in that account.
 */
function documentLookup(order: OfficialOrder) {
  if (!order.invoiceNumber || isLocalSimulation(order)) return null;
  const provider = (order.invoiceProvider ?? "").toLowerCase();
  const companyId = readCloudUser()?.companyId ?? "";
  const https = [order.originalDocumentUrl, order.invoiceUrl].find((value) => /^https?:\/\//i.test(value ?? "")) ?? null;
  const imported = provider === "importado" || provider === "keymaster";
  return { mode: imported ? "importado" as const : "certificado" as const, companyId, number: order.invoiceNumber, documentId: order.invoiceExternalId ?? null, httpsUrl: imported ? https : null };
}

const OFFICIAL_FAILED = "Não foi possível abrir a fatura oficial. O programa de faturação pode estar indisponível. Tenta outra vez daqui a pouco.";

function useOfficialDocument(order: (OfficialOrder & { id: string }) | undefined, kind: "fatura" | "recibo", enabled: boolean) {
  const lookup = order && enabled ? documentLookup(order) : null;
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [url, setUrl] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!lookup || !order) return;
    let alive = true;
    setPhase("loading");
    if (kind === "fatura" && lookup.httpsUrl) {
      setUrl(lookup.httpsUrl);
      setPhase("ready");
      return;
    }
    if (!lookup.companyId) {
      setPhase("failed");
      return;
    }
    void officialDocumentPdf({
      companyId: lookup.companyId,
      number: lookup.number,
      kind,
      documentId: kind === "fatura" ? lookup.documentId : null,
      invoiceDocumentId: kind === "recibo" ? lookup.documentId : null,
    }).then((result) => {
      if (!alive) return;
      if (result.found && result.url) {
        if (result.documentId) void rememberOfficialDocument(order.id, result.documentId, result.documentType ?? "", lookup.number);
        setUrl(result.url);
        setPhase("ready");
      } else setPhase("failed");
    }).catch(() => { if (alive) setPhase("failed"); });
    return () => { alive = false; };
  }, [order?.id, kind, lookup?.companyId, lookup?.number, lookup?.documentId, lookup?.httpsUrl, attempt]);
  return { lookup, phase, url, retry: () => setAttempt((value) => value + 1) };
}

function OfficialDocumentView({ kind }: { kind: "fatura" | "recibo" }) {
  const { id } = useParams();
  const params = useSearchParams();
  const snap = useSnap();
  const imprimir = params.get("imprimir") === "1";
  const order = snap?.orders.find((item) => item.id === id);
  const importedOrder = ["importado", "keymaster"].includes((order?.invoiceProvider ?? "").toLowerCase());
  const receiptBlocked = kind === "recibo" && order && !order.paidAt && !importedOrder;
  const official = useOfficialDocument(order, kind, Boolean(order?.invoiceNumber) && !receiptBlocked);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const printed = useRef(false);
  const label = kind === "recibo" ? "recibo" : "fatura";
  function printOfficial() {
    const target = frame.current?.contentWindow;
    if (target && official.url.startsWith("blob:")) {
      try { target.focus(); target.print(); return; } catch { /* fall back to a new tab */ }
    }
    if (official.url) openDocumentUrl(official.url);
  }
  if (!snap || !id) return null;
  if (!order) return <p className="p-6">Documento não encontrado.</p>;
  const back = <Link href={`/ordens/${order.id}`} className="text-sm font-medium text-[var(--glow)]">Voltar à folha</Link>;
  const message = (text: string, retry?: () => void) => (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-6 text-center">
      <div className="max-w-lg">
        <p className="text-[19px] font-semibold text-[var(--ink)]">{text}</p>
        {retry ? <button type="button" data-testid="tentar-outra-vez" className="mt-4 h-11 rounded-lg bg-[var(--glow)] px-4 font-semibold text-white" onClick={retry}>Tentar outra vez</button> : null}
        <p className="mt-4">{back}</p>
      </div>
    </main>
  );
  if (receiptBlocked) return message("Este recibo só fica disponível depois do pagamento.");
  if (!order.invoiceNumber) return message("Esta fatura ainda não foi emitida.");
  if (!official.lookup) return message(`Esta ${label} foi simulada sem programa de faturação ligado e não tem documento oficial.`);
  if (official.phase === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-6 text-center">
        <div>
          <span className="mx-auto mb-3 block size-8 animate-spin rounded-full border-4 border-[var(--glow)] border-t-transparent" aria-hidden="true" />
          <p className="text-[18px] font-semibold">A obter {kind === "recibo" ? "o recibo oficial" : "a fatura oficial"} {order.invoiceNumber}…</p>
          <p className="mt-4">{back}</p>
        </div>
      </main>
    );
  }
  if (official.phase === "failed") {
    return message(kind === "recibo" ? OFFICIAL_FAILED.replace("a fatura oficial", "o recibo oficial") : OFFICIAL_FAILED, official.retry);
  }
  return (
    <main className="flex min-h-screen flex-col bg-stone-200">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 px-4 py-2">
        {back}
        <span className="flex gap-2">
          <button type="button" className="h-9 rounded-lg border border-[var(--glow)] bg-white px-3 text-[15px] font-medium text-[var(--glow)]" onClick={() => openDocumentUrl(official.url)}>Abrir noutro separador</button>
          <button type="button" data-testid="imprimir-oficial" className="h-9 rounded-lg bg-[var(--glow)] px-3 text-[15px] font-semibold text-white" onClick={printOfficial}>Imprimir</button>
        </span>
      </div>
      {official.url.startsWith("blob:") ? (
        <iframe
          ref={frame}
          title={`${label} ${order.invoiceNumber}`}
          src={official.url}
          className="w-full flex-1 border-0 bg-white"
          style={{ minHeight: "calc(100vh - 3.5rem)" }}
          onLoad={() => {
            if (!imprimir || printed.current) return;
            printed.current = true;
            window.setTimeout(printOfficial, 600);
          }}
        />
      ) : (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <button type="button" className="h-11 rounded-lg bg-[var(--glow)] px-4 font-semibold text-white" onClick={() => openDocumentUrl(official.url)}>Abrir a fatura oficial</button>
        </div>
      )}
    </main>
  );
}

function BillingView({ kind }: { kind: "orcamento" | "fatura" | "recibo" }) {
  // Invoices and receipts always come from the invoicing account; only the estimate is rendered here.
  if (kind !== "orcamento") return <OfficialDocumentView kind={kind} />;
  return <QuoteView />;
}

function QuoteView() {
  const kind = "orcamento" as const;
  const { id } = useParams();
  const params = useSearchParams();
  const snap = useSnap();
  const imprimir = params.get("imprimir") === "1";
  const order = snap?.orders.find((item) => item.id === id);
  useEffect(() => {
    if (!imprimir) return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [imprimir]);
  if (!snap || !id) return null;
  if (!order) return <p className="p-6">Documento não encontrado.</p>;
  const client = snap.clients.find((item) => item.id === order.clientId);
  const vehicle = snap.vehicles.find((item) => item.id === order.vehicleId);
  if (!client || !vehicle) return <p className="p-6">Indique o cliente e a viatura antes de abrir o documento.</p>;
  const number = order.quoteNumber;
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
    invoiceNumber: null,
    invoiceProvider: order.invoiceProvider,
    invoiceSimulated: false,
    client,
    vehicle,
    lines,
  });
  doc.title = "Orçamento";
  doc.kind = kind === "orcamento" ? "quote" : "order";
  doc.sheetNumber = order.number;
  doc.relatedNumber = "—";
  doc.number = number;
  doc.paymentMethod = null;
  return (
    <main className="min-h-screen bg-stone-200 px-4 py-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <Link href={`/ordens/${order.id}`} className="text-sm font-medium text-[var(--glow)]">Voltar à folha</Link>
        <PrintButton />
      </div>
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
      backHref={workshopPath(`/ordens/${order.id}`)}
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
        kind: toLineKind(line.kind),
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
      backHref={workshopPath(`/ordens/${order.id}`)}
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
      clients={snap.clients.map((client) => ({ id: client.id, name: client.name, nif: client.nif, phone: client.phone, email: client.email }))}
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
        lines: snap.lines.filter((line) => line.orderId === order.id).map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, discountPercent: line.discountPercent, vatRate: line.vatRate })),
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
  const invoices = snap.orders.filter((order) => order.clientId === client.id && order.invoiceNumber).sort((a, b) => newestFirst(a.invoiceIssuedAt || a.dateIn, b.invoiceIssuedAt || b.dateIn, a.invoiceNumber || a.number, b.invoiceNumber || b.number)).map((order) => ({
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
  const held = holdFor(cloudUser);
  if (held) return <AccountHold status={held} platformAdmin={Boolean(cloudUser?.platformAdmin)} />;
  if (cloudConfigured() && !cloudUser) return <Navigate to={getActiveSlug() ? `/${getActiveSlug()}` : "/entrar"} replace />;
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

function Gate({ children }: { children: ReactNode }) {
  const cloudUser = useSyncExternalStore(subscribeCloud, readCloudUser, () => null);
  const held = holdFor(cloudUser);
  if (held) return <AccountHold status={held} platformAdmin={Boolean(cloudUser?.platformAdmin)} />;
  return children;
}

function AdminGate() {
  const cloudUser = useSyncExternalStore(subscribeCloud, readCloudUser, () => null);
  if (cloudConfigured() && !cloudUser) return <Navigate to="/entrar" replace />;
  if (!cloudUser?.platformAdmin) return <Navigate to="/" replace />;
  if (cloudUser.companyStatus !== "active") {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    return (
      <main className="min-h-screen bg-[var(--paper)] px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <a href={`${base}/`} className="mb-4 inline-block text-[15px] font-semibold text-[var(--glow-deep)]">Voltar</a>
          <PlatformAdmin />
        </div>
      </main>
    );
  }
  return <Frame><PlatformAdmin /></Frame>;
}

function WorkshopRoutes({ location }: { location?: Location }) {
  return (
    <Routes location={location}>
      <Route path="/" element={<Frame><Home /></Frame>} />
      <Route path="/ordens" element={<Frame><Orders /></Frame>} />
      <Route path="/ordens/nova" element={<Frame><NewOrder /></Frame>} />
      <Route path="/ordens/:id/imprimir" element={<Gate><SheetPrint /></Gate>} />
      <Route path="/ordens/:id/servicos" element={<Gate><SheetServices /></Gate>} />
      <Route path="/ordens/:id/orcamento" element={<Gate><BillingView kind="orcamento" /></Gate>} />
      <Route path="/ordens/:id/fatura" element={<Gate><BillingView kind="fatura" /></Gate>} />
      <Route path="/ordens/:id/recibo" element={<Gate><BillingView kind="recibo" /></Gate>} />
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
      <Route path="/oficina" element={<OficinaScreen />} />
      <Route path="/tecnicos" element={<Frame><TecnicosScreen /></Frame>} />
      <Route path="/pontos" element={<Frame><PontosPage /></Frame>} />
      <Route path="/definicoes" element={<Frame><SettingsPage /></Frame>} />
      <Route path="/faturas" element={<Frame><DocumentLists kind="faturas" /></Frame>} />
      <Route path="/recibos" element={<Frame><DocumentLists kind="recibos" /></Frame>} />
      <Route path="/orcamentos" element={<Frame><DocumentLists kind="orcamentos" /></Frame>} />
      <Route path="/agenda" element={<Frame><AgendaScreen /></Frame>} />
      <Route path="/resultados" element={<Frame><ResultsScreen /></Frame>} />
      <Route path="/administracao" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to={getActiveSlug() ? `/${getActiveSlug()}` : "/"} replace />} />
    </Routes>
  );
}

function SlugApp({ slug }: { slug: string }) {
  const location = useLocation();
  const cloudUser = useSyncExternalStore(subscribeCloud, readCloudUser, () => null);
  setActiveSlug(slug);
  const rest = location.pathname === `/${slug}` ? "/" : location.pathname.slice(slug.length + 1) || "/";
  const routed = { ...location, pathname: rest.startsWith("/") ? rest : `/${rest}` };
  const mine = !!cloudUser && slugMatches(cloudUser, slug);
  const tablet = rest === "/oficina" || rest === "/modo-oficina";
  if (cloudUser && mine && cloudUser.memberActive === false) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-6 text-center">
        <div>
          <h1 className="text-[28px] font-semibold text-[var(--ink)]">O teu acesso a esta oficina está desativado.</h1>
          <button type="button" className="mt-6 h-12 rounded-xl bg-[var(--ink)] px-5 font-semibold text-white" onClick={() => { void signOut().then(() => window.location.assign(`/${slug}`)); }}>Terminar sessão</button>
        </div>
      </main>
    );
  }
  if (tablet) {
    if (!mine) return <BrandedLogin slug={slug} />;
    return <OficinaScreen />;
  }
  if (mine && holdFor(cloudUser)) return <AccountHold status={holdFor(cloudUser) ?? "pending"} platformAdmin={Boolean(cloudUser?.platformAdmin)} />;
  const office = mine && cloudUser?.companyStatus === "active" && !!cloudUser.role && OFFICE_ROLES.has(cloudUser.role);
  if (!office) return <BrandedLogin slug={slug} />;
  return <WorkshopRoutes location={routed} />;
}

function AppRoutes() {
  const configured = cloudConfigured();
  const location = useLocation();
  const signedInSlug = useSignedInSlug();
  if (!configured) {
    return (
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="*" element={<WorkshopRoutes />} />
      </Routes>
    );
  }
  const path = location.pathname;
  if (path === "/") return <Landing signedInSlug={signedInSlug} />;
  if (path === "/entrar" || path.startsWith("/entrar/")) return <SlugFinder />;
  if (path === "/registar") return <RegisterPage />;
  if (path === "/admin" || path.startsWith("/admin/")) {
    const user = readCloudUser();
    return <PlatformScreen user={user}><PlatformAdmin /></PlatformScreen>;
  }
  const slug = path.split("/").filter(Boolean)[0] ?? "";
  if (!slug) return <Landing signedInSlug={signedInSlug} />;
  return <SlugApp slug={slug} />;
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

function Root() {
  const configured = cloudConfigured();
  const [ready, setReady] = useState(!configured);
  useEffect(() => {
    if (!configured) return;
    void bootCloud().finally(() => setReady(true));
  }, [configured]);
  if (!ready) return <p className="p-8 text-[17px] text-[var(--muted-text)]">A ligar ao OficinaPlan…</p>;
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
