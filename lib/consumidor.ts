export const CONSUMIDOR_FINAL = {
  name: "Consumidor final",
  nif: "999999990",
  address: "",
} as const;

export function isConsumidorFinal(client?: { nif?: string | null } | null) {
  return client?.nif === CONSUMIDOR_FINAL.nif;
}
