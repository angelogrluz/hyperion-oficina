"use client";

import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileStack,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Clock, Wrench } from "lucide-react";
import { PinDialog } from "@/components/pin-dialog";
import { companyReady, readCompanySettings, subscribeCompanySettings } from "@/lib/company-settings";
import { can, currentUser, pinMatches, readCurrentUserId, readUsers, subscribeAccess, writeCurrentUserId } from "@/lib/user-settings";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { SheetSidebarProvider } from "@/components/sheet-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ShellTotals = {
  porAprovar: number;
  aprovado: number;
  paraHoje: number;
};

const STOCK_LINKS = [
  { href: "/compras", label: "Compras a Fornecedores" },
  { href: "/movimentos", label: "Movimentos de stock" },
  { href: "/artigos?separador=consumiveis", label: "Venda de Produtos e Serviços" },
  { href: "/artigos", label: "Inventário de Stock" },
  { href: "/artigos?separador=servicos", label: "Catálogo de Serviços" },
  { href: "/fornecedores", label: "Pagamentos a Fornecedores" },
];

function ToolButton({
  href,
  label,
  children,
  onClick,
}: {
  href?: string;
  label: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const className =
    "grid size-10 place-items-center rounded text-[#3c4450] hover:bg-[#f3f5f8]";
  const body = (
    <>
      {children}
      <span className="pointer-events-none absolute top-11 left-1/2 z-50 hidden -translate-x-1/2 rounded-md bg-[#14343a] px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block group-focus-within:block">
        {label}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={cn("group relative", className)}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cn("group relative", className)}>
      {body}
    </button>
  );
}

function SidebarBody({ pathname, totals, extra }: { pathname: string; totals: ShellTotals; extra?: ReactNode }) {
  const home = pathname === "/";
  const estado = useSearchParams().get("estado") ?? "";
  const item = (href: string, label: string, active: boolean) => (
    <Link href={href} className={cn("rounded px-2 py-1 hover:bg-white/10", active && "bg-white/15 font-semibold text-white")}>{label}</Link>
  );
  return (
    <>
      <div className="px-2 pt-3 pb-2">
        <Logo light />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1 text-[17px]">
        {extra ? <div className="px-1">{extra}</div> : home ? (
          <div className="grid gap-0.5">
            {item("/", "Ver tudo", estado === "")}
            <button type="button" disabled title="Indisponível nesta versão" className="cursor-not-allowed rounded px-2 py-1 text-left text-white/40">Selecionar todos</button>
            <p className="mt-2 px-2 py-1 text-[14px] tracking-wide text-white/45 uppercase">Indicadores das obras</p>
            <button type="button" disabled title="Indisponível nesta versão" className="cursor-not-allowed rounded px-2 py-1 text-left text-white/40">Em curso</button>
            <p className="mt-2 px-2 py-1 text-[14px] tracking-wide text-white/45 uppercase">Colaboradores</p>
            <button type="button" disabled title="Indisponível nesta versão" className="cursor-not-allowed rounded px-2 py-1 text-left text-white/40">Sem colaboradores</button>
            <p className="mt-2 px-2 py-1 text-[14px] tracking-wide text-white/45 uppercase">Estados do serviço</p>
            {item("/?estado=aberta", "Por aprovar", estado === "aberta")}
            {item("/?estado=em_curso", "Aprovado", estado === "em_curso")}
            {item("/?estado=hoje", "Para hoje", estado === "hoje")}
            {item("/?estado=concluida", "Processo fechado", estado === "concluida")}
            <p className="mt-2 px-2 py-1 text-[14px] tracking-wide text-white/45 uppercase">Atribuído a</p>
            <button type="button" disabled title="Indisponível nesta versão" className="cursor-not-allowed rounded px-2 py-1 text-left text-white/40">Sem atribuição</button>
          </div>
        ) : (
          <div className="px-2 py-2">
            <p className="text-xs tracking-wide text-white/75 uppercase">{sidebarTitle(pathname)}</p>
            <p className="mt-2 text-white/90">{sidebarHint(pathname)}</p>
            <div className="mt-4 grid gap-1">
              {can("clientes.ver") ? <Link href="/clientes" className="rounded-lg px-2 py-2 hover:bg-white/15">Listagem de Clientes</Link> : null}
              {can("clientes.ver") ? <Link href="/viaturas" className="rounded-lg px-2 py-2 hover:bg-white/15">Listagem de Viaturas</Link> : null}
              <Link href="/documentos" className="rounded-lg px-2 py-2 hover:bg-white/15">Listagem de Documentos</Link>
              {can("obras.ver") ? <Link href="/ordens" className="rounded-lg px-2 py-2 hover:bg-white/15">Obras em curso</Link> : null}
              {can("orcamentos.ver") ? <Link href="/orcamentos" className="rounded-lg px-2 py-2 hover:bg-white/15">Orçamentos</Link> : null}
            </div>
          </div>
        )}
      </div>
      <CurrentUserSelect />
      <div className="border-t border-white/10 text-[16px]">
        <div className="bg-[#3a4146] px-2 py-1.5 text-white">
          <p className="text-[14px] uppercase">Por aprovar</p>
          <p className="text-sm font-semibold tabular-nums">{formatEUR(totals.porAprovar)}</p>
        </div>
        <div className="grid grid-cols-2">
          <div className="bg-[#00a9fd] px-2 py-1.5 text-white">
            <p className="text-[14px]">Aprovado</p>
            <p className="font-semibold tabular-nums">{formatEUR(totals.aprovado)}</p>
          </div>
          <div className="bg-[#0096e0] px-2 py-1.5 text-white">
            <p className="text-[14px]">Para hoje</p>
            <p className="font-semibold tabular-nums">{formatEUR(totals.paraHoje)}</p>
          </div>
        </div>
      </div>
    </>
  );
}

