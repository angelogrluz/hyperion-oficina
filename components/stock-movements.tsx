"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { includesSearch } from "@/lib/domain";
import { formatEUR, formatMediumDate, formatQty, lisbonISODate } from "@/lib/format";
import {
  buildStockLedger,
  isHiddenStockArticle,
  type MovementArticle,
  type MovementLine,
  type MovementOrder,
  type MovementPurchase,
  type MovementPurchaseLine,
} from "@/lib/stock-movements";

export type StockMovementData = {
  articles: MovementArticle[];
  purchases: MovementPurchase[];
  purchaseLines: MovementPurchaseLine[];
  orders: MovementOrder[];
  lines: MovementLine[];
};

export function StockMovements({ data, initialRef = "" }: { data: StockMovementData; initialRef?: string }) {
  const [query, setQuery] = useState(initialRef);
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState(initialRef.toUpperCase());
  const [kind, setKind] = useState<"todos" | "entrada" | "saida">("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const suggestions = useMemo(() => {
    const q = query.trim();
    if (q.length < 1) return [];
    return data.articles
      .filter((article) => includesSearch(`${article.ref} ${article.description}`, q))
      .filter((article) => !isHiddenStockArticle(article) || q.length >= 3)
      .slice(0, 8);
  }, [data.articles, query]);

  const article = data.articles.find((item) => item.ref.toUpperCase() === ref) ?? null;
  const ledger = useMemo(() => {
    if (!article) return null;
    return buildStockLedger({
      article,
      purchases: data.purchases,
      purchaseLines: data.purchaseLines,
      orders: data.orders,
      lines: data.lines,
    });
  }, [article, data]);

  const rows = (ledger?.movements ?? []).filter((row) => {
    if (kind !== "todos" && row.kind !== kind) return false;
    const day = lisbonISODate(new Date(row.date));
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });

  function choose(next: MovementArticle) {
    setRef(next.ref.toUpperCase());
    setQuery(next.ref);
    setOpen(false);
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-[#22272a]">Movimentos de stock</h1>
        <p className="mt-1 max-w-3xl text-[17px] text-[#4d6d73]">
          Entradas das compras e das entradas de stock, e saídas das folhas de obra. Só produto e óleo mexem no inventário.
        </p>
      </div>

      <div className="relative max-w-xl">
        <label className="grid gap-1 text-[16px] font-medium text-[#22272a]">
          Referência
          <input
            data-testid="movimento-busca"
            value={query}
            placeholder="Referência ou descrição"
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && suggestions[0]) {
                event.preventDefault();
                choose(suggestions[0]);
              }
            }}
            className="h-11 rounded-lg border border-[#d5ebed] bg-white px-3 text-[17px] outline-none focus:border-[#00a9fd]"
          />
        </label>
        {open && suggestions.length ? (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-[#d5ebed] bg-white py-1 shadow-lg" role="listbox">
            {suggestions.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  data-testid="movimento-opcao"
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[16px] hover:bg-[#e7f7f8]"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                >
                  <span><span className="font-mono font-semibold">{item.ref}</span> {item.description}</span>
                  <span className="shrink-0 text-[#4d6d73]">stock {formatQty(item.stockQty)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {!article ? (
        <p className="rounded-xl border border-[#d5ebed] bg-white px-4 py-6 text-[17px] text-[#4d6d73]">
          Escolha uma referência para ver o extrato de stock.
        </p>
      ) : ledger ? (
        <>
          <section className="grid gap-3 rounded-xl border border-[#d5ebed] bg-white p-4 sm:grid-cols-2 xl:grid-cols-6" data-testid="movimento-resumo">
            <div className="xl:col-span-2">
              <p className="font-mono text-[20px] font-semibold text-[#00a9fd]">{article.ref}</p>
              <p className="text-[17px] text-[#22272a]">{article.description}</p>
              <p className="text-[16px] text-[#4d6d73]">{article.isOil ? "Óleo" : article.family}</p>
            </div>
            <Stat label="Stock atual" value={formatQty(ledger.stock)} testId="movimento-stock" />
            <Stat label="Total entradas" value={formatQty(ledger.entered)} />
            <Stat label="Total saídas" value={formatQty(ledger.left)} />
            <Stat label="Movimentos" value={String(ledger.movements.filter((row) => !row.adjustment).length)} />
          </section>

          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[16px]">
              Desde
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10 rounded-lg border border-[#d5ebed] bg-white px-2 text-[16px]" />
            </label>
            <label className="grid gap-1 text-[16px]">
              Até
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-10 rounded-lg border border-[#d5ebed] bg-white px-2 text-[16px]" />
            </label>
            <div className="flex gap-1" data-testid="filtro-tipo">
              {([
                ["todos", "Todos"],
                ["entrada", "Entradas"],
                ["saida", "Saídas"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={`h-10 rounded-full px-4 text-[16px] font-semibold ${kind === value ? "bg-[#00a9fd] text-white" : "bg-white text-[#22272a] ring-1 ring-[#d5ebed]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#d5ebed] bg-white">
            <table data-testid="movimento-tabela" className="w-full min-w-[980px] border-collapse text-[16px] text-[#22272a]">
              <thead className="bg-[#e7f7f8] text-left">
                <tr>
                  {["Data", "Tipo", "Documento", "Entidade", "Qtd entrada", "Qtd saída", "Preço", "Stock acumulado"].map((label) => (
                    <th key={label} className="px-3 py-2 font-semibold whitespace-nowrap">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-6 text-[#4d6d73]">Sem movimentos neste filtro.</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.id} data-testid="movimento-linha" data-kind={row.kind} className="border-t border-[#eaeaf2]">
                    <td className="px-3 py-2 whitespace-nowrap">{formatMediumDate(new Date(row.date))}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[15px] font-semibold ${row.kind === "entrada" ? "bg-[#e5f6ec] text-[#1f9d55]" : "bg-[#fdecec] text-[#d64545]"}`}>
                        {row.kind === "entrada" ? "Entrada" : "Saída"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.href ? <Link href={row.href} className="font-medium text-[#00a9fd] hover:underline">{row.document}</Link> : row.document}
                    </td>
                    <td className="px-3 py-2">{row.entity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.qtyIn ? formatQty(row.qtyIn) : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.qtyOut ? formatQty(row.qtyOut) : ""}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{row.price === null ? "—" : formatEUR(row.price)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums" data-testid="movimento-saldo">{formatQty(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div>
      <p className="text-[14px] tracking-wide text-[#8d939c] uppercase">{label}</p>
      <p data-testid={testId} className="text-[22px] font-semibold text-[#22272a] tabular-nums">{value}</p>
    </div>
  );
}
