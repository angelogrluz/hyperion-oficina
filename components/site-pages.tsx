"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { readCloudUser, resolveCompanyPublic, signIn, signOut, signUp, subscribeCloud, type CloudUser } from "@/browser/src/cloud";
import { EntryBrand } from "@/components/entry-brand";
import { ProductMark } from "@/components/product-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotOwnerPassword, signInWithUsername } from "@/browser/src/staff-access";
import { setActiveSlug, slugError, slugMatches, suggestSlug } from "@/lib/workshop-slug";

export function Landing({ signedInSlug }: { signedInSlug?: string | null }) {
  useEffect(() => {
    setActiveSlug(null);
    document.title = "OficinaPlan — A gestão da tua oficina";
  }, []);
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
        <ProductMark />
        <nav className="flex items-center gap-2 text-[15px]">
          {signedInSlug ? <Link to={`/${signedInSlug}`} className="rounded-lg px-3 py-2 font-semibold text-[var(--glow-deep)]">A tua oficina</Link> : null}
          <Link to="/registar" className="rounded-lg bg-[var(--glow-deep)] px-3 py-2 font-semibold text-white">Criar conta</Link>
        </nav>
      </header>
      <section className="relative mx-auto grid max-w-6xl items-center gap-8 px-5 pb-16 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24">
        <div>
          <p className="text-[14px] font-semibold tracking-wide text-[var(--glow-deep)] uppercase">Para qualquer oficina</p>
          <h1 className="mt-3 text-[40px] leading-[1.05] font-semibold text-[var(--ink)] sm:text-[56px]">A tua oficina, finalmente organizada.</h1>
          <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-[var(--muted-text)]">Folhas de obra, agenda, stock, faturação e o dia da equipa no mesmo sítio. Serve tanto a uma oficina de um mecânico como a uma equipa grande: a organização é a mesma, o controlo também.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/registar" className="inline-flex h-12 items-center rounded-xl bg-[var(--glow-deep)] px-5 text-[16px] font-semibold text-white">Experimentar</Link>
            <a href="mailto:geral@oficinaplan.com?subject=Quero%20uma%20demonstra%C3%A7%C3%A3o%20do%20OficinaPlan" className="inline-flex h-12 items-center rounded-xl border border-[var(--line)] bg-white px-5 text-[16px] font-semibold text-[var(--ink)]">Pedir demonstração</a>
            <a href="mailto:geral@oficinaplan.com?subject=Or%C3%A7amento%20OficinaPlan" className="inline-flex h-12 items-center px-2 text-[16px] font-semibold text-[var(--glow-deep)]">Pede o teu orçamento</a>
          </div>
        </div>
        <div className="overflow-hidden rounded-3xl shadow-[0_24px_60px_rgba(19,27,36,.28)]">
          <img src="/login-hero.webp" alt="Oficina com viaturas nos elevadores e um técnico a consultar o plano de trabalho" className="h-[320px] w-full object-cover sm:h-[420px]" />
        </div>
      </section>
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-4 px-5 py-16 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Folhas de obra digitais", "A obra fica escrita, com peças, mão de obra e o estado de aprovação."],
            ["Agenda de marcações", "Vês o dia e a semana sem folhas soltas no balcão."],
            ["Modo oficina no tablet", "A equipa pica o ponto e regista o tempo de cada tarefa."],
            ["Orçamentos", "Preparados a partir da obra, prontos a enviar ao cliente."],
            ["Stock e fornecedores", "Compras, existências e o que está a acabar."],
            ["Clientes e viaturas", "Ficha, histórico e conta corrente no mesmo lugar."],
            ["Faturação Certificada", "Faturas e recibos prontos para emissão certificada. Enquanto a ligação não está ativa, os documentos saem em simulação."],
            ["Resultados e IVA estimado", "Uma leitura do mês, sem folha de cálculo à parte."],
            ["Permissões por função", "Cada pessoa vê o que lhe compete. O responsável vê tudo."],
            ["Na nuvem, em qualquer ecrã", "Escritório, tablet da oficina ou o telemóvel. Os dados são os da tua conta."],
          ].map(([title, text]) => (
            <article key={title} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5">
              <h2 className="text-[18px] font-semibold text-[var(--ink)]">{title}</h2>
              <p className="mt-2 text-[16px] leading-relaxed text-[var(--muted-text)]">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-16 lg:grid-cols-2">
        <div className="rounded-3xl bg-[var(--ink)] p-8 text-white">
          <h2 className="text-[28px] font-semibold">Para a oficina pequena</h2>
          <p className="mt-3 text-[17px] leading-relaxed text-white/80">Um mecânico também precisa de saber o que está em curso, o que foi orçamentado e o que falta receber. Não tens de montar um sistema à medida. Abres a conta e trabalhas.</p>
        </div>
        <div className="rounded-3xl border border-[var(--line)] bg-white p-8">
          <h2 className="text-[28px] font-semibold text-[var(--ink)]">Para a equipa grande</h2>
          <p className="mt-3 text-[17px] leading-relaxed text-[var(--muted-text)]">Vários técnicos, receção e administração. Cada função tem o seu acesso. O tablet da oficina fica no chão de oficina; a gestão fica no escritório.</p>
        </div>
      </section>
      <section className="bg-[var(--warm-soft)]">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-[32px] font-semibold text-[var(--ink)]">Utilizadores ilimitados</h2>
          <p className="mt-3 max-w-2xl text-[18px] leading-relaxed text-[var(--text)]">Não há uma taxa por pessoa. Entra a equipa toda, do balcão ao último mecânico. O acesso de cada um limita-se à função, não a um lugar pago.</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-[32px] font-semibold text-[var(--ink)]">Como começa</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["1. Crias a conta", "Escolhes o nome e o endereço da oficina. Ficas com um link só teu."],
            ["2. Configuras", "Dados da empresa, preços e a equipa. Cada pessoa com a sua função."],
            ["3. Trabalhas", "Obras, marcações, stock e contas, no escritório e no tablet."],
          ].map(([title, text]) => (
            <li key={title} className="rounded-2xl border border-[var(--line)] p-5">
              <h3 className="text-[18px] font-semibold text-[var(--ink)]">{title}</h3>
              <p className="mt-2 text-[16px] text-[var(--muted-text)]">{text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <h2 className="text-[32px] font-semibold text-[var(--ink)]">Perguntas frequentes</h2>
          <div className="mt-6 grid gap-3">
            {[
              ["Serve para uma oficina pequena?", "Sim. A organização é a mesma, mesmo que sejas só tu."],
              ["E se a equipa for grande?", "Sim. Há permissões por função e o modo oficina no tablet para a equipa picar o ponto e os tempos."],
              ["Pago por cada utilizador?", "Não. Os utilizadores são ilimitados."],
              ["A fatura é certificada?", "A faturação certificada está preparada. Enquanto não estiver ativa, a fatura sai em modo de simulação e não substitui um documento certificado."],
              ["Onde ficam os dados?", "Na tua conta, na nuvem. Não se misturam com os de outra oficina."],
              ["Quanto custa?", "Ainda não publicamos preços. Pede o teu orçamento para geral@oficinaplan.com."],
            ].map(([q, a]) => (
              <details key={q} className="rounded-xl border border-[var(--line)] px-4 py-3">
                <summary className="cursor-pointer text-[17px] font-semibold text-[var(--ink)]">{q}</summary>
                <p className="pt-2 text-[16px] text-[var(--muted-text)]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-[var(--ink)] text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[32px] font-semibold">Fala connosco</h2>
            <p className="mt-2 text-[17px] text-white/75">geral@oficinaplan.com</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/registar" className="inline-flex h-12 items-center rounded-xl bg-[var(--glow)] px-5 font-semibold text-white">Criar conta</Link>
            <a href="mailto:geral@oficinaplan.com?subject=Or%C3%A7amento%20OficinaPlan" className="inline-flex h-12 items-center rounded-xl border border-white/30 px-5 font-semibold">Pede o teu orçamento</a>
          </div>
        </div>
        <footer className="border-t border-white/10 px-5 py-6 text-center text-[14px] text-white/60">© OficinaPlan · geral@oficinaplan.com</footer>
      </section>
    </div>
  );
}

export function SlugFinder() {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setActiveSlug(null); document.title = "OficinaPlan"; }, []);
  return (
    <main className="grid min-h-screen md:grid-cols-[1.08fr_0.92fr]">
      <EntryBrand />
      <section className="flex items-center justify-center bg-[var(--paper)] px-5 py-10">
        <form
          className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_12px_40px_rgba(19,27,36,.08)] sm:p-8"
          onSubmit={(event) => {
            event.preventDefault();
            const next = slug.trim().toLowerCase();
            const problem = slugError(next);
            if (problem) { setError(problem); return; }
            window.location.assign(`/${next}`);
          }}
        >
          <h1 className="text-[26px] font-semibold text-[var(--ink)]">Usa o link da tua oficina</h1>
          <p className="mt-2 text-[15px] text-[var(--muted-text)]">Cada oficina entra em oficinaplan.com/nome-da-oficina. Escreve o endereço que te deram.</p>
          <label className="mt-5 grid gap-1 text-[15px] font-medium text-[var(--ink)]">Endereço
            <Input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} className="h-12 border-[var(--line)] text-[17px]" placeholder="a-minha-oficina" autoCapitalize="none" />
          </label>
          {error ? <p className="mt-3 text-[15px] text-[#9c4036]">{error}</p> : null}
          <Button type="submit" className="mt-4 h-12 w-full bg-[var(--ink)] text-[17px] hover:bg-[var(--graphite)]">Abrir a oficina</Button>
          <p className="mt-4 text-[15px] text-[var(--muted-text)]">Ainda não tens conta? <Link to="/registar" className="font-semibold text-[var(--glow-deep)]">Regista a tua oficina</Link></p>
        </form>
      </section>
    </main>
  );
}

export function RegisterPage() {
  const [company, setCompany] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);
  useEffect(() => { setActiveSlug(null); document.title = "Criar conta · OficinaPlan"; }, []);
  return (
    <main className="grid min-h-screen md:grid-cols-[1.08fr_0.92fr]">
      <EntryBrand />
      <section className="flex items-center justify-center bg-[var(--paper)] px-5 py-10">
        <form
          className="grid w-full max-w-md gap-4 rounded-2xl bg-white p-6 shadow-[0_12px_40px_rgba(19,27,36,.08)] sm:p-8"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const nextSlug = String(data.get("slug") ?? "").trim().toLowerCase();
            const problem = slugError(nextSlug);
            if (problem) { setError(problem); return; }
            setPending(true);
            setError("");
            void signUp(String(data.get("email") ?? ""), String(data.get("password") ?? ""), String(data.get("company") ?? ""), String(data.get("owner") ?? ""), nextSlug).then((result) => {
              if ("error" in result && result.error) {
                setPending(false);
                setError(result.error.includes("endereço") || result.error.includes("usado") ? "Este endereço já está a ser usado ou não é válido." : result.error);
                return;
              }
              window.location.assign(`/${nextSlug}`);
            });
          }}
        >
          <div>
            <h1 className="text-[26px] font-semibold text-[var(--ink)]">Regista a tua oficina</h1>
            <p className="mt-1 text-[15px] text-[var(--muted-text)]">Crias a conta e ficas com o teu link. A oficina fica ativa depois da confirmação.</p>
          </div>
          <label className="grid gap-1 text-[15px] font-medium">Nome da oficina
            <Input name="company" required value={company} onChange={(event) => { const value = event.target.value; setCompany(value); if (!slugTouched) setSlug(suggestSlug(value)); }} className="h-12 border-[var(--line)] text-[17px]" placeholder="Oficina do João" />
          </label>
          <label className="grid gap-1 text-[15px] font-medium">Endereço
            <span className="flex h-12 items-center rounded-md border border-[var(--line)] bg-white px-3 text-[16px]">
              <span className="text-[var(--muted-text)]">oficinaplan.com/</span>
              <input name="slug" required value={slug} onChange={(event) => { setSlugTouched(true); setSlug(event.target.value.toLowerCase()); }} className="min-w-0 flex-1 bg-transparent outline-none" placeholder="oficina-do-joao" autoCapitalize="none" />
            </span>
          </label>
          <label className="grid gap-1 text-[15px] font-medium">O teu nome
            <Input name="owner" required autoComplete="name" className="h-12 border-[var(--line)] text-[17px]" placeholder="João Silva" />
          </label>
          <label className="grid gap-1 text-[15px] font-medium">E-mail
            <Input name="email" type="email" required autoComplete="username" className="h-12 border-[var(--line)] text-[17px]" />
          </label>
          <label className="grid gap-1 text-[15px] font-medium">Palavra-passe
            <span className="relative">
              <Input name="password" type={show ? "text" : "password"} required minLength={6} autoComplete="new-password" className="h-12 border-[var(--line)] pr-16 text-[17px]" />
              <button type="button" className="absolute top-1/2 right-3 -translate-y-1/2 text-[14px] font-semibold text-[var(--glow-deep)]" onClick={() => setShow((value) => !value)}>{show ? "Ocultar" : "Mostrar"}</button>
            </span>
          </label>
          {error ? <p className="text-[15px] text-[#9c4036]">{error}</p> : null}
          <Button type="submit" disabled={pending} className="h-12 bg-[var(--ink)] text-[17px] hover:bg-[var(--graphite)]">{pending ? "A criar…" : "Criar conta"}</Button>
          <p className="text-[15px] text-[var(--muted-text)]">Já tens conta? Abre o link da tua oficina, por exemplo oficinaplan.com/o-teu-nome.</p>
        </form>
      </section>
    </main>
  );
}

