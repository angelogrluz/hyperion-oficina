import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium tracking-[0.16em] text-copper uppercase">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Esta página não existe.</h1>
        <p className="mt-2 text-sm text-muted-foreground">O registo pode ter sido eliminado ou o endereço está incompleto.</p>
        <Link href="/" className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground">
          Voltar ao painel
        </Link>
      </div>
    </main>
  );
}
