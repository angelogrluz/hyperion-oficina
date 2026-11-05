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
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
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
  { href: "/compras?vista=linhas", label: "Movimento de Stocks" },
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
    "grid size-8 place-items-center rounded text-[#3c4450] hover:bg-[#f3f5f8]";
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
  return (
    <>
      <div className="px-3 py-3">
        <Logo light />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1 text-[12px]">
        {extra ? <div className="px-1">{extra}</div> : home ? (
          <div className="grid gap-0.5">
            <p className="px-2 py-1 text-[10px] tracking-wide text-white/50 uppercase">Indicadores das obras</p>
            <Link href="/" className="rounded px-2 py-1 hover:bg-white/10">Ver tudo</Link>
            <p className="mt-2 px-2 py-1 text-[10px] tracking-wide text-white/50 uppercase">Estados do serviço</p>
            <Link href="/?estado=aberta" className="rounded px-2 py-1 hover:bg-white/10">Por aprovar</Link>
            <Link href="/?estado=em_curso" className="rounded px-2 py-1 hover:bg-white/10">Aprovado</Link>
            <Link href="/?estado=hoje" className="rounded px-2 py-1 hover:bg-white/10">Para hoje</Link>
            <Link href="/?estado=concluida" className="rounded px-2 py-1 hover:bg-white/10">Processo fechado</Link>
          </div>
        ) : (
          <div className="px-2 py-2">
            <p className="text-xs tracking-wide text-white/75 uppercase">{sidebarTitle(pathname)}</p>
            <p className="mt-2 text-white/90">{sidebarHint(pathname)}</p>
            <div className="mt-4 grid gap-1">
              <Link href="/clientes" className="rounded-lg px-2 py-2 hover:bg-white/15">Listagem de Clientes</Link>
              <Link href="/viaturas" className="rounded-lg px-2 py-2 hover:bg-white/15">Listagem de Viaturas</Link>
              <Link href="/documentos" className="rounded-lg px-2 py-2 hover:bg-white/15">Listagem de Documentos</Link>
              <Link href="/ordens" className="rounded-lg px-2 py-2 hover:bg-white/15">Obras em curso</Link>
              <Link href="/orcamentos" className="rounded-lg px-2 py-2 hover:bg-white/15">Orçamentos</Link>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-white/10 text-[11px]">
        <div className="bg-[#3a4146] px-2 py-1.5 text-white">
          <p className="text-[10px] uppercase">Por aprovar</p>
          <p className="text-sm font-semibold tabular-nums">{formatEUR(totals.porAprovar)}</p>
        </div>
        <div className="grid grid-cols-2">
          <div className="bg-[#00a9fd] px-2 py-1.5 text-white">
            <p className="text-[10px]">Aprovado</p>
            <p className="font-semibold tabular-nums">{formatEUR(totals.aprovado)}</p>
          </div>
          <div className="bg-[#0096e0] px-2 py-1.5 text-white">
            <p className="text-[10px]">Para hoje</p>
            <p className="font-semibold tabular-nums">{formatEUR(totals.paraHoje)}</p>
          </div>
        </div>
      </div>
    </>
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

  return (
    <SheetSidebarProvider>
      {(sidebar) => (
    <div className="min-h-screen bg-white font-['Source_Sans_Pro',sans-serif] text-[#22272a]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[210px] flex-col bg-[#22272a] text-white lg:flex">
        <SidebarBody pathname={pathname} totals={totals} extra={sidebar} />
      </aside>
      <div className="lg:pl-[210px]">
        <header className="sticky top-0 z-40 flex h-11 items-center gap-0.5 border-b border-[#eaeaf2] bg-white px-1">
          <button type="button" className="grid size-10 place-items-center rounded-lg text-[#0b8f9c] lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu />
          </button>
          <ToolButton href="/" label="Obras em Curso"><ClipboardList className="size-4" /></ToolButton>
          <ToolButton href="/orcamentos" label="Obras de Orçamentos e Encomendas"><FileStack className="size-4" /></ToolButton>
          <ToolButton href="/clientes" label="Gestão de Cliente"><Users className="size-4" /></ToolButton>
          <div className="relative">
            <ToolButton label="Gestão de Serviços e/ou Mercadorias" onClick={() => setStockOpen((value) => !value)}>
              <span className="flex items-center">
                <Package className="size-4" />
                <ChevronDown className="size-3" />
              </span>
            </ToolButton>
            {stockOpen ? (
              <div className="absolute top-12 left-0 z-50 w-72 rounded-lg border border-[#d5ebed] bg-white p-1 shadow-lg">
                {STOCK_LINKS.map((item) => (
                  <Link key={item.href} href={item.href} className="block rounded-md px-3 py-2 text-sm hover:bg-[#e7f7f8]" onClick={() => setStockOpen(false)}>
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <ToolButton href="/ordens/nova" label="Nova Obra"><Plus className="size-4" /></ToolButton>
          <ToolButton href="/agenda" label="Agenda"><CalendarDays className="size-4" /></ToolButton>
          <ToolButton href="/resultados" label="Resultados da Empresa"><BarChart3 className="size-4" /></ToolButton>
          <ToolButton href="/definicoes" label="Parametrização"><Settings className="size-4" /></ToolButton>
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
                className="h-8 border-[#e1e2e5] bg-[#f7f8fa] pl-8 text-[13px]"
              />
            </div>
          </form>
          <div className="relative">
            <button type="button" className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[#e7f7f8]" onClick={() => setUserOpen((value) => !value)}>
              <span className="grid size-7 place-items-center rounded-full bg-[#22272a] text-[11px] font-semibold text-white">{user.name.slice(0, 1)}</span>
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
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 bg-[#22272a] p-0 text-white">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex h-full flex-col">
              <SidebarBody pathname={pathname} totals={totals} extra={sidebar} />
            </div>
          </SheetContent>
        </Sheet>
        <main className="px-2 py-2">{children}</main>
      </div>
    </div>
      )}
    </SheetSidebarProvider>
  );
}
