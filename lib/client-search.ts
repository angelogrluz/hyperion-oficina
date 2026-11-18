import { isValidNif, normalizeNif, normalizeSearch, plateKey } from "@/lib/domain";

export type SearchableClient = {
  id: string;
  name: string;
  nif?: string;
  phone?: string;
  email?: string;
};

export type SearchableVehicle = { clientId: string | null; plate: string };

export type ClientSeed = { name: string; nif: string; phone: string };

function digits(value: string) {
  return value.replace(/\D/g, "");
}

/** Phone digits without the Portuguese country prefix, so "+351 912…" matches "912…". */
function phoneDigits(value: string) {
  const only = digits(value);
  return only.length > 9 && only.startsWith("351") ? only.slice(3) : only;
}

/**
 * Clients that match what was typed: name (accents and case ignored), NIF, phone, e-mail or a plate
 * of one of the client's vehicles. Best matches first: exact NIF, then names that start with the text.
 */
export function matchClients<T extends SearchableClient>(
  clients: T[],
  query: string,
  vehicles: SearchableVehicle[] = [],
  limit = 8,
): T[] {
  const text = normalizeSearch(query);
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const typedDigits = digits(query);
  const onlyDigits = typedDigits.length > 0 && /^[\d\s+]+$/.test(query.trim());
  const plateText = plateKey(query);
  const platesByClient = new Map<string, string[]>();
  if (plateText.length >= 3) {
    for (const vehicle of vehicles) {
      if (!vehicle.clientId) continue;
      const list = platesByClient.get(vehicle.clientId) ?? [];
      list.push(plateKey(vehicle.plate));
      platesByClient.set(vehicle.clientId, list);
    }
  }

  const scored: Array<{ client: T; score: number }> = [];
  for (const client of clients) {
    const name = normalizeSearch(client.name);
    let score = 0;
    if (onlyDigits && typedDigits.length >= 3) {
      const nif = normalizeNif(client.nif ?? "");
      if (nif === typedDigits) score = 100;
      else if (nif.includes(typedDigits)) score = 60;
      else if (phoneDigits(client.phone ?? "").includes(phoneDigits(typedDigits))) score = 50;
    }
    if (!score && words.every((word) => name.includes(word))) {
      score = name.startsWith(text) ? 90 : words.some((word) => name.split(/\s+/).some((part) => part.startsWith(word))) ? 80 : 70;
    }
    if (!score && text.length >= 3 && normalizeSearch(client.email ?? "").includes(text)) score = 40;
    if (!score && plateText.length >= 3 && (platesByClient.get(client.id) ?? []).some((plate) => plate.includes(plateText))) score = 30;
    if (score) scored.push({ client, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.client.name.localeCompare(b.client.name, "pt"))
    .slice(0, limit)
    .map((item) => item.client);
}

/** The existing client with this NIF, if any. Empty or incomplete NIFs never match. */
export function clientWithNif<T extends SearchableClient>(clients: T[], nif: string, exceptId = ""): T | undefined {
  const wanted = normalizeNif(nif);
  if (wanted.length !== 9) return undefined;
  return clients.find((client) => client.id !== exceptId && normalizeNif(client.nif ?? "") === wanted);
}

/** Turns what was typed in the search into the first fields of a new client. */
export function seedFromQuery(query: string): ClientSeed {
  const trimmed = query.trim();
  if (/^[\d\s+]+$/.test(trimmed) && digits(trimmed)) {
    const only = digits(trimmed);
    if (isValidNif(only)) return { name: "", nif: only, phone: "" };
    return { name: "", nif: "", phone: trimmed };
  }
  return { name: trimmed, nif: "", phone: "" };
}
