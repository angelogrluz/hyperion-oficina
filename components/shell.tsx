"use client";

import {
  CalendarDays,
  Car,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/viaturas", label: "Viaturas", icon: Car },
  { href: "/ordens", label: "Ordens", icon: ClipboardList },
  { href: "/orcamentos", label: "Orçamentos", icon: FileText },
  { href: "/artigos", label: "Artigos", icon: Package },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/compras", label: "Compras", icon: ShoppingCart },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/faturacao", label: "Faturação", icon: Receipt },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="grid gap-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-white/5",
            )}
          >
            <Icon className="size-4" />
            {item.label}
            {item.href === "/faturacao" ? (
              <span className="ml-auto rounded-full bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
                Simulação
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="px-4 py-5">
          <Logo light />
          <p className="mt-3 text-xs text-white/50">Vila Nova de Gaia</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavLinks pathname={pathname} />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <p className="px-2 text-sm font-medium">{user.name}</p>
          <p className="px-2 pb-2 text-xs text-white/50">{user.email}</p>
          <form action={logout}>
            <Button type="submit" variant="ghost" className="h-10 w-full justify-start text-sidebar-foreground hover:bg-white/10">
              <LogOut />
              Terminar sessão
            </Button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <Button type="button" variant="outline" size="icon" className="size-10" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu />
          </Button>
          <Logo />
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="px-4 py-5">
              <Logo light />
            </div>
            <div className="px-3">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <main className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}
