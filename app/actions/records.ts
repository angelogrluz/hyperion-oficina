"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { CONSUMIDOR_FINAL } from "@/lib/consumidor";
import { prisma } from "@/lib/db";
import {
  defaultMargin,
  defaultMinStock,
  isOilArticle,
  isValidNif,
  isValidPlate,
  isValidRef,
  isValidVin,
  normalizeArticleDescription,
  normalizeNif,
  normalizePlate,
  normalizeRef,
  parseDecimal,
} from "@/lib/domain";
import { FUELS } from "@/lib/labels";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { ok: false, error: "Já existe um registo com este identificador." };
  }
  return { ok: false, error: fallback };
}

function refresh() {
  revalidatePath("/", "layout");
}

const clientSchema = z.object({
  name: z.string().trim().min(2, "Indique o nome.").max(120),
  nif: z.string().refine(isValidNif, "NIF inválido."),
  phone: z.string().max(40),
  email: z.string().max(120).refine((value) => value === "" || z.string().email().safeParse(value).success, "E-mail inválido."),
  address: z.string().max(240),
  postalCode: z.string().max(12),
  city: z.string().max(80),
  notes: z.string().max(1000),
});

export async function saveClient(id: string | null, formData: FormData): Promise<ActionResult<{ id: string; name: string; nif: string }>> {
  await requireUser();
  const parsed = clientSchema.safeParse({
    name: text(formData, "name"),
    nif: normalizeNif(text(formData, "nif")),
    phone: text(formData, "phone"),
    email: text(formData, "email").toLowerCase(),
    address: text(formData, "address"),
    postalCode: text(formData, "postalCode"),
    city: text(formData, "city"),
    notes: text(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const duplicate = await prisma.client.findFirst({
    where: { nif: parsed.data.nif, NOT: id ? { id } : undefined },
  });
  if (duplicate) return { ok: false, error: "Já existe um cliente com este NIF." };

  try {
    const client = id
      ? await prisma.client.update({ where: { id }, data: parsed.data })
      : await prisma.client.create({ data: parsed.data });
    refresh();
    return { ok: true, id: client.id, name: client.name, nif: client.nif };
  } catch (error) {
    return fail(error, "Não foi possível guardar o cliente.");
  }
}

export async function ensureConsumidorFinal(): Promise<ActionResult<{ id: string; name: string; nif: string }>> {
  await requireUser();
  const existing = await prisma.client.findFirst({ where: { nif: CONSUMIDOR_FINAL.nif } });
  if (existing) {
    const client = await prisma.client.update({
      where: { id: existing.id },
      data: { name: CONSUMIDOR_FINAL.name, address: "", nif: CONSUMIDOR_FINAL.nif },
    });
    refresh();
    return { ok: true, id: client.id, name: client.name, nif: client.nif };
  }
  const client = await prisma.client.create({
    data: { name: CONSUMIDOR_FINAL.name, nif: CONSUMIDOR_FINAL.nif, phone: "", email: "", address: "", notes: "" },
  });
  refresh();
  return { ok: true, id: client.id, name: client.name, nif: client.nif };
}

export async function deleteClient(id: string): Promise<ActionResult> {
  await requireUser();
  const [vehicles, orders, quotes, appointments] = await Promise.all([
    prisma.vehicle.count({ where: { clientId: id } }),
    prisma.repairOrder.count({ where: { clientId: id } }),
    prisma.quote.count({ where: { clientId: id } }),
    prisma.appointment.count({ where: { clientId: id } }),
  ]);
  if (vehicles || orders || quotes || appointments) {
    return { ok: false, error: "Este cliente tem viaturas, documentos ou marcações. Não pode ser eliminado." };
  }
  await prisma.client.delete({ where: { id } });
  refresh();
  return { ok: true };
}

const vehicleSchema = z.object({
  clientId: z.string(),
  plate: z.string().refine(isValidPlate, "A matrícula tem de estar no formato AA-00-AA."),
  brand: z.string().trim().max(40),
  model: z.string().trim().max(60),
  version: z.string().trim().max(80),
  year: z.coerce.number().int().min(1950, "Ano inválido.").max(new Date().getFullYear() + 1, "Ano inválido."),
  vin: z.string().refine(isValidVin, "O VIN, se preenchido, tem 17 caracteres (sem I, O ou Q)."),
  engine: z.string().trim().max(80),
  km: z.coerce.number().int().min(0, "Os quilómetros não podem ser negativos.").max(2_000_000),
  fuel: z.string().refine((value) => (FUELS as readonly string[]).includes(value), "Escolha o combustível."),
});

export async function saveVehicle(
  id: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; clientId: string | null; plate: string; brand: string; model: string; km: number }>> {
  await requireUser();
  const parsed = vehicleSchema.safeParse({
    clientId: text(formData, "clientId"),
    plate: normalizePlate(text(formData, "plate")),
    brand: text(formData, "brand"),
    model: text(formData, "model"),
    version: text(formData, "version"),
    year: text(formData, "year"),
    vin: text(formData, "vin").toUpperCase(),
    engine: text(formData, "engine"),
    km: text(formData, "km") || "0",
    fuel: text(formData, "fuel"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const clientId = parsed.data.clientId || null;
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return { ok: false, error: "Cliente não encontrado." };
  }
  const duplicate = await prisma.vehicle.findFirst({
    where: { plate: parsed.data.plate, NOT: id ? { id } : undefined },
  });
  if (duplicate) return { ok: false, error: "Já existe uma viatura com esta matrícula." };

  try {
    const data = { ...parsed.data, clientId };
    const vehicle = id
      ? await prisma.vehicle.update({ where: { id }, data })
      : await prisma.vehicle.create({ data });
    refresh();
    return {
      ok: true,
      id: vehicle.id,
      clientId: vehicle.clientId,
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      km: vehicle.km,
    };
  } catch (error) {
    return fail(error, "Não foi possível guardar a viatura.");
  }
}

export async function deleteVehicle(id: string): Promise<ActionResult> {
  await requireUser();
  const [orders, quotes, appointments] = await Promise.all([
    prisma.repairOrder.count({ where: { vehicleId: id } }),
    prisma.quote.count({ where: { vehicleId: id } }),
    prisma.appointment.count({ where: { vehicleId: id } }),
  ]);
  if (orders || quotes || appointments) {
    return { ok: false, error: "Esta viatura tem ordens, orçamentos ou marcações." };
  }
  await prisma.vehicle.delete({ where: { id } });
  refresh();
  return { ok: true };
}

export async function saveArticle(id: string | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const ref = normalizeRef(text(formData, "ref"));
  const description = normalizeArticleDescription(text(formData, "description"));
  const family = text(formData, "family") || "Produto";
  const cost = parseDecimal(text(formData, "costPrice"));
  const marginInput = text(formData, "marginPercent");
  const margin = marginInput ? parseDecimal(marginInput) : defaultMargin({ family, ref });
  const vat = parseDecimal(text(formData, "vatRate")) ?? 23;
  const stock = parseDecimal(text(formData, "stockQty")) ?? 0;
  const minStock = parseDecimal(text(formData, "minStock"));
  const oil = isOilArticle({ family, ref });

  if (!isValidRef(ref)) return { ok: false, error: "A referência deve ter 2 a 24 caracteres, em maiúsculas." };
  if (description.length < 2) return { ok: false, error: "Indique a descrição." };
  if (cost === null || cost < 0) return { ok: false, error: "Preço de custo inválido." };
  if (margin === null || margin < 0 || margin > 500) return { ok: false, error: "Margem inválida." };
  if (vat < 0 || vat > 100) return { ok: false, error: "IVA inválido." };
  if (stock < 0) return { ok: false, error: "O stock não pode ser negativo." };

  const duplicate = await prisma.article.findFirst({ where: { ref, NOT: id ? { id } : undefined } });
  if (duplicate) return { ok: false, error: "Já existe um artigo com esta referência." };

  const data = {
    ref,
    description,
    family,
    costPrice: cost,
    marginPercent: margin,
    vatRate: vat,
    stockQty: stock,
    minStock: minStock ?? defaultMinStock({ family, ref, isOil: oil }),
    isOil: oil,
    active: true,
  };

  try {
    const article = id
      ? await prisma.article.update({ where: { id }, data })
      : await prisma.article.create({ data });
    refresh();
    return { ok: true, id: article.id };
  } catch (error) {
    return fail(error, "Não foi possível guardar o artigo.");
  }
}

export async function removeArticle(id: string): Promise<ActionResult<{ archived: boolean }>> {
  await requireUser();
  const [lines, purchases] = await Promise.all([
    prisma.documentLine.count({ where: { articleId: id } }),
    prisma.purchaseLine.count({ where: { articleId: id } }),
  ]);
  if (lines || purchases) {
    await prisma.article.update({ where: { id }, data: { active: false } });
    refresh();
    return { ok: true, archived: true };
  }
  await prisma.article.delete({ where: { id } });
  refresh();
  return { ok: true, archived: false };
}

const supplierSchema = z.object({
  name: z.string().trim().min(2, "Indique o nome do fornecedor.").max(120),
  nif: z.string().refine((value) => value === "" || isValidNif(value), "NIF inválido."),
  phone: z.string().max(40),
  email: z.string().max(120).refine((value) => value === "" || z.string().email().safeParse(value).success, "E-mail inválido."),
  address: z.string().max(240),
  notes: z.string().max(1000),
});

export async function saveSupplier(id: string | null, formData: FormData): Promise<ActionResult<{ id: string; name: string }>> {
  await requireUser();
  const parsed = supplierSchema.safeParse({
    name: text(formData, "name"),
    nif: normalizeNif(text(formData, "nif")),
    phone: text(formData, "phone"),
    email: text(formData, "email").toLowerCase(),
    address: text(formData, "address"),
    notes: text(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  try {
    const supplier = id
      ? await prisma.supplier.update({ where: { id }, data: parsed.data })
      : await prisma.supplier.create({ data: parsed.data });
    refresh();
    return { ok: true, id: supplier.id, name: supplier.name };
  } catch (error) {
    return fail(error, "Não foi possível guardar o fornecedor.");
  }
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  await requireUser();
  const purchases = await prisma.purchase.count({ where: { supplierId: id } });
  if (purchases) return { ok: false, error: "Este fornecedor tem compras lançadas." };
  await prisma.supplier.delete({ where: { id } });
  refresh();
  return { ok: true };
}
