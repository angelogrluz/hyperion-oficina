"use client";

import { useEffect, useState } from "react";
import { readCloudUser } from "@/browser/src/cloud";
import { moloniCatalog, moloniConnect, moloniDisconnect, moloniSave, moloniStatus, type MoloniStatus } from "@/browser/src/moloni";
import { SHEET_PAYMENTS } from "@/lib/moloni/service";
import { LookupCards } from "@/components/lookup-cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const empty = { connected: false, status: "desligado" as const };

export function IntegrationsPanel() {
  const companyId = readCloudUser()?.companyId ?? "";
  const [status, setStatus] = useState<MoloniStatus>(empty);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [developerId, setDeveloperId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [series, setSeries] = useState<Array<{ id: string; name: string }>>([]);
  const [taxes, setTaxes] = useState<Array<{ id: string; name: string }>>([]);
  const [methods, setMethods] = useState<Array<{ id: string; name: string }>>([]);
  const [company, setCompany] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [seriesFatura, setSeriesFatura] = useState("");
  const [seriesFaturaRecibo, setSeriesFaturaRecibo] = useState("");
  const [seriesOrcamento, setSeriesOrcamento] = useState("");
  const [taxId, setTaxId] = useState("");
  const [issueAs, setIssueAs] = useState<"fatura" | "fatura_recibo">("fatura");
  const [testMode, setTestMode] = useState(true);
  const [payments, setPayments] = useState<Record<string, string>>({});

  function apply(next: MoloniStatus) {
    setStatus(next);
    if (next.companies) setCompanies(next.companies);
    if (next.series) setSeries(next.series);
    if (next.taxes) setTaxes(next.taxes);
    if (next.paymentMethods) setMethods(next.paymentMethods);
    if (next.moloniCompanyId) setCompany(next.moloniCompanyId);
    if (next.moloniCompanyName) setCompanyName(next.moloniCompanyName);
    if (next.seriesFatura) setSeriesFatura(next.seriesFatura);
    if (next.seriesFaturaRecibo) setSeriesFaturaRecibo(next.seriesFaturaRecibo);
    if (next.seriesOrcamento) setSeriesOrcamento(next.seriesOrcamento);
    if (next.taxId) setTaxId(next.taxId);
    if (next.issueAs) setIssueAs(next.issueAs);
    if (typeof next.testMode === "boolean") setTestMode(next.testMode);
    if (next.payments) setPayments(next.payments);
    if (next.developerId) setDeveloperId(next.developerId);
    if (next.username) setUsername(next.username);
  }

  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    void moloniStatus(companyId).then(async (next) => {
      if (!alive) return;
      apply(next);
      if (next.error) setNotice(next.error);
      if (!next.connected) return;
      await loadCatalog(next.moloniCompanyId ?? "", next);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Lists that arrive are always shown; a failing list shows its error instead of leaving empty dropdowns silently.
  async function loadCatalog(nextCompany = company, base: MoloniStatus = status) {
    setCatalogBusy(true);
    try {
      const result = await moloniCatalog(companyId);
      const { error, connected: _c, status: _s, ...lists } = result;
      if (lists.companies || lists.series || lists.taxes || lists.paymentMethods) {
        apply({ ...base, ...lists, connected: base.connected, status: base.status, moloniCompanyId: nextCompany || base.moloniCompanyId });
      }
      if (error) {
        console.error("[faturação] listas:", error);
        setNotice(`Não foi possível carregar as listas: ${error}`);
      } else if (nextCompany && !(lists.series?.length && lists.taxes?.length && lists.paymentMethods?.length)) {
        setNotice("A empresa escolhida não tem séries, taxas de IVA ou métodos de pagamento.");
      }
    } finally {
      setCatalogBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <article data-testid="integracao-moloni" className="grid gap-4 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold">Programa de faturação</h2>
            <p className="text-[15px] text-[var(--muted-text)]">Faturas, faturas-recibo e orçamentos certificados. O segredo e a palavra-passe não ficam neste computador. Outros programas ficam disponíveis em breve.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[14px] font-semibold ${status.connected ? "bg-[#1f9d55] text-white" : "bg-[var(--line)] text-[var(--ink)]"}`}>{status.connected ? "Ligado" : "Desligado"}</span>
        </div>
        {notice ? <p className="text-[15px] text-[var(--glow-deep)]">{notice}</p> : null}
        {!status.connected ? (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            setNotice("");
            void moloniConnect(companyId, { developerId, clientSecret, username, password }).then((result) => {
              setPending(false);
              setPassword("");
              setClientSecret("");
              if (result.error) { setNotice(result.error); return; }
              apply(result);
              setNotice(result.needsPassword ? "A palavra-passe já não chega. Volta a escrevê-la." : "Conta ligada. Escolhe a empresa.");
            });
          }}>
            <label className="grid gap-1 text-[15px] font-medium">Developer ID
              <Input value={developerId} onChange={(event) => setDeveloperId(event.target.value)} required className="h-11" autoComplete="off" />
            </label>
            <label className="grid gap-1 text-[15px] font-medium">Client Secret
              <Input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} required={!status.hasSecret} placeholder={status.hasSecret ? "Guardado no servidor" : undefined} className="h-11" autoComplete="new-password" />
            </label>
            <label className="grid gap-1 text-[15px] font-medium">E-mail
              <Input type="email" value={username} onChange={(event) => setUsername(event.target.value)} required className="h-11" autoComplete="off" />
            </label>
            <label className="grid gap-1 text-[15px] font-medium">Palavra-passe
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required className="h-11" autoComplete="new-password" />
            </label>
            <Button type="submit" disabled={pending || !companyId} className="h-11 bg-[var(--ink)] hover:bg-[var(--graphite)] sm:col-span-2">{pending ? "A ligar…" : "Ligar"}</Button>
          </form>
        ) : (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            void moloniSave(companyId, {
              moloni_company_id: company,
              moloni_company_name: companyName,
              series_fatura: seriesFatura,
              series_fatura_recibo: seriesFaturaRecibo,
              series_orcamento: seriesOrcamento,
              tax_id: taxId,
              payments,
              issue_as: issueAs,
              test_mode: testMode,
            }).then((result) => {
              setPending(false);
              if (result.error) { setNotice(result.error); return; }
              apply(result);
              setNotice("Ligação guardada.");
            });
          }}>
            <label className="grid gap-1 text-[15px] font-medium sm:col-span-2">Empresa no programa
              <select className="h-11 rounded-lg border border-[var(--line)] bg-white px-2" value={company} onChange={(event) => {
                const id = event.target.value;
                setCompany(id);
                setCompanyName(companies.find((item) => item.id === id)?.name ?? "");
                setNotice("");
                void moloniSave(companyId, { moloni_company_id: id, moloni_company_name: companies.find((item) => item.id === id)?.name ?? "", test_mode: testMode }).then((saved) => {
                  if (saved.error) setNotice(saved.error);
                  return loadCatalog(id);
                });
              }}>
                <option value="">Escolher…</option>
                {company && !companies.some((item) => item.id === company) ? <option value={company}>{companyName || "Empresa ligada"}</option> : null}
                {companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <Series label="Série de faturas" value={seriesFatura} options={series} onChange={setSeriesFatura} />
            <Series label="Série de faturas-recibo" value={seriesFaturaRecibo} options={series} onChange={setSeriesFaturaRecibo} />
            <Series label="Série de orçamentos" value={seriesOrcamento} options={series} onChange={setSeriesOrcamento} />
            <label className="grid gap-1 text-[15px] font-medium">IVA por defeito
              <select className="h-11 rounded-lg border border-[var(--line)] bg-white px-2" value={taxId} onChange={(event) => setTaxId(event.target.value)}>
                <option value="">Escolher…</option>
                {taxes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[15px] font-medium">Ao faturar, emitir
              <select className="h-11 rounded-lg border border-[var(--line)] bg-white px-2" value={issueAs} onChange={(event) => setIssueAs(event.target.value as "fatura" | "fatura_recibo")}>
                <option value="fatura">Fatura</option>
                <option value="fatura_recibo">Fatura-recibo</option>
              </select>
            </label>
            <div className="grid gap-2 sm:col-span-2">
              <p className="text-[15px] font-medium">Métodos de pagamento</p>
              {SHEET_PAYMENTS.map((name) => (
                <label key={name} className="grid gap-1 text-[14px] sm:grid-cols-[160px_1fr] sm:items-center">{name}
                  <select className="h-10 rounded-lg border border-[var(--line)] bg-white px-2" value={payments[name] ?? ""} onChange={(event) => setPayments((current) => ({ ...current, [name]: event.target.value }))}>
                    <option value="">Escolher…</option>
                    {methods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[15px] sm:col-span-2">
              <input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} />
              Modo de teste (cria um rascunho, não uma fatura legal)
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" disabled={pending} className="h-11 bg-[var(--ink)] hover:bg-[var(--graphite)]">Guardar</Button>
              <Button type="button" variant="outline" className="h-11" disabled={catalogBusy} onClick={() => { setNotice(""); void loadCatalog(company); }}>{catalogBusy ? "A carregar listas…" : "Recarregar listas"}</Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => { setPassword(""); void moloniDisconnect(companyId).then(() => { setStatus(empty); setCompanies([]); setNotice("Desligado."); }); }}>Desligar</Button>
            </div>
          </form>
        )}
        {status.connected && status.needsPassword ? (
          <form className="grid gap-2" onSubmit={(event) => {
            event.preventDefault();
            void moloniConnect(companyId, { developerId, clientSecret, username, password }).then((result) => {
              setPassword("");
              setClientSecret("");
              if (result.error) setNotice(result.error);
              else { apply(result); setNotice("Ligado outra vez."); }
            });
          }}>
            <p className="text-[15px]">A palavra-passe do programa expirou. Escreve-a outra vez. Não fica guardada.</p>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Palavra-passe" required />
            <Button type="submit" className="h-11 w-fit bg-[var(--ink)]">Ligar outra vez</Button>
          </form>
        ) : null}
      </article>
      <LookupCards />
    </div>
  );
}

function Series({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; name: string }>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-[15px] font-medium">{label}
      <select className="h-11 rounded-lg border border-[var(--line)] bg-white px-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Escolher…</option>
        {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
  );
}
