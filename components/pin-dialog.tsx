"use client";

export function PinDialog({
  title,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  error?: string;
  onClose: () => void;
  onSubmit: (pin: string) => void;
}) {
  return (
    <form
      data-testid="pin-dialog"
      className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit(String(data.get("pin") ?? ""));
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-[var(--charcoal)] shadow-xl">
        <h2 className="text-[22px] font-semibold">{title}</h2>
        <p className="mt-1 text-[16px] text-[var(--muted-text)]">Introduza o PIN numérico deste utilizador.</p>
        <input name="pin" data-testid="pin-input" inputMode="numeric" maxLength={4} autoFocus className="mt-4 h-14 w-full rounded-xl border border-[var(--line)] px-3 text-center text-[28px] tracking-[0.3em]" />
        {error ? <p className="mt-2 text-[15px] text-[#d64545]">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className="h-12 flex-1 rounded-xl border border-[var(--line)] text-[17px]" onClick={onClose}>Cancelar</button>
          <button type="submit" className="h-12 flex-1 rounded-xl bg-[var(--glow)] text-[17px] font-semibold text-white">Confirmar</button>
        </div>
      </div>
    </form>
  );
}
