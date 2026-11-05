"use client";

import { Button } from "@/components/ui/button";

export default function PanelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <h1 className="text-xl font-semibold">Não foi possível abrir esta página.</h1>
      <p className="mt-2 text-sm text-muted-foreground">Volte a tentar. Se o problema continuar, reinicie a aplicação.</p>
      <Button type="button" className="mt-4 h-10" onClick={() => reset()}>
        Tentar de novo
      </Button>
    </div>
  );
}
