import { company } from "@/src/config";

export function companyLogoSrc() {
  if (typeof window !== "undefined" && window.location.pathname.includes("/hyperion-oficina")) {
    return "/hyperion-oficina/logo-hyperion.png";
  }
  return "/logo-hyperion.png";
}

export function CompanyBlock({ showIban = false }: { showIban?: boolean }) {
  return (
    <div className="min-w-0 text-[11px] leading-snug text-black">
      <img src={companyLogoSrc()} alt="Hyperion" width={2422} height={576} className="h-12 w-auto bg-white object-contain object-left" />
      <p className="mt-2 font-bold">{company.legalName}</p>
      <p>{company.address}</p>
      <p>
        {company.postalCode} {company.city}
      </p>
      <p>{company.country}</p>
      <p>Tel./WhatsApp: {company.phone}</p>
      <p>E-mail: {company.email}</p>
      {company.site ? (
        <p>
          Site:{" "}
          <a href={company.siteUrl} className="underline">
            {company.site}
          </a>
        </p>
      ) : null}
      <p>Contribuinte: {company.nif}</p>
      {showIban ? (
        <p>
          IBAN ({company.ibanBank}): {company.iban}
        </p>
      ) : null}
    </div>
  );
}
