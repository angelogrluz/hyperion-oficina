"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ from }: { from?: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="from" value={from ?? ""} />
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="username" required className="h-11 bg-card" defaultValue="admin@hyperioncarlab.pt" />
      </Field>
      <Field label="Palavra-passe">
        <Input name="password" type="password" autoComplete="current-password" required className="h-11 bg-card" />
      </Field>
      {state?.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="h-11">
        {pending ? "A entrar…" : "Entrar"}
      </Button>
    </form>
  );
}
