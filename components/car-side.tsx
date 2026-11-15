const bundled = `${(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/")}car-neutral.jpg`;

export function carColor(_seed: string) {
  return "#d7dde2";
}

export function CarSide({ color: _color, className, photo }: { color?: string; className?: string; photo?: string | null }) {
  return (
    <img
      src={photo || bundled}
      alt=""
      data-testid="foto-viatura"
      className={className ?? "mx-auto h-11 w-[86%] object-contain"}
    />
  );
}
