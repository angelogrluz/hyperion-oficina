"use client";

import { useState } from "react";
import { loginWithNamePin } from "@/browser/src/shims/auth";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setPending(true);
        const result = loginWithNamePin(String(data.get("name") ?? ""), String(data.get("pin") ?? ""));
        if ("error" in result) {
          setError(result.error);
          setPending(false);
          return;
        }
        const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
        window.location.assign(`${base}/`);
      }}
    >
      <Field label="Utilizador">
        <Input name="name" autoComplete="username" required className="h-14 bg-card text-[20px]" data-testid="login-nome" />
      </Field>
      <Field label="PIN">
        <Input name="pin" type="password" inputMode="numeric" autoComplete="off" required minLength={4} maxLength={8} className="h-14 bg-card text-center text-[28px] tracking-[0.3em]" data-testid="login-pin" />
      </Field>
      {error ? <p className="text-[16px] text-destructive" role="alert" data-testid="login-erro">{error}</p> : null}
      <Button type="submit" disabled={pending} className="h-14 text-[18px]">
        {pending ? "A entrar…" : "Entrar"}
      </Button>
    </form>
  );
}
