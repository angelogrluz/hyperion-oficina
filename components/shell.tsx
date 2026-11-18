"use client";

import { ChevronDown, LogOut, Menu, Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { readTheme, subscribeTheme } from "@/lib/theme";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { companyDisplayName, companyLogoSrc, companyReady, readCompanySettings, subscribeCompanySettings } from "@/lib/company-settings";
import { can, readCurrentUserId, subscribeAccess } from "@/lib/user-settings";
import { readCloudUser, subscribeCloud } from "@/browser/src/cloud";
import { recordPath } from "@/lib/nav-history";
import { logout } from "@/app/actions/auth";
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

function MenuLink({ href, label, active, onNavigate, nested = false }: { href: string; label: string; active: boolean; onNavigate?: () => void; nested?: boolean }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "block rounded-lg py-2.5 text-[16px] hover:bg-white/10",
        nested ? "px-3 pl-8" : "px-3",
        active && "bg-white/15 font-semibold text-white",
      )}
    >
      {label}
    </Link>
  );
}

function AppMenu({ pathname, totals, extra, onNavigate }: { pathname: string; totals: ShellTotals; extra?: ReactNode; onNavigate?: () => void }) {
  const allow = (permission: string) => can(permission);
  const company = useSyncExternalStore(subscribeCompanySettings, readCompanySettings, readCompanySettings);
  const cloudUser = useSyncExternalStore(subscribeCloud, readCloudUser, () => null);
  const logo = companyLogoSrc(company);
  const name = companyDisplayName(company);
  const billingHere = pathname.startsWith("/faturas") || pathname.startsWith("/recibos") || pathname.startsWith("/orcamentos");
  const [billingOpen, setBillingOpen] = useState(billingHere);
  const faturas = allow("faturacao.ver");
  const orcamentos = allow("orcamentos.ver");
  const showBilling = faturas || orcamentos;
  const tecnicos = allow("tecnicos") ? "/tecnicos" : allow("pontos") ? "/pontos" : allow("oficina") ? "/oficina" : "";
  const active = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <div className="flex h-full flex-col bg-[var(--charcoal)] text-white">
      <Link href="/" className="block border-b border-white/10 px-4 py-4" aria-label="Ir para o painel" data-testid="logo-inicio">
        {logo ? <img src={logo} alt={name} className="mx-auto max-h-14 w-full object-contain" /> : <p className="text-[18px] font-semibold leading-tight">{name}</p>}
      </Link>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Menu da gestão">
        <MenuLink href="/" label="Painel" active={pathname === "/"} onNavigate={onNavigate} />
        {showBilling ? (
          <div>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[16px] font-semibold hover:bg-white/10"
              aria-expanded={billingOpen}
              onClick={() => setBillingOpen((value) => !value)}
            >
              Faturação
              <ChevronDown className={cn("size-4 transition", billingOpen && "rotate-180")} />
            </button>
            {billingOpen ? (
              <div className="grid">
                {faturas ? <MenuLink href="/faturas" label="Faturas" active={active("/faturas")} onNavigate={onNavigate} nested /> : null}
                {faturas ? <MenuLink href="/recibos" label="Recibos" active={active("/recibos")} onNavigate={onNavigate} nested /> : null}
                {orcamentos ? <MenuLink href="/orcamentos" label="Orçamentos" active={active("/orcamentos")} onNavigate={onNavigate} nested /> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <MenuLink href="/agenda" label="Agenda" active={active("/agenda")} onNavigate={onNavigate} />
        {allow("obras.ver") ? <MenuLink href="/ordens" label="Obras / Serviços" active={pathname === "/ordens" || pathname.startsWith("/ordens/")} onNavigate={onNavigate} /> : null}
        {allow("clientes.ver") ? <MenuLink href="/clientes" label="Clientes e Viaturas" active={active("/clientes") || active("/viaturas")} onNavigate={onNavigate} /> : null}
        {allow("artigos.ver") ? <MenuLink href="/artigos" label="Stock e Peças" active={active("/artigos") || active("/movimentos")} onNavigate={onNavigate} /> : null}
        {allow("compras") ? <MenuLink href="/compras" label="Fornecedores e Compras" active={active("/compras")} onNavigate={onNavigate} /> : null}
        {tecnicos ? <MenuLink href={tecnicos} label="Técnicos" active={active("/tecnicos") || active("/pontos")} onNavigate={onNavigate} /> : null}
        {allow("oficina") ? <MenuLink href="/oficina" label="Modo oficina" active={active("/oficina") || active("/modo-oficina")} onNavigate={onNavigate} /> : null}
        {allow("relatorios") ? <MenuLink href="/resultados" label="Análise financeira" active={active("/resultados")} onNavigate={onNavigate} /> : null}
        {(allow("config.empresa") || allow("config.precos") || allow("config.utilizadores")) ? <MenuLink href="/definicoes" label="Definições" active={active("/definicoes")} onNavigate={onNavigate} /> : null}
        {cloudUser?.platformAdmin ? <MenuLink href="/admin" label="Administração" active={false} onNavigate={onNavigate} /> : null}
        {extra ? <div className="mt-4 border-t border-white/10 px-2 pt-3 text-[15px]">{extra}</div> : null}
      </nav>
      <div className="border-t border-white/10 text-[15px]">
        <div className="px-3 py-2">
          <p className="text-[13px] uppercase text-white/60">Por aprovar</p>
          <p className="font-semibold tabular-nums">{formatEUR(totals.porAprovar)}</p>
        </div>
        <div className="grid grid-cols-2">
          <div className="bg-[var(--glow)] px-3 py-2">
            <p className="text-[13px]">Aprovado</p>
            <p className="font-semibold tabular-nums">{formatEUR(totals.aprovado)}</p>
          </div>
          <div className="bg-[var(--glow-deep)] px-3 py-2">
            <p className="text-[13px]">Para hoje</p>
            <p className="font-semibold tabular-nums">{formatEUR(totals.paraHoje)}</p>
          </div>
        </div>
      </div>
    </div>
  );
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
  useEffect(() => { recordPath(pathname); }, [pathname]);
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState("");
  useSyncExternalStore(subscribeAccess, readCurrentUserId, () => "");
  const ready = useSyncExternalStore(subscribeCompanySettings, () => companyReady(readCompanySettings()), () => true);
  const companyName = useSyncExternalStore(subscribeCompanySettings, () => companyDisplayName(readCompanySettings()), () => "Oficina");
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);

  return (
    <SheetSidebarProvider>
      {(sidebar, header) => (
        <div data-theme={theme} className="min-h-screen bg-[var(--canvas)] font-['Source_Sans_Pro',sans-serif] text-[17px] text-[var(--text)] lg:[--rail:260px]">
          <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[var(--rail)] lg:block">
            <AppMenu pathname={pathname} totals={totals} extra={sidebar} />
          </aside>
          <div className="lg:pl-[var(--rail)]">
            <header className="no-print sticky top-0 z-40 border-b border-[var(--line)] bg-white">
              <div className="flex h-14 items-center gap-2 px-3">
                <button type="button" className="grid size-10 place-items-center rounded-lg text-[var(--ink)] lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
                  <Menu />
                </button>
                <Link href="/" className="max-w-[42vw] truncate text-[15px] font-semibold text-[var(--ink)] sm:max-w-[180px]" data-testid="logo-cabecalho">{companyName}</Link>
                <form
                  className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 md:max-w-sm"
                  onSubmit={(event) => {
                    event.preventDefault();
                    router.push(query.trim() ? `/clientes?q=${encodeURIComponent(query.trim())}` : "/clientes");
                  }}
                >
                  <div className="relative w-full">
                    <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-[var(--muted-text)]" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar" aria-label="Pesquisar" className="h-9 border-[var(--line)] bg-[var(--paper)] pl-8 text-[17px]" />
                  </div>
                </form>
                <ThemeToggle />
                <div className="relative">
                  <button type="button" className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[var(--mist)]" onClick={() => setUserOpen((value) => !value)}>
                    <span className="grid size-8 place-items-center rounded-full bg-[var(--charcoal)] text-[16px] font-semibold text-white">{user.name.slice(0, 1)}</span>
                    <span className="hidden sm:block">{user.name.split(" ")[0]}</span>
                  </button>
                  {userOpen ? (
                    <div className="absolute top-12 right-0 z-50 w-56 rounded-lg border border-[var(--line)] bg-white p-2 shadow-lg">
                      <p className="px-2 text-sm font-medium">{user.name}</p>
                      <p className="px-2 pb-2 text-xs text-[var(--muted-text)]">{user.email}</p>
                      {footerExtra}
                      <form action={logout}>
                        <Button type="submit" variant="ghost" className="h-9 w-full justify-start">
                          <LogOut /> Terminar sessão
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </div>
              {header}
            </header>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetContent side="left" className="w-72 bg-[var(--charcoal)] p-0 text-white">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <AppMenu pathname={pathname} totals={totals} extra={sidebar} onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            {!ready ? <p data-testid="aviso-empresa" className="bg-[var(--warm-soft)] px-3 py-2 text-[16px] text-[var(--ink)]">Preenche os dados da empresa em Definições. Os documentos usam o que lá estiver.</p> : null}
            <main className="px-3 py-3">{children}</main>
          </div>
        </div>
      )}
    </SheetSidebarProvider>
  );
}
