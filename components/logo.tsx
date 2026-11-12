"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { companyDisplayName, companyLogoSrc, installationCompany, readCompanySettings, subscribeCompanySettings } from "@/lib/company-settings";

export function Logo({ light = false }: { light?: boolean }) {
  const company = useSyncExternalStore(subscribeCompanySettings, readCompanySettings, () => installationCompany);
  const src = companyLogoSrc(company, light);
  const name = companyDisplayName(company);
  useEffect(() => { document.title = name; }, [name]);
  return (
    <Link href="/" aria-label="Ir para o painel" title={name} className="block cursor-pointer">
      {src ? <img src={src} alt={name} data-testid="marca-logo" className={light ? "h-auto max-h-8 w-full object-contain" : "h-11 w-auto object-contain"} /> : <span data-testid="marca-logo" className="block px-1 text-[15px] font-semibold leading-tight">{name}</span>}
    </Link>
  );
}
