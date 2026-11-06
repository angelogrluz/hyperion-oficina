const KEY = "hyperion-oficina-folha-draft";

export type SheetDraft = {
  id: string;
  clientId: string;
  vehicleId: string;
  plate: string;
  brand: string;
  model: string;
  version: string;
  year: string;
  vin: string;
  engine: string;
  engineCode: string;
  oil: string;
  fuel: string;
  km: string;
  kmOut: string;
  nextInspection: string;
  nextService: string;
  dateIn: string;
  problem: string;
  notes: string;
  status: string;
  lines: unknown[];
};

export function writeSheetDraft(draft: SheetDraft) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(draft));
}

export function readSheetDraft(id: string): SheetDraft | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SheetDraft;
    return parsed?.id === id ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSheetDraft(id: string) {
  if (typeof localStorage === "undefined") return;
  const current = readSheetDraft(id);
  if (current) localStorage.removeItem(KEY);
}