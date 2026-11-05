import { Plate } from "@/components/plate";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";

export const metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden flex-col justify-between bg-[#17211f] px-12 py-10 text-white lg:flex">
        <Logo light />
        <div>
          <Plate value="AB-19-CK" />
          <h1 className="mt-6 max-w-md text-4xl font-semibold tracking-tight">O balcão da oficina, sem papelada solta.</h1>
          <p className="mt-4 max-w-md text-white/70">
            Clientes, viaturas, ordens de reparação, orçamentos, stock e marcações. A faturação certificada fica para um
            fornecedor como a Moloni — aqui corre em simulação.
          </p>
        </div>
        <p className="text-sm text-white/50">Hyperion Car Lab · Vila Nova de Gaia</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Iniciar sessão</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acesso da gerência da oficina.</p>
          <div className="mt-6">
            <LoginForm from={params.from} />
          </div>
          <div className="mt-6 rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/10">
            <p className="font-medium">Credenciais de demonstração</p>
            <p className="mt-1 text-muted-foreground">admin@hyperioncarlab.pt</p>
            <p className="text-muted-foreground">oficina</p>
          </div>
        </div>
      </section>
    </main>
  );
}
