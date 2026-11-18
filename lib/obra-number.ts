// Obra numbers continue the Keymaster sequence: "<year>/<n>" (e.g. 2026/303), restarting each year.
// Imported history may be stored as "2026/57", "HIST-2026/57", or with a suffix ("2026/57-FT2026/12", "2026/57_1").
// Older OficinaPlan obras ("OR-2026-0001") also count, so a new number never repeats one of them.
export function obraSequenceValue(number: string, year: number): number | null {
  const text = number.trim();
  const keymaster = text.match(/^(?:HIST-)?(\d{4})\/(\d+)/i);
  if (keymaster) return Number(keymaster[1]) === year ? Number(keymaster[2]) : null;
  const legacy = text.match(/^OR-(\d{4})-(\d+)$/i);
  if (legacy) return Number(legacy[1]) === year ? Number(legacy[2]) : null;
  return null;
}

export function nextObraNumber(numbers: Iterable<string>, year: number) {
  let max = 0;
  for (const number of numbers) {
    const value = obraSequenceValue(number ?? "", year);
    if (value != null && value > max) max = value;
  }
  return `${year}/${max + 1}`;
}
