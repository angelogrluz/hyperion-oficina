"use client";

import Link from "next/link";

export function Logo({ light = false }: { light?: boolean }) {
  const onPages = typeof window !== "undefined" && window.location.pathname.includes("/hyperion-oficina");
  const file = light ? "logo-hyperion-light.png" : "logo-hyperion.png";
  const src = onPages ? `/hyperion-oficina/${file}` : `/${file}`;
  return (
    <Link href="/" aria-label="Ir para o painel" title="Painel" className="block cursor-pointer">
      <img
        src={src}
        alt="Hyperion Car Lab"
        width={2422}
        height={576}
        className={light ? "h-auto max-h-8 w-full object-contain" : "h-11 w-auto object-contain"}
        style={{ aspectRatio: "2422 / 576" }}
      />
    </Link>
  );
}
