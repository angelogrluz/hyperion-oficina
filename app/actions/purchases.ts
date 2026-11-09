"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isValidRef, normalizeArticleDescription, normalizeRef } from "@/lib/domain";
import { DOCUMENT_TYPES, PAYMENT_METHODS } from "@/lib/labels";
import { purchaseTypeMovesStock } from "@/src/config";
import { postPurchases, removeSheetStock, upsertSheetStock, voidPurchase } from "@/lib/stock";
import type { StockEntryInput } from "@/lib/stock-entry";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const lineSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  supplierId: z.string().min(1, "Escolha o fornecedor."),
  documentType: z.string(),
  invoiceNumber: z.string().trim().min(1, "Indique o número do documento.").max(40),
  paymentMethod: z.string(),
  ref: z.string(),
  description: z.string().trim().min(2, "Indique a descrição do artigo."),
  quantity: z.number().positive("A quantidade tem de ser superior a zero."),
  cost: z.number().min(0, "Custo inválido."),
  vat: z.number().min(0).max(100),
  margin: z.number().min(0).max(500),
  family: z.string().trim().min(1).max(40),
  tipologia: z.string().optional(),
});

export async function savePurchases(payload: unknown): Promise<Result<{ count: number; articles: number }>> {
  await requireUser();
  const parsed = z.array(lineSchema).min(1, "Adicione pelo menos uma linha.").max(200).safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Linha inválida." };

  const lines: Array<z.infer<typeof lineSchema> & { ref: string }> = [];
  for (const line of parsed.data) {
    if (!(DOCUMENT_TYPES as readonly string[]).includes(line.documentType)) {
      return { ok: false, error: "Tipo de documento inválido." };
    }
    if (!(PAYMENT_METHODS as readonly string[]).includes(line.paymentMethod)) {
      return { ok: false, error: "Modo de pagamento inválido." };
    }
    const stockMove = purchaseTypeMovesStock(line.tipologia || "produto");
    const ref = stockMove ? normalizeRef(line.ref) : line.ref.trim();
    if (stockMove && !isValidRef(ref)) return { ok: false, error: `Referência inválida: ${line.ref || "(vazia)"}.` };
    if (!stockMove && line.description.trim().length < 2) return { ok: false, error: "Indique a descrição da despesa." };
    const supplier = await prisma.supplier.findUnique({ where: { id: line.supplierId } });
    if (!supplier) return { ok: false, error: "Fornecedor não encontrado." };
    lines.push({ ...line, ref });
  }

  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.supplierId}|${line.documentType}|${line.invoiceNumber.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = await prisma.purchase.findFirst({
      where: {
        supplierId: line.supplierId,
        documentType: line.documentType,
        invoiceNumber: line.invoiceNumber,
        voided: false,
      },
    });
    if (existing) {
      return { ok: false, error: `O documento ${line.invoiceNumber} deste fornecedor já foi lançado.` };
    }
  }

  try {
    const result = await prisma.$transaction((tx) => postPurchases(tx, lines));
    revalidatePath("/", "layout");
    return { ok: true, count: result.purchaseIds.length, articles: result.articlesTouched };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível lançar a compra." };
  }
}

const sheetStockSchema = z.object({
  ref: z.string(),
  description: z.string(),
  quantity: z.number().positive("A quantidade tem de ser superior a zero."),
  supplierId: z.string().min(1, "Escolha o fornecedor."),
  invoiceNumber: z.string().trim().min(1, "Indique o número da fatura.").max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  cost: z.number().min(0, "Custo inválido."),
  vat: z.number().min(0).max(100),
  family: z.string().trim().min(1).max(40),
  margin: z.number().min(0).max(500),
  purchaseLineId: z.string().nullable().optional(),
  lineId: z.string().nullable().optional(),
});

export async function commitStockEntry(payload: unknown): Promise<Result<Awaited<ReturnType<typeof upsertSheetStock>>>> {
  await requireUser();
  const parsed = sheetStockSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ref = normalizeRef(parsed.data.ref);
  if (!isValidRef(ref)) return { ok: false, error: `Referência inválida: ${parsed.data.ref || "(vazia)"}.` };
  const description = normalizeArticleDescription(parsed.data.description);
  if (description.length < 2) return { ok: false, error: "Indique a descrição do artigo." };
  const input: StockEntryInput = { ...parsed.data, ref, description, invoiceNumber: parsed.data.invoiceNumber.trim() };
  try {
    const result = await prisma.$transaction((tx) => upsertSheetStock(tx, input));
    revalidatePath("/", "layout");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível dar entrada de stock." };
  }
}

export async function removeStockEntry(purchaseLineId: string): Promise<Result<Awaited<ReturnType<typeof removeSheetStock>>>> {
  await requireUser();
  if (!purchaseLineId) return { ok: false, error: "Entrada não encontrada." };
  try {
    const result = await prisma.$transaction((tx) => removeSheetStock(tx, purchaseLineId));
    revalidatePath("/", "layout");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível retirar a entrada." };
  }
}

export async function cancelPurchase(id: string): Promise<Result> {
  await requireUser();
  try {
    await prisma.$transaction((tx) => voidPurchase(tx, id));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível anular a compra." };
  }
}
