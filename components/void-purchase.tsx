"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelPurchase } from "@/app/actions/purchases";
import { Button } from "@/components/ui/button";

export function VoidPurchaseButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Anular esta compra? O stock é reposto. O preço de custo mantém-se.")) return;
        startTransition(async () => {
          const result = await cancelPurchase(id);
          if (!result.ok) {
            toast.error(result.error ?? "Não foi possível anular.");
            return;
          }
          toast.success("Compra anulada. O stock foi reposto; o preço de custo mantém-se.");
          router.refresh();
        });
      }}
    >
      {pending ? "A anular…" : "Anular"}
    </Button>
  );
}
