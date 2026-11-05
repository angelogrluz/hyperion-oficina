export function Logo({ light = false }: { light?: boolean }) {
  const src = typeof window !== "undefined" && window.location.pathname.includes("/hyperion-oficina")
    ? "/hyperion-oficina/logo-hyperion.png"
    : "/logo-hyperion.png";
  return (
    <img
      src={src}
      alt="Hyperion Car Lab"
      width={2422}
      height={576}
      className={light ? "h-auto max-h-8 w-full bg-white object-contain" : "h-11 w-auto object-contain"}
      style={{ aspectRatio: "2422 / 576" }}
    />
  );
}
