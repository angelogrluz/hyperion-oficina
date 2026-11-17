"use client";

import { useState, useSyncExternalStore } from "react";
import { EcolubSettings } from "@/components/ecolub-settings";
import { readCloudUser } from "@/browser/src/cloud";
import { cloudBlankMode } from "@/lib/cloud-session";
import {
  blankCompany,
  companyDisplayName,
  companyLogoSrc,
  installationCompany,
  readCompanySettings,
  subscribeCompanySettings,
  writeCompanySettings,
  type CompanySettings,
} from "@/lib/company-settings";
import { blankPrices, installationPrices, readPriceSettings, subscribePriceSettings, writePriceSettings, type PriceSettings } from "@/lib/price-settings";
import {
  PERMISSION_GROUPS,
  ROLES,
  installationUsers,
  readMatrix,
  readUsers,
  subscribeAccess,
  writeMatrix,
  writeUsers,
  type PermissionMatrix,
  type RoleId,
  type WorkshopUser,
} from "@/lib/user-settings";
import { readServices, subscribeOps, writeServices, type InternalService } from "@/lib/workshop-ops";
import { DOCUMENT_TYPES, billingReady, emptyBilling, readBillingSettings, readPlateLookup, subscribeIntegrations, writeBillingSettings, writePlateLookup, type BillingSettings } from "@/lib/billing-settings";
import { readServiceTypes, subscribeServiceTypes, writeServiceTypes, type ServiceType } from "@/lib/booking-settings";
import { purchaseTypes } from "@/src/config";

