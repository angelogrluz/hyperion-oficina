"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DeleteButton({
  action,
  confirmText,
  redirectTo,
  label = "Eliminar",
  successMessage = "Eliminado.",
}: {
  action: () => Promise<{ ok: boolean; error?: string }>;
  confirmText: string;
  redirectTo: string;
  label?: string;
  successMessage?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="destructive"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        startTransition(async () => {
          const result = await action();
          if (!result.ok) {
            toast.error(result.error ?? "Não foi possível eliminar.");
            return;
          }
          if (successMessage) toast.success(successMessage);
          router.push(redirectTo);
          router.refresh();
        });
      }}
    >
      {pending ? "A eliminar…" : label}
    </Button>
  );
}
