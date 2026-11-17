export function carColor(_seed: string) {
  return "#111111";
}

export function CarSide({ color: _color, className, photo }: { color?: string; className?: string; photo?: string | null }) {
  const box = className ?? "mx-auto h-11 w-[86%] object-contain";
  if (photo) {
    return <img src={photo} alt="" data-testid="foto-viatura" className={box} />;
  }
  return (
    <svg viewBox="0 0 200 72" data-testid="foto-viatura" aria-hidden="true" className={box}>
      <path fill="#111111" d="M18 46c0-8 6-14 16-16l18-12c6-4 14-6 24-6h46c12 0 22 4 30 12l16 14c8 2 16 8 16 16v6H18v-14z" />
      <path fill="#111111" d="M14 48h172c4 0 6 3 6 6v4H8v-4c0-3 2-6 6-6z" />
      <circle cx="52" cy="58" r="10" fill="#111111" />
      <circle cx="148" cy="58" r="10" fill="#111111" />
      <circle cx="52" cy="58" r="4" fill="#f4f6f8" />
      <circle cx="148" cy="58" r="4" fill="#f4f6f8" />
    </svg>
  );
}