export function BrandedLogin({ slug, notice }: { slug: string; notice?: string }) {
  const [pub, setPub] = useState<{ name: string; logo: string | null } | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  useEffect(() => {
    setActiveSlug(slug);
    let gone = false;
    void resolveCompanyPublic(slug).then((row) => { if (!gone && row) setPub(row); });
    return () => { gone = true; };
  }, [slug]);
  const title = pub?.name || slug;
  useEffect(() => { document.title = `${title} · OficinaPlan`; }, [title]);
  return (
    <main className="grid min-h-screen md:grid-cols-[1.08fr_0.92fr]">
      <EntryBrand />
      <section className="flex items-center justify-center bg-[var(--paper)] px-5 py-10">
        <form
          className="grid w-full max-w-md gap-4 rounded-2xl bg-white p-6 shadow-[0_12px_40px_rgba(19,27,36,.08)] sm:p-8"
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            setError("");
            setInfo("");
            void signInWithUsername(slug, username.trim(), secret).then(async (result) => {
              if ("error" in result && result.error) { setPending(false); setError(result.error); return; }
              const user = "user" in result ? result.user : undefined;
              if (!user || !slugMatches(user, slug)) {
                await signOut();
                setPending(false);
                setError("Esta conta não pertence a esta oficina. Usa o link da tua oficina.");
                return;
              }
              if (user.memberActive === false) {
                await signOut();
                setPending(false);
                setError("O teu acesso a esta oficina está desativado.");
                return;
              }
              const tablet = user.companyStatus === "active" && (user.role === "tecnico" || user.role === "mecanico");
              window.location.assign(tablet ? `/${slug}/oficina` : `/${slug}`);
            });
          }}
        >
          <div className="flex items-center gap-3">
            {pub?.logo ? <img src={pub.logo} alt="" className="h-12 max-w-[140px] object-contain" /> : <ProductMark wordmark={false} />}
            <div>
              <h1 className="text-[26px] font-semibold text-[var(--ink)]">{title}</h1>
              <p className="text-[14px] text-[var(--muted-text)]">oficinaplan.com/{slug}</p>
            </div>
          </div>
          <p className="text-[15px] text-[var(--muted-text)]">{notice || "Entra com o utilizador desta oficina. O administrador usa a palavra-passe. A equipa usa um PIN de 4 dígitos."}</p>
          <label className="grid gap-1 text-[15px] font-medium">Utilizador
            <Input name="username" required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="h-12 border-[var(--line)] text-[17px]" />
          </label>
          <label className="grid gap-1 text-[15px] font-medium">PIN ou palavra-passe
            <span className="relative">
              <Input name="password" type={show ? "text" : "password"} required autoComplete="current-password" value={secret} onChange={(event) => setSecret(event.target.value)} className="h-12 border-[var(--line)] pr-16 text-[17px]" />
              <button type="button" className="absolute top-1/2 right-3 -translate-y-1/2 text-[14px] font-semibold text-[var(--glow-deep)]" onClick={() => setShow((value) => !value)}>{show ? "Ocultar" : "Mostrar"}</button>
            </span>
          </label>
          {error ? <p className="text-[15px] text-[#9c4036]" role="alert">{error}</p> : null}
          {info ? <p className="text-[15px] text-[var(--glow-deep)]">{info}</p> : null}
          <Button type="submit" disabled={pending} className="h-12 bg-[var(--ink)] text-[17px] hover:bg-[var(--graphite)]">{pending ? "A entrar…" : "Entrar"}</Button>
          <button
            type="button"
            className="justify-self-start text-[15px] font-medium text-[var(--glow-deep)]"
            onClick={(event) => {
              if (!username.trim()) { setError("Indica o utilizador."); return; }
              setError("");
              void forgotOwnerPassword(slug, username).then((result) => {
                if ("error" in result && result.error) setError(result.error);
                else setInfo(result.message || "Se este utilizador for o administrador, enviámos um e-mail para repor a palavra-passe.");
              });
            }}
          >Esqueci-me da palavra-passe</button>
        </form>
      </section>
    </main>
  );
}

