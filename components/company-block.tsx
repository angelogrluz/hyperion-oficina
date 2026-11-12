"use client";

import { useSyncExternalStore } from "react";
import {
  companyDisplayName,
  companyLogoSrc,
  companySiteHref,
  installationCompany,
  readCompanySettings,
  subscribeCompanySettings,
} from "@/lib/company-settings";

export function CompanyBlock({ showIban = false }: { showIban?: boolean }) {
  const company = useSyncExternalStore(subscribeCompanySettings, readCompanySettings, () => installationCompany);
  const logo = companyLogoSrc(company);
  const site = companySiteHref(company.site);
  const name = company.legalName.trim() || companyDisplayName(company);
  return (
    <div className="min-w-0 text-[11px] leading-snug text-black">
      {logo ? <img src={logo} alt={companyDisplayName(company)} className="h-12 w-auto bg-white object-contain object-left" /> : <p className="text-[14px] font-bold">{name}</p>}
      {company.legalName.trim() ? <p className="mt-2 font-bold">{company.legalName}</p> : null}
      {company.address.trim() ? <p>{company.address}</p> : null}
      {(company.postalCode.trim() || company.city.trim()) ? <p>{[company.postalCode, company.city].filter(Boolean).join(" ")}</p> : null}
      {company.country.trim() ? <p>{company.country}</p> : null}
      {company.phone.trim() ? <p>Tel./WhatsApp: {company.phone}</p> : null}
      {company.email.trim() ? <p>E-mail: {company.email}</p> : null}
      {site ? <p>Site: <a href={site} className="underline">{company.site}</a></p> : null}
      {company.nif.trim() ? <p>Contribuinte: {company.nif}</p> : null}
      {company.hours.trim() ? <p>Horário: {company.hours}</p> : null}
      {showIban && company.iban.trim() ? <p>IBAN{company.bank.trim() ? ` (${company.bank})` : ""}: {company.iban}</p> : null}
    </div>
  );
}

export function CompanyFooter() {
  const company = useSyncExternalStore(subscribeCompanySettings, readCompanySettings, () => installationCompany);
  if (!company.footer.trim()) return null;
  return <p className="mt-4 whitespace-pre-wrap text-[10px]">{company.footer}</p>;
}
