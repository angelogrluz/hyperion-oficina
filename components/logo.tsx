export function Logo({ light = false }: { light?: boolean }) {
  const src = typeof window !== "undefined" && window.location.pathname.includes("/hyperion-oficina")
    ? "/hyperion-oficina/logo-hyperion.svg"
    : "/logo-hyperion.svg";
  return <img src={src} alt="Hyperion Car Lab" className={light ? "h-11 w-auto" : "h-12 w-auto"} />;
}
