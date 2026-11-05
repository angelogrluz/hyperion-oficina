"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteAppointment } from "@/app/actions/appointments";
import { Button } from "@/components/ui/button";

export function DeleteAppointmentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Eliminar esta marcação?")) return;
        startTransition(async () => {
          const result = await deleteAppointment(id);
          if (!result.ok) {
            toast.error(result.error ?? "Não foi possível eliminar.");
            return;
          }
          toast.success("Marcação eliminada.");
          router.refresh();
        });
      }}
    >
      Tirar
    </Button>
  );
}
