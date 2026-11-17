import { ProductMark } from "@/components/product-mark";

export function EntryBrand() {
  return (
    <section className="entry-brand relative flex min-h-[148px] flex-col justify-between overflow-hidden bg-[var(--ink)] px-5 py-5 text-white sm:px-8 md:min-h-screen md:px-12 md:py-12">
      <ProductMark light />
      <div className="relative z-10 my-8 hidden max-w-md md:block">
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight lg:text-[40px]">A gestão da tua oficina, simples e organizada</h1>
        <ul className="mt-6 grid gap-2 text-[17px] text-white/90">
          <li>Obras e agenda</li>
          <li>Faturação</li>
          <li>Stock e resultados</li>
        </ul>
      </div>
      <p className="relative z-10 hidden text-[14px] text-white/75 md:block">© OficinaPlan · geral@oficinaplan.com</p>
    </section>
  );
}
