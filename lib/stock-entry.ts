export type StockLink = {
  purchaseId: string;
  purchaseLineId: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  quantity: number;
  cost: number;
  vatRate: number;
  date: string;
};

export type StockArticle = {
  id: string;
  ref: string;
  description: string;
  costPrice: number;
  lastCost: number | null;
  marginPercent: number;
  vatRate: number;
  stockQty: number;
  family: string;
};

export type StockEntryInput = {
  ref: string;
  description: string;
  quantity: number;
  supplierId: string;
  invoiceNumber: string;
  date: string;
  cost: number;
  vat: number;
  family: string;
  margin: number;
  purchaseLineId?: string | null;
  lineId?: string | null;
};
