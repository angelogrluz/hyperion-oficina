"use client";

import { useState } from "react";
import { resetPassword, signIn, signUp } from "@/browser/src/cloud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CloudLogin() {
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const email = String(data.get("email") ?? "");
        const password = String(data.get("password") ?? "");
        const company = String(data.get("company") ?? "");
        const owner = String(data.get("owner") ?? "");
        setPending(true);
        setError("");
        setInfo("");
        void (mode === "criar" ? signUp(email, password, company, owner) : signIn(email, password)).then((result) => {
          if ("error" in result && result.error) {
            setError(result.error);
            setPending(false);
            return;
          }
          const user = "user" in result ? result.user : undefined;
          if (!user) {
            setError("A conta foi criada, mas a oficina ainda não está pronta. Tenta entrar daqui a um momento.");
            setPending(false);
            return;
          }
          const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
          const dest = user.companyStatus === "active" && user.role === "tecnico" ? "/modo-oficina" : "/";
          window.location.assign(`${base}${dest}`);
        });
      }}
    >
      <div>
        <h2 className="text-[26px] font-semibold text-[#0e2433]">{mode === "criar" ? "Regista a tua oficina" : "Entrar"}</h2>
        <p className="mt-1 text-[15px] text-[#5c6b76]">{mode === "criar" ? "Crias a conta e ficas à espera da ativação." : "Entra com o e-mail da tua oficina."}</p>
      </div>
      {mode === "criar" ? (
        <>
          <label className="grid gap-1 text-[15px] font-medium text-[#0e2433]">Nome da oficina
            <Input name="company" required className="h-12 border-[#d5dde3] text-[17px]" placeholder="Oficina do João" />
          </label>
          <label className="grid gap-1 text-[15px] font-medium text-[#0e2433]">O teu nome
            <Input name="owner" required autoComplete="name" className="h-12 border-[#d5dde3] text-[17px]" placeholder="João Silva" />
          </label>
        </>
      ) : null}
      <label className="grid gap-1 text-[15px] font-medium text-[#0e2433]">E-mail
        <Input name="email" type="email" autoComplete="username" required className="h-12 border-[#d5dde3] text-[17px]" data-testid="login-email" />
      </label>
      <label className="grid gap-1 text-[15px] font-medium text-[#0e2433]">Palavra-passe
        <span className="relative">
          <Input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "criar" ? "new-password" : "current-password"} required minLength={6} className="h-12 border-[#d5dde3] pr-16 text-[17px]" data-testid="login-password" />
          <button type="button" className="absolute top-1/2 right-3 -translate-y-1/2 text-[14px] font-semibold text-[#0b6f8a]" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Ocultar" : "Mostrar"}</button>
        </span>
      </label>
      {error ? <p className="text-[15px] text-[#b42318]" role="alert" data-testid="login-erro">{error}</p> : null}
      {info ? <p className="text-[15px] text-[#0b6f8a]" role="status">{info}</p> : null}
      <Button type="submit" disabled={pending} className="h-12 bg-[#0e2433] text-[17px] hover:bg-[#16344a]">{pending ? "A aguardar…" : mode === "criar" ? "Criar conta" : "Entrar"}</Button>
      {mode === "entrar" ? (
        <button
          type="button"
          className="justify-self-start text-[15px] font-medium text-[#0b6f8a]"
          onClick={(event) => {
            const form = event.currentTarget.form;
            const email = String(new FormData(form ?? undefined).get("email") ?? "").trim();
            if (!email) { setError("Indica o e-mail para recuperares a palavra-passe."); setInfo(""); return; }
            setError("");
            setPending(true);
            void resetPassword(email).then((result) => {
              setPending(false);
              if (result.error) setError(result.error);
              else setInfo("Enviámos um e-mail para definires uma palavra-passe nova.");
            });
          }}
        >
          Esqueci-me da palavra-passe
        </button>
      ) : null}
      <button type="button" className="text-left text-[15px] text-[#33414c]" onClick={() => { setMode(mode === "criar" ? "entrar" : "criar"); setError(""); setInfo(""); }}>
        {mode === "criar" ? "Já tens conta? Entra" : "Ainda não tens conta? Regista a tua oficina"}
      </button>
    </form>
  );
}
