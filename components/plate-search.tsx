"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { lookupPlate } from "@/app/actions/plates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlateVehicle } from "@/lib/plates/types";

export function PlateSearch({
  plate,
  onPlateChange,
  onFound,
}: {
  plate: string;
  onPlateChange: (value: string) => void;
  onFound: (vehicle: PlateVehicle) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Matrícula</span>
      <div className="flex gap-2">
        <Input
          name="plate"
          required
          value={plate}
          onChange={(event) => onPlateChange(event.target.value.toUpperCase())}
          className="h-10 bg-background font-mono uppercase"
          aria-label="Matrícula"
        />
        <Button
          type="button"
          variant="secondary"
          className="h-10 shrink-0"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await lookupPlate(plate);
              if (!result.found || !("vehicle" in result) || !result.vehicle) {
                setMessage(result.message);
                toast.error(result.message);
                return;
              }
              onFound(result.vehicle);
              onPlateChange(result.vehicle.plate);
              setMessage(result.message);
              toast.success("Dados da matrícula preenchidos (simulação).");
            });
          }}
        >
          {pending ? "A procurar…" : "Procurar"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Formato AA-00-AA. A consulta está em <strong>simulação</strong> — não liga a uma API paga de matrículas.
      </p>
      {message ? <p className="text-xs text-[var(--ink)]">{message}</p> : null}
    </div>
  );
}
