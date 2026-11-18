import { writeClientCache } from "@/lib/browser-cache";
import { normalizeNif, normalizePlate } from "@/lib/domain";
import {
  deleteClientRecord,
  deleteSupplierRecord,
  deleteVehicleRecord,
  removeArticleRecord,
  saveArticleRecord,
  ensureConsumidorFinalRecord,
  saveClientRecord,
  saveSupplierRecord,
  saveVehicleRecord,
} from "../store";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveClient(id: string | null, formData: FormData) {
  const data = {
    name: text(formData, "name"),
    nif: normalizeNif(text(formData, "nif")),
    phone: text(formData, "phone"),
    email: text(formData, "email").toLowerCase(),
    address: text(formData, "address"),
    postalCode: text(formData, "postalCode"),
    city: text(formData, "city"),
    notes: text(formData, "notes"),
  };
  const result = await saveClientRecord(id, data);
  if (result.ok) writeClientCache(result.id, data);
  return result;
}

export async function ensureConsumidorFinal() {
  return ensureConsumidorFinalRecord();
}

export async function deleteClient(id: string) {
  return deleteClientRecord(id);
}

export async function saveVehicle(id: string | null, formData: FormData) {
  return saveVehicleRecord(id, {
    clientId: text(formData, "clientId"),
    plate: normalizePlate(text(formData, "plate")),
    brand: text(formData, "brand"),
    model: text(formData, "model"),
    version: text(formData, "version"),
    year: /^\d{4}$/.test(text(formData, "year")) ? Number(text(formData, "year")) : null,
    vin: text(formData, "vin").toUpperCase(),
    engine: text(formData, "engine"),
    km: Number(text(formData, "km") || 0),
    fuel: text(formData, "fuel"),
    ...(formData.has("engineCode") ? { engineCode: text(formData, "engineCode") } : {}),
    ...(formData.has("oil") ? { oil: text(formData, "oil") } : {}),
    ...(formData.has("nextInspection") ? { nextInspection: text(formData, "nextInspection") } : {}),
    ...(formData.has("nextService") ? { nextService: text(formData, "nextService") } : {}),
  });
}

export async function deleteVehicle(id: string) {
  return deleteVehicleRecord(id);
}

export async function saveArticle(id: string | null, formData: FormData) {
  const { parseDecimal, normalizeRef, normalizeArticleDescription, isOilArticle, defaultMargin, defaultMinStock } = await import("@/lib/domain");
  const ref = normalizeRef(text(formData, "ref"));
  const family = text(formData, "family") || "Produto";
  const marginInput = text(formData, "marginPercent");
  const margin = marginInput ? parseDecimal(marginInput) : defaultMargin({ family, ref });
  const cost = parseDecimal(text(formData, "costPrice"));
  return saveArticleRecord(id, {
    ref,
    description: normalizeArticleDescription(text(formData, "description")),
    family,
    costPrice: cost ?? 0,
    marginPercent: margin ?? 40,
    vatRate: parseDecimal(text(formData, "vatRate")) ?? 23,
    stockQty: parseDecimal(text(formData, "stockQty")) ?? 0,
    minStock: parseDecimal(text(formData, "minStock")) ?? defaultMinStock({ family, ref, isOil: isOilArticle({ family, ref }) }),
    isOil: isOilArticle({ family, ref }),
  });
}

export async function removeArticle(id: string) {
  return removeArticleRecord(id);
}

export async function saveSupplier(id: string | null, formData: FormData) {
  return saveSupplierRecord(id, {
    name: text(formData, "name"),
    nif: normalizeNif(text(formData, "nif")),
    phone: text(formData, "phone"),
    email: text(formData, "email").toLowerCase(),
    address: text(formData, "address"),
    notes: text(formData, "notes"),
  });
}

export async function deleteSupplier(id: string) {
  return deleteSupplierRecord(id);
}
