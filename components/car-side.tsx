const COLORS = ["#7aa8b4", "#5c6b73", "#c46a5a", "#d5dbe0", "#1f7d8c", "#8aa0a6", "#b9c6c4"];

export function carColor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function CarSide({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 180 64" className="mx-auto h-11 w-[86%]" aria-hidden>
      <ellipse cx="90" cy="56" rx="62" ry="4" fill="#d5ebed" />
      <path
        fill={color}
        d="M28 40c2-10 12-16 24-18l18-8c8-3 18-4 28-2l22 6c10 3 16 8 20 16l6 6H28z"
      />
      <path fill="#f7fbfb" d="M62 22c6-6 16-8 26-6l16 5c4 1 6 3 7 6H70c-2-2-5-4-8-5z" />
      <circle cx="58" cy="46" r="9" fill="#14343a" />
      <circle cx="58" cy="46" r="4" fill="#e7f7f8" />
      <circle cx="128" cy="46" r="9" fill="#14343a" />
      <circle cx="128" cy="46" r="4" fill="#e7f7f8" />
    </svg>
  );
}