const SECTIONS = [
  { id: "empresa", title: "Dados da empresa", subtitle: "Identificação, morada, contactos e horário.", permit: "config.empresa" },
  { id: "logo", title: "Logótipo e imagem", subtitle: "Imagem do menu e dos documentos.", permit: "config.empresa" },
  { id: "precos", title: "Preços e taxas", subtitle: "Mão de obra, margens, ECOLUB e IVA.", permit: "config.precos" },
  { id: "documentos", title: "Documentos", subtitle: "Banco, validade, rodapé e séries.", permit: "config.empresa" },
  { id: "stock", title: "Stock e artigos", subtitle: "Tipologias que entram no inventário.", permit: "config.empresa" },
  { id: "utilizadores", title: "Utilizadores e permissões", subtitle: "Pessoas, funções e o que cada uma pode fazer.", permit: "config.utilizadores" },
  { id: "servicos", title: "Serviços internos", subtitle: "Tarefas de oficina que não vão para a folha do cliente.", permit: "config.empresa" },
  { id: "faturacao", title: "Faturação", subtitle: "Ligação à Moloni, preparada para a fase cloud.", permit: "config.empresa" },
  { id: "matricula", title: "Matrícula", subtitle: "Onde vais buscar a foto da viatura, mais tarde.", permit: "config.empresa" },
  { id: "marcacoes", title: "Marcações", subtitle: "Duração de cada tipo de serviço na agenda.", permit: "config.empresa" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function WorkshopSettings() {
  const company = useSyncExternalStore(subscribeCompanySettings, readCompanySettings, () => installationCompany);
  const prices = useSyncExternalStore(subscribePriceSettings, readPriceSettings, () => installationPrices);
  const users = useSyncExternalStore(subscribeAccess, readUsers, () => installationUsers);
  const matrix = useSyncExternalStore(subscribeAccess, readMatrix, readMatrix);
  const services = useSyncExternalStore(subscribeOps, readServices, readServices);
  const billing = useSyncExternalStore(subscribeIntegrations, readBillingSettings, () => emptyBilling);
  const plateLookup = useSyncExternalStore(subscribeIntegrations, readPlateLookup, () => ({ apiUrl: "", apiKey: "" }));
  const serviceTypes = useSyncExternalStore(subscribeServiceTypes, readServiceTypes, readServiceTypes);
  const [section, setSection] = useState<SectionId>("empresa");
  const [notice, setNotice] = useState("");
  const current = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  function saveCompany(patch: Partial<CompanySettings>) {
    writeCompanySettings({ ...readCompanySettings(), ...patch });
    setNotice("Guardado");
  }
  function savePrices(patch: Partial<PriceSettings>) {
    writePriceSettings({ ...readPriceSettings(), ...patch });
    setNotice("Guardado");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Categorias de configuração">
        {SECTIONS.map((item) => (
          <button key={item.id} type="button" data-testid={`config-${item.id}`} onClick={() => setSection(item.id)} className={`min-w-[14rem] rounded-xl px-3 py-2 text-left lg:min-w-0 ${section === item.id ? "bg-[#00a9fd] text-white" : "bg-white text-[#22272a] ring-1 ring-[#d5ebed]"}`}>
            <span className="block text-[16px] font-semibold">{item.title}</span>
            <span className={`mt-0.5 block text-[13px] leading-snug ${section === item.id ? "text-white/85" : "text-[#4d6d73]"}`}>{item.subtitle}</span>
          </button>
        ))}
      </nav>
      <section className="rounded-xl border border-[#d5ebed] bg-white p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold">{current.title}</h1>
            <p className="text-[16px] text-[#4d6d73]">{current.subtitle}</p>
          </div>
          {notice ? <p className="text-[15px] text-[#1f9d55]">{notice}</p> : null}
        </div>
        {section === "empresa" ? <CompanyFields key={company.legalName + company.nif} company={company} onSave={saveCompany} /> : null}
        {section === "logo" ? <LogoFields company={company} onSave={saveCompany} onError={setNotice} /> : null}
        {section === "precos" ? <PriceFields prices={prices} onSave={savePrices} /> : null}
        {section === "documentos" ? <DocumentFields key={company.iban + company.footer} company={company} prices={prices} onCompany={saveCompany} onPrices={savePrices} /> : null}
        {section === "stock" ? <StockFields /> : null}
        {section === "utilizadores" ? <UserFields users={users} matrix={matrix} /> : null}
        {section === "servicos" ? <ServiceFields services={services} /> : null}
        {section === "faturacao" ? <BillingFields billing={billing} onNotice={setNotice} /> : null}
        {section === "matricula" ? <PlateFields lookup={plateLookup} onNotice={setNotice} /> : null}
        {section === "marcacoes" ? <BookingFields types={serviceTypes} /> : null}
        <button type="button" data-testid="repor-empresa" className="mt-6 h-10 rounded-lg border border-[#d5ebed] px-3 text-[16px]" onClick={() => {
          if (cloudBlankMode()) {
            const name = readCloudUser()?.companyName ?? "";
            writeCompanySettings(blankCompany(name === "Oficina" ? "" : name));
            writePriceSettings(blankPrices);
            setNotice("Campos da empresa limpos. O nome da oficina mantém-se.");
            return;
          }
          writeCompanySettings(installationCompany);
          writePriceSettings(installationPrices);
          setNotice("Dados iniciais repostos");
        }}>
          {cloudBlankMode() ? "Limpar dados da empresa" : "Repor dados iniciais da instalação"}
        </button>
      </section>
    </div>
  );
}

function CompanyFields({ company, onSave }: { company: CompanySettings; onSave: (patch: Partial<CompanySettings>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome / Razão social" testId="empresa-legal" value={company.legalName} onSave={(legalName) => onSave({ legalName })} />
      <Field label="Nome comercial" testId="empresa-comercial" value={company.tradeName} onSave={(tradeName) => onSave({ tradeName })} />
      <Field label="NIF" testId="empresa-nif" value={company.nif} onSave={(nif) => onSave({ nif })} />
      <Field label="Telefone / WhatsApp" testId="empresa-telefone" value={company.phone} onSave={(phone) => onSave({ phone })} />
      <Field label="Morada" testId="empresa-morada" value={company.address} onSave={(address) => onSave({ address })} wide />
      <Field label="Código postal" testId="empresa-postal" value={company.postalCode} onSave={(postalCode) => onSave({ postalCode })} />
      <Field label="Localidade" testId="empresa-localidade" value={company.city} onSave={(city) => onSave({ city })} />
      <Field label="País" testId="empresa-pais" value={company.country} onSave={(country) => onSave({ country })} />
      <Field label="E-mail" testId="empresa-email" value={company.email} onSave={(email) => onSave({ email })} />
      <Field label="Website" testId="empresa-site" value={company.site} onSave={(site) => onSave({ site })} />
      <Field label="Horário" testId="empresa-horario" value={company.hours} onSave={(hours) => onSave({ hours })} wide />
      <Money label="IVA por defeito (%)" testId="iva-defeito" value={company.defaultVat} onSave={(defaultVat) => onSave({ defaultVat: defaultVat ?? 23 })} />
    </div>
  );
}

function LogoFields({ company, onSave, onError }: { company: CompanySettings; onSave: (patch: Partial<CompanySettings>) => void; onError: (message: string) => void }) {
  const src = companyLogoSrc(company);
  return (
    <div className="grid gap-3">
      <div className="flex min-h-24 items-center justify-center rounded-xl bg-[#f7f8fa] p-4">
        {src ? <img src={src} alt="" data-testid="empresa-logo-preview" className="max-h-20 max-w-full bg-transparent object-contain" /> : <p data-testid="empresa-logo-preview" className="text-[22px] font-semibold">{companyDisplayName(company)}</p>}
      </div>
      <label className="text-[16px]">Carregar PNG, JPG ou SVG (sem fundo, de preferência)
        <input data-testid="empresa-logo" type="file" accept="image/png,image/jpeg,image/svg+xml,.svg" className="mt-1 block text-[16px]" onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void resizeLogo(file).then((logoDataUrl) => onSave({ logoMode: "custom", logoDataUrl }), (error: Error) => onError(error.message));
        }} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="h-10 rounded-lg border px-3 text-[16px]" onClick={() => onSave({ logoMode: "none", logoDataUrl: "" })}>Remover</button>
        {cloudBlankMode() ? null : <button type="button" data-testid="empresa-logo-default" className="h-10 rounded-lg border border-[#00a9fd] px-3 text-[16px] text-[#00a9fd]" onClick={() => onSave({ logoMode: "default", logoDataUrl: "" })}>Repor logótipo inicial</button>}
      </div>
    </div>
  );
}

function PriceFields({ prices, onSave }: { prices: PriceSettings; onSave: (patch: Partial<PriceSettings>) => void }) {
  const base = prices.hourly == null ? "vazio" : money(prices.hourly);
  return (
    <div className="grid gap-3">
      <p className="text-[16px] text-[#4d6d73]">45,00 €/hora é o valor s/IVA. As categorias vazias usam esta taxa. O total da linha é a taxa × as horas.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Money label="Mão de obra/hora (s/IVA)" testId="preco-hora" value={prices.hourly} onSave={(hourly) => onSave({ hourly })} />
        <Money label="Mecânica geral" testId="preco-mecanica" value={prices.mecanica} placeholder={base} onSave={(mecanica) => onSave({ mecanica })} />
        <Money label="Diagnóstico" testId="preco-diagnostico" value={prices.diagnostico} placeholder={base} onSave={(diagnostico) => onSave({ diagnostico })} />
        <Money label="Ar condicionado" testId="preco-ar" value={prices.arCondicionado} placeholder={base} onSave={(arCondicionado) => onSave({ arCondicionado })} />
        <Money label="Chapa e pintura" testId="preco-chapa" value={prices.chapa} placeholder={base} onSave={(chapa) => onSave({ chapa })} />
        <Money label="Margem produtos (%)" testId="margem-produto" value={prices.productMargin} onSave={(productMargin) => onSave({ productMargin: productMargin ?? (cloudBlankMode() ? 0 : 40) })} />
        <Money label="Margem óleo (%)" testId="margem-oleo" value={prices.oilMargin} onSave={(oilMargin) => onSave({ oilMargin: oilMargin ?? 30 })} />
      </div>
      <div className="rounded-xl bg-[#f7f8fa] p-3"><EcolubSettings /></div>
    </div>
  );
}

function DocumentFields({ company, prices, onCompany, onPrices }: { company: CompanySettings; prices: PriceSettings; onCompany: (patch: Partial<CompanySettings>) => void; onPrices: (patch: Partial<PriceSettings>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Money label="Validade do orçamento (dias)" testId="validade-orcamento" value={prices.quoteDays} placeholder="Sem prazo automático" onSave={(quoteDays) => onPrices({ quoteDays })} />
      <Field label="Banco" testId="empresa-banco" value={company.bank} onSave={(bank) => onCompany({ bank })} />
      <Field label="IBAN" testId="empresa-iban" value={company.iban} onSave={(iban) => onCompany({ iban })} wide />
      <label className="grid gap-1 text-[16px] sm:col-span-2">Rodapé / observações padrão
        <textarea data-testid="empresa-rodape" defaultValue={company.footer} onBlur={(event) => onCompany({ footer: event.target.value })} className="min-h-24 rounded-lg border border-[#d5ebed] px-3 py-2" />
      </label>
      <p className="text-[16px] text-[#4d6d73] sm:col-span-2">Séries em uso: folhas OR-ano-sequência, orçamentos ORC A/ano/sequência, faturas FT A/ano/sequência. A consulta de matrículas e a faturação continuam simuladas.</p>
    </div>
  );
}

function StockFields() {
  return (
    <ul className="divide-y divide-[#eaeaf2] rounded-xl border border-[#d5ebed]">
      {purchaseTypes.map((type) => (
        <li key={type.id} className="flex justify-between px-3 py-2 text-[16px]"><span>{type.label}</span><span className={type.stock ? "font-semibold text-[#1f9d55]" : "text-[#8d939c]"}>{type.stock ? "Entra no stock" : "Despesa, sem stock"}</span></li>
      ))}
    </ul>
  );
}

function UserFields({ users, matrix }: { users: WorkshopUser[]; matrix: PermissionMatrix }) {
  const [editing, setEditing] = useState<WorkshopUser | null>(null);
  return (
    <div className="grid gap-4">
      <ul className="divide-y divide-[#eaeaf2] rounded-xl border">
        {users.map((user) => (
          <li key={user.id} data-testid="utilizador" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[16px]">
            <div>
              <p className="font-semibold">{user.name}{user.active ? "" : " (inativo)"}</p>
              <p className="text-[#4d6d73]">{ROLES.find((role) => role.id === user.role)?.label} · {user.technician ? "técnico" : "sem técnico"} · {user.clocksIn ? "pica o ponto" : "não pica o ponto"}</p>
            </div>
            <span className="flex gap-3">
              <button type="button" className="text-[#00a9fd]" onClick={() => setEditing(user)}>Editar</button>
              <button type="button" className="text-[#d64545]" onClick={() => writeUsers(users.map((item) => item.id === user.id ? { ...item, active: false } : item))}>Desativar</button>
            </span>
          </li>
        ))}
      </ul>
      {editing ? <UserForm user={editing} onCancel={() => setEditing(null)} onSave={(user) => { const exists = users.some((item) => item.id === user.id); writeUsers(exists ? users.map((item) => item.id === user.id ? user : item) : [...users, user]); setEditing(null); }} /> : <button type="button" data-testid="utilizador-novo" className="h-10 w-fit rounded-lg bg-[#00a9fd] px-3 font-semibold text-white" onClick={() => setEditing({ id: crypto.randomUUID(), name: "", login: "", email: "", role: "mecanico", active: true, technician: true, clocksIn: true, pin: "" })}>Adicionar utilizador</button>}
      <div data-testid="permissoes-matriz">
        <h2 className="text-[18px] font-semibold">Permissões</h2>
        <p className="mb-2 text-[15px] text-[#4d6d73]">O Admin tem sempre tudo. As outras funções editam-se aqui e aplicam-se ao utilizador atual.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[15px]">
            <thead><tr><th className="p-2 text-left">Área</th>{ROLES.map((role) => <th key={role.id} className="p-2">{role.label}</th>)}</tr></thead>
            {PERMISSION_GROUPS.map((group) => (
              <tbody key={group.title}>
                <tr className="bg-[#e7f7f8]"><td colSpan={5} className="px-2 py-1 font-semibold">{group.title}</td></tr>
                {group.items.map(([id, label]) => (
                  <tr key={id} className="border-t">
                    <td className="px-2 py-1">{label}</td>
                    {ROLES.map((role) => {
                      const roleId = role.id as Exclude<RoleId, "admin">;
                      const checked = role.id === "admin" || Boolean(matrix[roleId]?.[id]);
                      return <td key={role.id} className="text-center"><input data-testid={`perm-${role.id}-${id}`} type="checkbox" checked={checked} disabled={role.id === "admin"} onChange={(event) => { if (role.id === "admin") return; const next = { ...matrix, [roleId]: { ...matrix[roleId], [id]: event.target.checked } }; writeMatrix(next); }} /></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </div>
  );
}

function UserForm({ user, onSave, onCancel }: { user: WorkshopUser; onSave: (user: WorkshopUser) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(user);
  return (
    <form className="grid gap-2 rounded-xl bg-[#f7f8fa] p-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!draft.name.trim() || !draft.login.trim()) return; onSave({ ...draft, name: draft.name.trim(), login: draft.login.trim() }); }}>
      <Field label="Nome" testId="utilizador-nome" value={draft.name} live onSave={(name) => setDraft((current) => ({ ...current, name }))} />
      <Field label="Utilizador" testId="utilizador-login" value={draft.login} live onSave={(login) => setDraft((current) => ({ ...current, login }))} />
      <Field label="E-mail" testId="utilizador-email" value={draft.email} live onSave={(email) => setDraft((current) => ({ ...current, email }))} />
      <Field label="PIN numérico" testId="utilizador-pin" value={draft.pin} live onSave={(pin) => setDraft((current) => ({ ...current, pin: pin.replace(/\D/g, "") }))} />
      <label className="text-[16px]">Função
        <select data-testid="utilizador-funcao" value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as RoleId }))} className="mt-1 h-10 w-full rounded-lg border bg-white px-2">
          {ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-[16px]"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))} /> Ativo</label>
      <label className="flex items-center gap-2 text-[16px]"><input data-testid="utilizador-tecnico" type="checkbox" checked={draft.technician} onChange={(event) => setDraft((current) => ({ ...current, technician: event.target.checked }))} /> Aparece como técnico</label>
      <label className="flex items-center gap-2 text-[16px]"><input data-testid="utilizador-ponto" type="checkbox" checked={draft.clocksIn} onChange={(event) => setDraft((current) => ({ ...current, clocksIn: event.target.checked }))} /> Pica o ponto</label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="h-10 rounded-lg bg-[#00a9fd] px-3 font-semibold text-white">Guardar</button>
        <button type="button" className="h-10 rounded-lg border bg-white px-3" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

function ServiceFields({ services }: { services: InternalService[] }) {
  const [name, setName] = useState("");
  function save(next: InternalService[]) { writeServices(next); }
  return (
    <div className="grid gap-3">
      <ul className="divide-y rounded-xl border">
        {services.map((service, index) => (
          <li key={service.id} data-testid="servico-interno" className="flex flex-wrap items-center gap-2 px-3 py-2 text-[16px]">
            <input defaultValue={service.name} className="h-10 min-w-48 flex-1 rounded-lg border px-2" onBlur={(event) => save(services.map((item) => item.id === service.id ? { ...item, name: event.target.value } : item))} />
            <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => { const copy = [...services]; const [row] = copy.splice(index, 1); copy.splice(index - 1, 0, row); save(copy); }}>↑</button>
            <button type="button" aria-label="Descer" disabled={index === services.length - 1} onClick={() => { const copy = [...services]; const [row] = copy.splice(index, 1); copy.splice(index + 1, 0, row); save(copy); }}>↓</button>
            <label className="flex items-center gap-1"><input type="checkbox" checked={service.active} onChange={(event) => save(services.map((item) => item.id === service.id ? { ...item, active: event.target.checked } : item))} /> Ativo</label>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; save([...services, { id: crypto.randomUUID(), name: name.trim(), active: true }]); setName(""); }}>
        <input data-testid="servico-novo" value={name} onChange={(event) => setName(event.target.value)} placeholder="Novo serviço interno" className="h-10 flex-1 rounded-lg border px-3" />
        <button className="h-10 rounded-lg bg-[#00a9fd] px-3 font-semibold text-white">Adicionar</button>
      </form>
    </div>
  );
}

function Field({ label, value, onSave, testId, wide, live }: { label: string; value: string; onSave: (value: string) => void; testId: string; wide?: boolean; live?: boolean }) {
  return (
    <label className={`grid gap-1 text-[16px] ${wide ? "sm:col-span-2" : ""}`}>{label}
      <input data-testid={testId} defaultValue={live ? undefined : value} value={live ? value : undefined} onChange={live ? (event) => onSave(event.target.value) : undefined} onBlur={live ? undefined : (event) => onSave(event.target.value)} className="h-10 rounded-lg border border-[#d5ebed] px-3" />
    </label>
  );
}

function Money({ label, value, onSave, testId, placeholder }: { label: string; value: number | null; onSave: (value: number | null) => void; testId: string; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : money(value));
  return (
    <label className="grid gap-1 text-[16px]">{label}
      <input data-testid={testId} value={shown} placeholder={placeholder} inputMode="decimal" onChange={(event) => setDraft(event.target.value)} onBlur={() => { const text = (draft ?? shown).trim(); if (!text) onSave(null); else { const parsed = Number(text.replace(",", ".")); if (Number.isFinite(parsed) && parsed >= 0) onSave(parsed); } setDraft(null); }} className="h-10 rounded-lg border border-[#d5ebed] px-3" />
    </label>
  );
}

function money(value: number | null) {
  if (value == null) return "";
  return value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function resizeLogo(file: File) {
  const svg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (!svg && file.type !== "image/png" && file.type !== "image/jpeg") return Promise.reject(new Error("Use PNG, JPG ou SVG."));
  if (svg) {
    if (file.size > 300_000) return Promise.reject(new Error("O SVG é demasiado grande."));
    return file.text().then((text) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`);
  }
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 480 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    image.src = url;
  });
}

function SecretInput({ label, testId, stored, onCommit }: { label: string; testId: string; stored: boolean; onCommit: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <label className="grid gap-1 text-[16px]">{label}
      <input data-testid={testId} type="password" autoComplete="new-password" value={value} placeholder={stored ? "Guardado — escreve só se quiseres mudar" : ""} onChange={(event) => setValue(event.target.value)} onBlur={() => { if (value.trim()) { onCommit(value.trim()); setValue(""); } }} className="h-10 rounded-lg border border-[#d5ebed] px-3" />
    </label>
  );
}

function BillingFields({ billing, onNotice }: { billing: BillingSettings; onNotice: (message: string) => void }) {
  function save(patch: Partial<BillingSettings>) {
    writeBillingSettings({ ...readBillingSettings(), ...patch });
    onNotice("Guardado");
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Client ID" testId="moloni-client-id" value={billing.clientId} onSave={(clientId) => save({ clientId })} />
      <SecretInput label="Client Secret" testId="moloni-secret" stored={Boolean(billing.clientSecret)} onCommit={(clientSecret) => save({ clientSecret })} />
      <Field label="Utilizador / e-mail" testId="moloni-user" value={billing.user} onSave={(user) => save({ user })} />
      <SecretInput label="Palavra-passe" testId="moloni-password" stored={Boolean(billing.password)} onCommit={(password) => save({ password })} />
      <Field label="Empresa" testId="moloni-empresa" value={billing.companyId} onSave={(companyId) => save({ companyId })} />
      <Field label="Série de documentos" testId="moloni-serie" value={billing.series} onSave={(series) => save({ series })} />
      <label className="grid gap-1 text-[16px]">Tipo de documento por defeito
        <select data-testid="moloni-tipo" value={billing.documentType} onChange={(event) => save({ documentType: event.target.value as BillingSettings["documentType"] })} className="h-10 rounded-lg border px-2">
          {DOCUMENT_TYPES.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <Field label="Método de pagamento por defeito" testId="moloni-pagamento" value={billing.paymentMethod} onSave={(paymentMethod) => save({ paymentMethod })} />
      <button type="button" data-testid="moloni-testar" className="h-11 rounded-xl bg-[#22272a] px-4 text-[16px] font-semibold text-white sm:col-span-2" onClick={() => onNotice(billingReady(readBillingSettings()) ? "Os campos estão preenchidos. A ligação real à Moloni fica para a fase cloud — daqui não sai nenhum segredo." : "Ainda faltam campos. Preenche-os antes de testar.")}>Testar ligação</button>
    </div>
  );
}

function PlateFields({ lookup, onNotice }: { lookup: { apiUrl: string; apiKey: string }; onNotice: (message: string) => void }) {
  return (
    <div className="grid gap-3">
      <p className="text-[16px] text-[#4d6d73]">Quando não houver foto da matrícula, a oficina mostra o carro neutro. A chamada à API fica para a fase cloud.</p>
      <Field label="URL da API" testId="matricula-url" value={lookup.apiUrl} onSave={(apiUrl) => { writePlateLookup({ ...readPlateLookup(), apiUrl }); onNotice("Guardado"); }} />
      <SecretInput label="Chave" testId="matricula-chave" stored={Boolean(lookup.apiKey)} onCommit={(apiKey) => { writePlateLookup({ ...readPlateLookup(), apiKey }); onNotice("Guardado"); }} />
    </div>
  );
}

function BookingFields({ types }: { types: ServiceType[] }) {
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("60");
  return (
    <div className="grid gap-3">
      {types.map((item) => (
        <div key={item.id} data-testid="tipo-servico" className="grid items-center gap-2 rounded-xl bg-[#f7f8fa] p-3 sm:grid-cols-[1fr_120px_auto]">
          <input value={item.name} onChange={(event) => writeServiceTypes(types.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row))} className="h-10 rounded-lg border px-2" />
          <label className="text-[14px]">Minutos
            <input type="number" min={15} value={item.minutes} onChange={(event) => writeServiceTypes(types.map((row) => row.id === item.id ? { ...row, minutes: Number(event.target.value) || 15 } : row))} className="mt-1 h-10 w-full rounded-lg border px-2" />
          </label>
          <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" checked={item.active} onChange={(event) => writeServiceTypes(types.map((row) => row.id === item.id ? { ...row, active: event.target.checked } : row))} /> Ativo</label>
        </div>
      ))}
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; writeServiceTypes([...types, { id: crypto.randomUUID(), name: name.trim(), minutes: Number(minutes) || 60, active: true }]); setName(""); }}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Novo tipo" className="h-10 flex-1 rounded-lg border px-2" />
        <input value={minutes} onChange={(event) => setMinutes(event.target.value)} className="h-10 w-24 rounded-lg border px-2" />
        <button className="h-10 rounded-lg bg-[#00a9fd] px-3 font-semibold text-white">Adicionar</button>
      </form>
    </div>
  );
}
