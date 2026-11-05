"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeArticle, saveArticle } from "@/app/actions/records";
import { DeleteButton } from "@/components/delete-button";
import { Field, Select } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultMargin, normalizeRef, parseDecimal, priceWithVat, salePrice } from "@/lib/domain";
import { formatEUR } from "@/lib/format";
import { FAMILIES } from "@/lib/labels";

export function ArticleForm({
  article,
}: {
  article?: {
    id: string;
    ref: string;
    description: string;
    family: string;
    costPrice: number;
    marginPercent: number;
    vatRate: number;
    stockQty: number;
    minStock: number;
  };
}) {
  const router = useRouter();
  const [ref, setRef] = useState(article?.ref ?? "");
  const [description, setDescription] = useState(article?.description ?? "");
  const [family, setFamily] = useState(article?.family ?? "Produto");
  const [cost, setCost] = useState(article ? String(article.costPrice).replace(".", ",") : "");
  const [margin, setMargin] = useState(article ? String(article.marginPercent).replace(".", ",") : "40");
  const [vat, setVat] = useState(article ? String(article.vatRate).replace(".", ",") : "23");
  const [stock, setStock] = useState(article ? String(article.stockQty).replace(".", ",") : "0");
  const [minStock, setMinStock] = useState(article ? String(article.minStock).replace(".", ",") : "2");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const costValue = parseDecimal(cost) ?? 0;
  const marginValue = parseDecimal(margin) ?? 0;
  const vatValue = parseDecimal(vat) ?? 23;
  const pvp = salePrice(costValue, marginValue);

  return (
    <form
      className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await saveArticle(article?.id ?? null, formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success("Artigo guardado.");
          if (!article) router.push(`/artigos/${result.id}`);
          else router.refresh();
        });
      }}
    >
      <Field label="Referência" hint="Guardada em maiúsculas.">
        <Input name="ref" value={ref} onChange={(event) => setRef(normalizeRef(event.target.value))} className="h-10 bg-background font-mono" required />
      </Field>
      <Field label="Família" hint="Óleos começam com 30% de margem. Eco taxa com 0%.">
        <Select
          name="family"
          value={family}
          onChange={(event) => {
            const next = event.target.value;
            setFamily(next);
            setMargin(String(defaultMargin({ family: next, ref })));
          }}
        >
          {FAMILIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
          {article && !(FAMILIES as readonly string[]).includes(article.family) ? <option>{article.family}</option> : null}
        </Select>
      </Field>
      <Field label="Descrição" className="md:col-span-2" hint="É gravada em maiúsculas.">
        <Input name="description" value={description} onChange={(event) => setDescription(event.target.value)} className="h-10 bg-background uppercase" required />
      </Field>
      <Field label="Preço de custo s/ IVA">
        <Input name="costPrice" value={cost} onChange={(event) => setCost(event.target.value)} inputMode="decimal" className="h-10 bg-background" required />
      </Field>
      <Field label="Margem %">
        <Input name="marginPercent" value={margin} onChange={(event) => setMargin(event.target.value)} inputMode="decimal" className="h-10 bg-background" required />
      </Field>
      <Field label="IVA %">
        <Input name="vatRate" value={vat} onChange={(event) => setVat(event.target.value)} inputMode="decimal" className="h-10 bg-background" />
      </Field>
      <div className="rounded-lg bg-muted px-3 py-2 text-sm">
        <p>PVP s/ IVA <strong className="tabular-nums">{formatEUR(pvp)}</strong></p>
        <p>PVP c/ IVA <strong className="tabular-nums">{formatEUR(priceWithVat(pvp, vatValue))}</strong></p>
        <p className="text-xs text-muted-foreground">PVP = custo × (1 + margem).</p>
      </div>
      <Field label="Stock" hint="As compras também atualizam o stock e o custo.">
        <Input name="stockQty" value={stock} onChange={(event) => setStock(event.target.value)} inputMode="decimal" className="h-10 bg-background" />
      </Field>
      <Field label="Stock mínimo">
        <Input name="minStock" value={minStock} onChange={(event) => setMinStock(event.target.value)} inputMode="decimal" className="h-10 bg-background" />
      </Field>
      {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <Button type="submit" disabled={pending} className="h-10 px-4">{pending ? "A guardar…" : "Guardar"}</Button>
        {article ? (
          <DeleteButton
            label="Remover"
            successMessage=""
            confirmText="Remover este artigo? Se já foi usado, fica apenas arquivado."
            redirectTo="/artigos"
            action={async () => {
              const result = await removeArticle(article.id);
              if (!result.ok) return result;
              if (result.archived) toast.message("O artigo foi arquivado porque já tem movimentos.");
              else toast.success("Artigo eliminado.");
              return { ok: true };
            }}
          />
        ) : null}
      </div>
    </form>
  );
}