function CurrentUserSelect() {
  useSyncExternalStore(subscribeAccess, readCurrentUserId, () => "u-angelo");
  const users = readUsers().filter((user) => user.active);
  const selected = currentUser();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="px-2 py-2">
      <label className="grid gap-1 text-[14px] text-white/80">Utilizador atual
        <select data-testid="utilizador-atual" value={selected?.id ?? ""} onChange={(event) => { if (event.target.value !== selected?.id) { setPending(event.target.value); setError(""); } }} className="h-10 rounded bg-white px-2 text-[16px] text-[#22272a]">
          {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
      </label>
      {pending ? <PinDialog title={users.find((user) => user.id === pending)?.name ?? "PIN"} error={error} onClose={() => setPending("")} onSubmit={(pin) => { if (!pinMatches(pending, pin)) { setError("PIN incorreto ou ainda não definido em Utilizadores."); return; } writeCurrentUserId(pending); setPending(""); }} /> : null}
    </div>
  );
}

function sidebarTitle(pathname: string) {
  if (pathname.startsWith("/clientes")) return "Cliente";
  if (pathname.startsWith("/viaturas")) return "Viatura";
  if (pathname.startsWith("/documentos") || pathname.startsWith("/faturacao")) return "Documentos";
  if (pathname.startsWith("/artigos") || pathname.startsWith("/compras") || pathname.startsWith("/fornecedores")) return "Stock";
  if (pathname.startsWith("/agenda")) return "Agenda";
  if (pathname.startsWith("/resultados")) return "Resultados";
  if (pathname.startsWith("/definicoes")) return "Empresa";
  if (pathname.startsWith("/orcamentos")) return "Orçamentos";
  return "Obra";
}

function sidebarHint(pathname: string) {
  if (pathname.startsWith("/clientes")) return "Selecione um cliente na tabela.";
  if (pathname.startsWith("/viaturas")) return "Selecione uma viatura na tabela.";
  if (pathname.startsWith("/artigos")) return "Inventário, consumíveis e eco taxas.";
  return "Atalhos do balcão.";
}

