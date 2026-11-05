"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type SaveResult = { ok: true; id?: string } | { ok: false; error: string };

export function SaveForm({
  action,
  next,
  children,
  submitLabel = "Guardar",
}: {
  action: (formData: FormData) => Promise<SaveResult>;
  next?: (id: string) => string;
  children: ReactNode;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await action(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setError(null);
          toast.success("Guardado.");
          if (next && result.id) router.push(next(result.id));
          else router.refresh();
        });
      }}
    >
      {children}
      {error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending} className="h-10 px-4">
          {pending ? "A guardar…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
