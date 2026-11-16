"use client";

import { useState } from "react";
import { signIn, signUp } from "@/browser/src/cloud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CloudLogin() {
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const email = String(data.get("email") ?? "");
        const password = String(data.get("password") ?? "");
        const company = String(data.get("company") ?? "");
        setPending(true);
        setError("");
        void (mode === "criar" ? signUp(email, password, company) : signIn(email, password)).then((result) => {
          if ("error" in result && result.error) {
            setError(result.error);
            setPending(false);
            return;
          }
          const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
          const role = "user" in result ? result.user?.role : undefined;
          window.location.assign(`${base}${role === "tecnico" ? "/modo-oficina" : "/"}`);
        });
      }}
    >
      {mode === "criar" ? (
        <label className="grid gap-1 text-[16px]">Nome da oficina
          <Input name="company" required className="h-12 text-[18px]" placeholder="A minha oficina" />
        </label>
      ) : null}
      <label className="grid gap-1 text-[16px]">E-mail
        <Input name="email" type="email" autoComplete="username" required className="h-12 text-[18px]" data-testid="login-email" />
      </label>
      <label className="grid gap-1 text-[16px]">Palavra-passe
        <Input name="password" type="password" autoComplete={mode === "criar" ? "new-password" : "current-password"} required minLength={6} className="h-12 text-[18px]" data-testid="login-password" />
      </label>
      {error ? <p className="text-[16px] text-red-700" role="alert" data-testid="login-erro">{error}</p> : null}
      <Button type="submit" disabled={pending} className="h-12 text-[18px]">{pending ? "A aguardar…" : mode === "criar" ? "Criar conta" : "Entrar"}</Button>
      <button type="button" className="text-[15px] text-[#0b8f9c]" onClick={() => { setMode(mode === "criar" ? "entrar" : "criar"); setError(""); }}>
        {mode === "criar" ? "Já tenho conta" : "Criar a primeira conta da oficina"}
      </button>
    </form>
  );
}
