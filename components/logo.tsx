"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { companyDisplayName, companyLogoSrc, installationCompany, readCompanySettings, subscribeCompanySettings } from "@/lib/company-settings";
import { goBack } from "@/lib/nav-history";
import { readSession } from "@/browser/src/shims/auth";
import { readCloudUser } from "@/browser/src/cloud";

export function Logo({ light = false, onBeforeBack }: { light?: boolean; onBeforeBack?: () => boolean }) {
  const company = useSyncExternalStore(subscribeCompanySettings, readCompanySettings, () => installationCompany);
  const src = companyLogoSrc(company, light);
  const name = companyDisplayName(company);
  const router = useRouter();
  useEffect(() => { document.title = "OficinaPlan"; }, []);
  return (
    <button
      type="button"
      data-testid="marca-logo"
      aria-label="Retroceder"
      title={name}
      className="block w-full cursor-pointer text-left"
      onClick={() => {
        if (onBeforeBack?.()) return;
        if (readSession()?.role === "mecanico" || readCloudUser()?.role === "tecnico") return;
        const previous = goBack();
        if (previous) router.push(previous);
      }}
    >
      {src ? <img src={src} alt={name} className={light ? "h-auto max-h-8 w-full object-contain" : "h-11 w-auto object-contain"} /> : <span className="block px-1 text-[15px] font-semibold leading-tight">{name}</span>}
    </button>
  );
}
