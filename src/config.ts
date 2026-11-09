/** Dados da oficina nos documentos. O site só aparece no cabeçalho quando está preenchido. */
export const company = {
  legalName: "Hyperion Reparação Automóvel, Unipessoal, Lda",
  nif: "518445356",
  address: "Rua do Mexilhão, N19",
  postalCode: "8400-105",
  city: "Mexilhoeira da Carregação",
  country: "Portugal",
  phone: "+351 926 771 904",
  email: "hyperioncarlab@gmail.com",
  site: "oficinahyperion.pt",
  siteUrl: "https://oficinahyperion.pt/",
  ibanBank: "Santander",
  iban: "PT50 0018 0003 6425 8007 0206 2",
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