export function Shell({
  user,
  totals = { porAprovar: 0, aprovado: 0, paraHoje: 0 },
  children,
  footerExtra,
}: {
  user: { name: string; email: string };
  totals?: ShellTotals;
  children: ReactNode;
  footerExtra?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState("");
  useSyncExternalStore(subscribeAccess, readCurrentUserId, () => "u-angelo");
  const allow = (permission: string) => can(permission);
  const ready = useSyncExternalStore(subscribeCompanySettings, () => companyReady(readCompanySettings()), () => true);
  const stockLinks = STOCK_LINKS.filter((item) => item.href.startsWith("/movimentos") ? allow("movimentos") : item.href.startsWith("/artigos") ? allow("artigos.ver") : allow("compras"));

  return (
    <SheetSidebarProvider>
      {(sidebar, header) => (
    <div className="min-h-screen bg-white font-['Source_Sans_Pro',sans-serif] text-[17px] text-[#22272a] [--rail:clamp(190px,12vw,230px)]">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[var(--rail)] flex-col bg-[#22272a] text-white lg:flex">
        <SidebarBody pathname={pathname} totals={totals} extra={sidebar} />
      </aside>
      <div className="lg:pl-[var(--rail)]">
        {header ? (
          <header className="no-print sticky top-0 z-40 border-b border-[#eaeaf2] bg-white">{header}</header>
        ) : (
        <header className="no-print sticky top-0 z-40 flex h-14 items-center gap-1 border-b border-[#eaeaf2] bg-white px-2">
          <button type="button" className="grid size-10 place-items-center rounded-lg text-[#0b8f9c] lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu />
          </button>
          {allow("obras.ver") ? <ToolButton href="/" label="Obras em Curso"><ClipboardList className="size-4" /></ToolButton> : null}
          {allow("orcamentos.ver") ? <ToolButton href="/orcamentos" label="Obras de Orçamentos e Encomendas"><FileStack className="size-4" /></ToolButton> : null}
          {allow("clientes.ver") ? <ToolButton href="/clientes" label="Gestão de Cliente"><Users className="size-4" /></ToolButton> : null}
          {stockLinks.length ? <div className="relative">
            <ToolButton label="Gestão de Serviços e/ou Mercadorias" onClick={() => setStockOpen((value) => !value)}>
              <span className="flex items-center">
                <Package className="size-4" />
                <ChevronDown className="size-3" />
              </span>
            </ToolButton>
            {stockOpen ? (
              <div className="absolute top-12 left-0 z-50 w-72 rounded-lg border border-[#d5ebed] bg-white p-1 shadow-lg">
                {stockLinks.map((item) => (
                  <Link key={item.href} href={item.href} className="block rounded-md px-3 py-2 text-sm hover:bg-[#e7f7f8]" onClick={() => setStockOpen(false)}>
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div> : null}
          {allow("obras.editar") ? <ToolButton href="/ordens/nova" label="Nova Obra"><Plus className="size-4" /></ToolButton> : null}
          {allow("oficina") ? <ToolButton href="/modo-oficina" label="Modo oficina"><Wrench className="size-4" /></ToolButton> : null}
          {allow("tecnicos") ? <ToolButton href="/tecnicos" label="Técnicos"><Users className="size-4" /></ToolButton> : null}
          {allow("pontos") ? <ToolButton href="/pontos" label="Pontos"><Clock className="size-4" /></ToolButton> : null}
          <ToolButton href="/agenda" label="Agenda"><CalendarDays className="size-4" /></ToolButton>
          {allow("relatorios") ? <ToolButton href="/resultados" label="Resultados da Empresa"><BarChart3 className="size-4" /></ToolButton> : null}
          {(allow("config.empresa") || allow("config.precos") || allow("config.utilizadores")) ? <ToolButton href="/definicoes" label="Parametrização"><Settings className="size-4" /></ToolButton> : null}
          <form
            className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 md:max-w-sm"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(query.trim() ? `/clientes?q=${encodeURIComponent(query.trim())}` : "/clientes");
            }}
          >
            <div className="relative w-full">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-[#4d6d73]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Pesquisar"
                aria-label="Pesquisar"
                className="h-8 border-[#e1e2e5] bg-[#f7f8fa] pl-8 text-[18px]"
              />
            </div>
          </form>
          <div className="relative">
            <button type="button" className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[#e7f7f8]" onClick={() => setUserOpen((value) => !value)}>
              <span className="grid size-7 place-items-center rounded-full bg-[#22272a] text-[16px] font-semibold text-white">{user.name.slice(0, 1)}</span>
              <span className="hidden sm:block">{user.name.split(" ")[0]}</span>
            </button>
            {userOpen ? (
              <div className="absolute top-12 right-0 z-50 w-56 rounded-lg border border-[#d5ebed] bg-white p-2 shadow-lg">
                <p className="px-2 text-sm font-medium">{user.name}</p>
                <p className="px-2 pb-2 text-xs text-[#4d6d73]">{user.email}</p>
                {footerExtra}
                <form action={logout}>
                  <Button type="submit" variant="ghost" className="h-9 w-full justify-start">
                    <LogOut /> Terminar sessão
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        </header>
        )}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 bg-[#22272a] p-0 text-white">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex h-full flex-col">
              <SidebarBody pathname={pathname} totals={totals} extra={sidebar} />
            </div>
          </SheetContent>
        </Sheet>
        {!ready ? <p data-testid="aviso-empresa" className="bg-[#fff8eb] px-3 py-2 text-[16px] text-[#3a2a00]">Preencha os dados da empresa em Configurações. Os documentos usam o que lá estiver.</p> : null}
        <main className="px-2 py-2">{children}</main>
      </div>
    </div>
      )}
    </SheetSidebarProvider>
  );
}
