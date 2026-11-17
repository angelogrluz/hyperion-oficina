"use client";

import { signOut } from "@/browser/src/cloud";
import type { CompanyStatus } from "@/browser/src/cloud";

export function AccountHold({ status }: { status: CompanyStatus }) {
  const pending = status === "pending";
  return (
    <main className="grid min-h-screen place-items-center bg-white px-6 text-[#22272a]">
      <div className="max-w-lg text-center">
        <p className="text-[15px] font-semibold tracking-wide text-[#00a9fd]">OficinaPlan</p>
        <h1 className="mt-3 text-[28px] font-semibold leading-snug">
          {pending
            ? "A tua conta está a aguardar ativação. Assim que o pagamento for confirmado, a oficina fica ativa."
            : "Conta suspensa. Contacta geral@oficinaplan.com."}
        </h1>
        {pending ? <p className="mt-4 text-[18px] text-[#4d6d73]">Se precisares de ajuda, escreve para geral@oficinaplan.com.</p> : null}
        <button
          type="button"
          className="mt-8 h-12 rounded-xl border border-[#22272a] px-5 text-[16px] font-semibold"
          onClick={() => { void signOut().then(() => { window.location.assign(`${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/entrar`); }); }}
        >
          Terminar sessão
        </button>
      </div>
    </main>
  );
}
