"use client";

import { readOpeningHours, WEEKDAY_LETTERS, WEEKDAYS, type CompanySettings, type DayHours } from "@/lib/company-settings";

export function OpeningHoursFields({ company, onSave }: { company: CompanySettings; onSave: (patch: Partial<CompanySettings>) => void }) {
  const days = readOpeningHours(company);
  function update(index: number, patch: Partial<DayHours>) {
    const openingHours = days.map((day, item) => item === index ? { ...day, ...patch } : day);
    onSave({ openingHours });
  }
  return (
    <div className="grid gap-3 sm:col-span-2" data-testid="horario-semana">
      <p className="text-[16px] font-medium">Dias abertos</p>
      <div className="flex flex-wrap gap-2">
        {WEEKDAY_LETTERS.map((letter, index) => (
          <button
            key={WEEKDAYS[index]}
            type="button"
            title={WEEKDAYS[index]}
            aria-pressed={days[index].open}
            data-testid={`dia-${index}`}
            className={`grid size-11 place-items-center rounded-full text-[16px] font-semibold ${days[index].open ? "bg-[var(--glow)] text-white" : "bg-white text-[var(--ink)] ring-1 ring-[var(--line)]"}`}
            onClick={() => update(index, { open: !days[index].open })}
          >{letter}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[15px]">
          <thead>
            <tr className="text-[var(--muted-text)]">
              <th className="py-2">Dia</th>
              <th>Abertura</th>
              <th>Fecho</th>
              <th>Almoço</th>
              <th>Início almoço</th>
              <th>Fim almoço</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, index) => (
              <tr key={WEEKDAYS[index]} className="border-t border-[var(--line)]">
                <td className="py-2 font-medium">{WEEKDAYS[index]}</td>
                <td><input type="time" disabled={!day.open} value={day.start} onChange={(event) => update(index, { start: event.target.value })} className="h-10 rounded-lg border px-2" /></td>
                <td><input type="time" disabled={!day.open} value={day.end} onChange={(event) => update(index, { end: event.target.value })} className="h-10 rounded-lg border px-2" /></td>
                <td><input type="checkbox" disabled={!day.open} checked={day.lunch} onChange={(event) => update(index, { lunch: event.target.checked })} aria-label={`Almoço ${WEEKDAYS[index]}`} /></td>
                <td><input type="time" disabled={!day.open || !day.lunch} value={day.lunchStart} onChange={(event) => update(index, { lunchStart: event.target.value })} className="h-10 rounded-lg border px-2" /></td>
                <td><input type="time" disabled={!day.open || !day.lunch} value={day.lunchEnd} onChange={(event) => update(index, { lunchEnd: event.target.value })} className="h-10 rounded-lg border px-2" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
