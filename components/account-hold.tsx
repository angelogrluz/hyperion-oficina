"use client";

import { signOut } from "@/browser/src/cloud";
import { getActiveSlug } from "@/lib/workshop-slug";
import type { CompanyStatus } from "@/browser/src/cloud";
import { EntryBrand } from "@/components/entry-brand";

export function AccountHold({ status, platformAdmin = false }: { status: CompanyStatus; platformAdmin?: boolean }) {
  const pending = status !== "suspended";
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return (
    <main className="grid min-h-screen md:grid-cols-[1.08fr_0.92fr]">
      <EntryBrand />
      <section className="flex items-center justify-center bg-[var(--paper)] px-5 py-10">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-[0_12px_40px_rgba(14,36,51,.08)]">
          <h2 className="text-[26px] font-semibold leading-snug text-[var(--ink)]">
            {pending
              ? "A tua conta está a aguardar ativação. Assim que o pagamento for confirmado, a oficina fica ativa."
              : "Conta suspensa. Contacta geral@oficinaplan.com."}
          </h2>
          {pending ? <p className="mt-4 text-[16px] text-[var(--muted-text)]">Se precisares de ajuda, escreve para geral@oficinaplan.com.</p> : null}
          {platformAdmin ? (
            <a href={`${base}/administracao`} className="mt-6 inline-flex h-12 items-center justify-center rounded-xl border border-[var(--ink)] px-5 text-[16px] font-semibold text-[var(--ink)]">
              Administração OficinaPlan
            </a>
          ) : null}
          <button
            type="button"
            className="mt-6 h-12 rounded-xl bg-[var(--ink)] px-5 text-[16px] font-semibold text-white"
            onClick={() => { void signOut().then(() => { const slug = getActiveSlug(); window.location.assign(slug ? `${base}/${slug}` : `${base}/`); }); }}
          >
            Terminar sessão
          </button>
        </div>
      </section>
    </main>
  );
}
