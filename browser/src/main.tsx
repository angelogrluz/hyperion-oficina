import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { JobBoard } from "@/components/job-board";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";
import { PageHeader } from "@/components/page-header";
import { PurchaseGrid } from "@/components/purchase-grid";
import { SaveForm } from "@/components/save-form";
import { Shell } from "@/components/shell";
import { SimulationBanner } from "@/components/simulation-banner";
import { TableShell, Td, Th } from "@/components/table-shell";
import { VehicleFields } from "@/components/vehicle-fields";
import { DocumentEditor } from "@/components/document-editor";
import { salePrice } from "@/lib/domain";
import { formatEUR, formatMediumDate, lisbonISODate, lisbonParts, lisbonTime } from "@/lib/format";
import { jobPresentation, orderTotal, shellTotals } from "@/lib/job-status";
import { readSession } from "./shims/auth";
import { saveClient, saveVehicle } from "./shims/records";
import { clearWorkshopCache } from "@/lib/browser-cache";
import { readSnapshot, resetDemo, subscribeSnapshot, type Snapshot } from "./store";
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
    <Shell user={{ name: session.name, email: session.email }} totals={totals} footerExtra={<ResetButton />}>
      {onSheet ? null : (
        <p className="mb-2 bg-[#e7f7f8] px-2 py-1 text-[12px] text-[#0b5f68]">
          Versão de teste no browser. Os dados ficam neste computador.
        </p>
      )}
      {children}
    </Shell>
  );
}

function Home() {
  const snap = useSnap();
  if (!snap) return null;
  const jobs = snap.orders
    .filter((order) => order.status !== "faturada")
    .map((order) => {
      const vehicle = snap.vehicles.find((item) => item.id === order.vehicleId);
      const lines = snap.lines.filter((line) => line.orderId === order.id);
      const status = jobPresentation(order.status);
      return {
        id: order.id,
        href: `/ordens/${order.id}`,
        plate: vehicle?.plate ?? "",
        model: `${vehicle?.brand ?? ""} ${vehicle?.model ?? ""}`.trim(),
        status: status.label,
        approved: status.approved,
        total: orderTotal(lines),
        date: `${formatMediumDate(new Date(order.dateIn))} ${lisbonTime(new Date(order.dateIn))}`,
      };
    });
  return (
    <div>
      <SimulationBanner />
      <div className="mt-4"><JobBoard jobs={jobs} /></div>
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
    })),
    suppliers: snap.suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name })),
  };
}

function linesFor(snap: Snapshot, orderId: string) {
  return snap.lines
    .filter((line) => line.orderId === orderId)
    .sort((a, b) => a.position - b.position)
    .map((line) => ({
      key: line.id,
      kind: line.kind === "mao_de_obra" ? "mao_de_obra" as const : "peca" as const,
      description: line.description,
      quantity: String(line.quantity).replace(".", ","),
      unitPrice: String(line.unitPrice).replace(".", ","),
      unitCost: String(line.unitCost).replace(".", ","),
      discount: String(line.discountPercent ?? 0).replace(".", ","),
      vatRate: String(line.vatRate).replace(".", ","),
      note: line.internalNote ?? "",
      articleId: line.articleId,
      ref: snap.articles.find((article) => article.id === line.articleId)?.ref ?? "",
      stockEntry: line.stockEntry ?? null,
    }));
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
      key={order.updatedAt}
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
      initial={{
        clientId: order.clientId ?? "",
        vehicleId: order.vehicleId ?? "",
        dateIn: lisbonISODate(new Date(order.dateIn)),
        dateOut: order.dateOut ? lisbonISODate(new Date(order.dateOut)) : "",
        validUntil: "",
        km: String(order.km),
        problem: order.problem,
        notes: order.notes,
        status: order.status,
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
  if (readSession()) return <Navigate to="/" replace />;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden bg-[#0b8f9c] p-10 text-white lg:block">
        <Logo light />
        <h1 className="mt-16 max-w-md text-4xl font-semibold">Hyperion Car Lab</h1>
        <p className="mt-4 max-w-md text-white/90">Teste estático. Os dados ficam neste browser.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="mb-4 text-2xl font-semibold">Iniciar sessão</h2>
          <LoginForm />
          <p className="mt-4 text-sm text-[#4d6d73]">admin@hyperioncarlab.pt · oficina</p>
        </div>
      </section>
    </main>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/" element={<Frame><Home /></Frame>} />
      <Route path="/ordens/nova" element={<Frame><NewOrder /></Frame>} />
      <Route path="/ordens/:id" element={<Frame><OrderScreen /></Frame>} />
      <Route path="/clientes" element={<Frame><Clients /></Frame>} />
      <Route path="/clientes/novo" element={<Frame><NewClient /></Frame>} />
      <Route path="/viaturas" element={<Frame><Vehicles /></Frame>} />
      <Route path="/viaturas/nova" element={<Frame><NewVehicle /></Frame>} />
      <Route path="/artigos" element={<Frame><Articles /></Frame>} />
      <Route path="/compras" element={<Frame><Purchases /></Frame>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <AppRoutes />
      <Toaster position="top-right" />
    </BrowserRouter>
  </StrictMode>,
);