export function PlatformScreen({ user, children }: { user: CloudUser | null; children: React.ReactNode }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => { setActiveSlug(null); document.title = "Administração · OficinaPlan"; }, []);
  if (user?.platformAdmin) {
    return (
      <main className="min-h-screen bg-[var(--paper)] px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center justify-between">
            <ProductMark />
            <button type="button" className="text-[15px] font-semibold text-[var(--glow-deep)]" onClick={() => { void signOut().then(() => window.location.assign("/admin")); }}>Terminar sessão</button>
          </div>
          {children}
        </div>
      </main>
    );
  }
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-5 py-10">
      <form
        className="grid w-full max-w-md gap-4 rounded-2xl bg-white p-8 shadow-[0_12px_40px_rgba(19,27,36,.08)]"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setPending(true);
          setError("");
          void signIn(String(data.get("email") ?? ""), String(data.get("password") ?? "")).then(async (result) => {
            if ("error" in result && result.error) { setPending(false); setError(result.error); return; }
            const signed = "user" in result ? result.user : undefined;
            if (!signed?.platformAdmin) {
              await signOut();
              setPending(false);
              setError("Esta página é só para a administração do OficinaPlan.");
              return;
            }
            window.location.assign("/admin");
          });
        }}
      >
        <ProductMark />
        <h1 className="text-[26px] font-semibold text-[var(--ink)]">Administração OficinaPlan</h1>
        <p className="text-[15px] text-[var(--muted-text)]">Entra com a conta de administração da plataforma.</p>
        <Input name="email" type="email" required placeholder="E-mail" className="h-12 border-[var(--line)]" />
        <Input name="password" type="password" required minLength={6} placeholder="Palavra-passe" className="h-12 border-[var(--line)]" />
        {error ? <p className="text-[15px] text-[#9c4036]">{error}</p> : null}
        <Button type="submit" disabled={pending} className="h-12 bg-[var(--ink)] hover:bg-[var(--graphite)]">{pending ? "A entrar…" : "Entrar"}</Button>
        <Link to="/" className="text-[15px] text-[var(--glow-deep)]">Voltar ao site</Link>
      </form>
    </main>
  );
}

export function useSignedInSlug() {
  return useSyncExternalStore(subscribeCloud, () => {
    const user = readCloudUser();
    if (!user) return null;
    return user.slug || (user.companyName.toLowerCase().includes("hyperion") ? "hyperion" : suggestSlug(user.companyName)) || null;
  }, () => null);
}
