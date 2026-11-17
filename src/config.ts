/** Unused by the pages app. Documents read the workshop's own settings, which start empty. */
export const company = {
  legalName: "",
  nif: "",
  address: "",
  postalCode: "",
  city: "",
  country: "",
  phone: "",
  email: "",
  site: "",
  siteUrl: "",
  ibanBank: "",
  iban: "",
};

/** Tipologias do lançamento de compras. Só as marcadas com stock mexem no inventário. */
export const purchaseTypes = [
  { id: "produto", label: "Produto (stock)", stock: true },
  { id: "oleo", label: "Óleo", stock: true },
  { id: "ferramentas", label: "Ferramentas", stock: false },
  { id: "consumiveis", label: "Consumíveis", stock: false },
  { id: "despesas", label: "Despesas internas (oficina)", stock: false },
  { id: "servicos", label: "Serviços externos", stock: false },
  { id: "outros", label: "Outros", stock: false },
] as const;

/** Taxa ECOLUB por litro. As definições podem substituir este valor. */
export const ecolubDefaults = {
  ref: "ECOLUB",
  description: "ECO TAXA LUBRIFICANTES",
  rate: 0.09,
  vat: 23,
  margin: 0,
};

export type PurchaseTypeId = (typeof purchaseTypes)[number]["id"];

export function purchaseTypeById(id: string) {
  return purchaseTypes.find((item) => item.id === id) ?? purchaseTypes[0];
}

export function purchaseTypeMovesStock(id: string) {
  return purchaseTypeById(id).stock;
}
