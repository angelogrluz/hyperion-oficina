"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { nextDocumentNumber, nextInvoiceSequence } from "@/lib/documents";
import { round2 } from "@/lib/domain";
import { dateOnly, lisbonParts } from "@/lib/format";
import { buildInvoiceDraft } from "@/lib/invoice/draft";
import { getInvoiceAdapter } from "@/lib/invoice";
import { issueMoloniInvoice, issueMoloniQuote, SHEET_PAYMENTS } from "@/lib/moloni/service";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh() {
  revalidatePath("/", "layout");
}

const lineSchema = z.object({
  kind: z.enum(["mao_de_obra", "peca"]),
  description: z.string().trim().min(1, "Cada linha precisa de descrição.").max(200),
  quantity: z.number().positive("A quantidade tem de ser superior a zero."),
  unitPrice: z.number().min(0, "Preço inválido."),
  unitCost: z.number().min(0, "Custo inválido."),
  discountPercent: z.number().min(0).max(100).default(0),
  vatRate: z.number().min(0).max(100),
  internalNote: z.string().max(200).default(""),
  articleId: z.string().nullable(),
});

const orderSchema = z.object({
  clientId: z.string(),
  vehicleId: z.string(),
  dateIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de entrada inválida."),
  dateOut: z.string(),
  km: z.number().int().min(0, "Os quilómetros não podem ser negativos.").max(2_000_000),
  kmOut: z.number().int().min(0).max(2_000_000).nullable().optional(),
  problem: z.string().trim().max(2000),
  notes: z.string().max(2000),
  status: z.enum(["aberta", "em_curso", "concluida"]),
  approval: z.enum(["aguarda", "aprovado", "recusado"]).optional(),
  approvalAt: z.string().nullable().optional(),
  lines: z.array(lineSchema).max(80),
});

const quoteSchema = z.object({
  clientId: z.string().min(1, "Escolha o cliente."),
  vehicleId: z.string().min(1, "Escolha a viatura."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  validUntil: z.string(),
  km: z.number().int().min(0).max(2_000_000),
  problem: z.string().trim().min(3, "Descreva o trabalho a orçamentar.").max(2000),
  notes: z.string().max(2000),
  status: z.enum(["aberto", "aceite", "recusado"]),
  lines: z.array(lineSchema).max(80),
});

async function ownedVehicle(clientId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || vehicle.clientId !== clientId) return null;
  return vehicle;
}

function lineCreate(lines: z.infer<typeof lineSchema>[]) {
  return lines.map((line, position) => ({
    kind: line.kind,
    description: line.description,
    quantity: line.quantity,
    unitPrice: round2(line.unitPrice),
    unitCost: line.kind === "mao_de_obra" ? 0 : round2(line.unitCost),
    discountPercent: round2(line.discountPercent),
    vatRate: line.vatRate,
    internalNote: line.internalNote,
    articleId: line.kind === "peca" ? line.articleId : null,
    position,
  }));
}

export async function saveOrder(id: string | null, payload: unknown): Promise<Result<{ id: string }>> {
  await requireUser();
  const parsed = orderSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (parsed.data.dateOut && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.dateOut)) {
    return { ok: false, error: "Data de saída inválida." };
  }
  if (parsed.data.dateOut && parsed.data.dateOut < parsed.data.dateIn) {
    return { ok: false, error: "A data de saída não pode ser anterior à entrada." };
  }

  const clientId = parsed.data.clientId || null;
  const vehicleId = parsed.data.vehicleId || null;
  if (clientId && !(await prisma.client.findUnique({ where: { id: clientId } }))) {
    return { ok: false, error: "Cliente não encontrado." };
  }
  const vehicle = vehicleId ? await prisma.vehicle.findUnique({ where: { id: vehicleId } }) : null;
  if (vehicleId && !vehicle) return { ok: false, error: "Viatura não encontrada." };

  for (const line of parsed.data.lines) {
    if (line.kind === "peca" && line.articleId) {
      const article = await prisma.article.findUnique({ where: { id: line.articleId } });
      if (!article) return { ok: false, error: "Uma das peças já não existe no stock." };
    }
  }

  let dateOut = parsed.data.dateOut ? dateOnly(parsed.data.dateOut) : null;
  if (parsed.data.status === "concluida" && !dateOut) dateOut = dateOnly(lisbonParts().iso);

  try {
    const savedId = await prisma.$transaction(async (tx) => {
      if (vehicle && clientId && vehicle.clientId !== clientId) {
        await tx.vehicle.update({ where: { id: vehicle.id }, data: { clientId } });
      }
      if (vehicle && parsed.data.km > vehicle.km) {
        await tx.vehicle.update({ where: { id: vehicle.id }, data: { km: parsed.data.km } });
      }
      const data = {
        clientId,
        vehicleId,
        dateIn: dateOnly(parsed.data.dateIn),
        dateOut,
        km: parsed.data.km,
        kmOut: parsed.data.kmOut ?? null,
        problem: parsed.data.problem,
        notes: parsed.data.notes,
        status: parsed.data.status,
        approval: parsed.data.approval ?? "aguarda",
        approvalAt: parsed.data.approval && parsed.data.approval !== "aguarda" && parsed.data.approvalAt
          ? new Date(parsed.data.approvalAt)
          : null,
      };
      if (!id) {
        const number = await nextDocumentNumber(tx, "OR");
        const created = await tx.repairOrder.create({
          data: { ...data, number, lines: { create: lineCreate(parsed.data.lines) } },
        });
        return created.id;
      }

      const current = await tx.repairOrder.findUnique({ where: { id } });
      if (!current) throw new Error("Ordem não encontrada.");
      if (current.status === "faturada") throw new Error("Uma ordem faturada não pode ser alterada.");
      if (current.quoteId && clientId) {
        await tx.quote.update({
          where: { id: current.quoteId },
          data: { clientId, ...(vehicleId ? { vehicleId } : {}) },
        });
      }
      await tx.documentLine.deleteMany({ where: { orderId: id } });
      await tx.repairOrder.update({
        where: { id },
        data: {
          ...data,
          lines: { create: lineCreate(parsed.data.lines) },
        },
      });
      return id;
    });
    refresh();
    return { ok: true, id: savedId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível guardar a ordem." };
  }
}

export async function saveQuote(id: string | null, payload: unknown): Promise<Result<{ id: string }>> {
  await requireUser();
  const parsed = quoteSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (parsed.data.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.validUntil)) {
    return { ok: false, error: "Data de validade inválida." };
  }
  const vehicle = await ownedVehicle(parsed.data.clientId, parsed.data.vehicleId);
  if (!vehicle) return { ok: false, error: "A viatura não pertence ao cliente." };

  try {
    const savedId = await prisma.$transaction(async (tx) => {
      const data = {
        clientId: parsed.data.clientId,
        vehicleId: parsed.data.vehicleId,
        date: dateOnly(parsed.data.date),
        validUntil: parsed.data.validUntil ? dateOnly(parsed.data.validUntil) : null,
        km: parsed.data.km,
        problem: parsed.data.problem,
        notes: parsed.data.notes,
        status: parsed.data.status,
      };
      if (!id) {
        const number = await nextDocumentNumber(tx, "ORC");
        const created = await tx.quote.create({
          data: {
            ...data,
            number,
            lines: { create: lineCreate(parsed.data.lines) },
          },
        });
        return created.id;
      }
      const current = await tx.quote.findUnique({ where: { id } });
      if (!current) throw new Error("Orçamento não encontrado.");
      if (current.status === "convertido") throw new Error("Um orçamento convertido não pode ser alterado.");
      await tx.documentLine.deleteMany({ where: { quoteId: id } });
      await tx.quote.update({
        where: { id },
        data: {
          ...data,
          lines: { create: lineCreate(parsed.data.lines) },
        },
      });
      return id;
    });
    refresh();
    return { ok: true, id: savedId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível guardar o orçamento." };
  }
}

export async function convertQuote(id: string): Promise<Result<{ orderId: string }>> {
  await requireUser();
  const quote = await prisma.quote.findUnique({ where: { id }, include: { lines: true, order: true } });
  if (!quote) return { ok: false, error: "Orçamento não encontrado." };
  if (quote.order || quote.status === "convertido") return { ok: false, error: "Este orçamento já foi convertido." };
  if (quote.status === "recusado") return { ok: false, error: "Um orçamento recusado não pode ser convertido." };

  try {
    const order = await prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "OR");
      const created = await tx.repairOrder.create({
        data: {
          number,
          clientId: quote.clientId,
          vehicleId: quote.vehicleId,
          dateIn: dateOnly(lisbonParts().iso),
          km: quote.km,
          problem: quote.problem,
          notes: quote.notes,
          status: "aberta",
          quoteId: quote.id,
          lines: {
            create: quote.lines.map((line) => ({
              kind: line.kind,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              unitCost: line.unitCost,
              discountPercent: line.discountPercent,
              vatRate: line.vatRate,
              articleId: line.articleId,
              position: line.position,
            })),
          },
        },
      });
      await tx.quote.update({ where: { id: quote.id }, data: { status: "convertido" } });
      return created;
    });
    refresh();
    return { ok: true, orderId: order.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível converter o orçamento." };
  }
}

export async function issueQuote(orderId: string): Promise<Result<{ documentNumber: string; url: string }>> {
  await requireUser();
  const order = await prisma.repairOrder.findUnique({
    where: { id: orderId },
    include: { client: true, vehicle: true, lines: { orderBy: { position: "asc" } } },
  });
  if (!order?.client || !order.vehicle) return { ok: false, error: "Indique o cliente e a viatura antes de gerar o orçamento." };
  if (order.lines.length === 0) return { ok: false, error: "A folha não tem linhas." };
  if (order.quoteNumber && order.quoteUrl) return { ok: true, documentNumber: order.quoteNumber, url: order.quoteUrl };
  const year = lisbonParts().year;
  const sequence = (await prisma.repairOrder.count({ where: { quoteNumber: { startsWith: `ORC A/${year}/` } } })) + 1;
  try {
    const issued = await issueMoloniQuote({
      orderId,
      orderNumber: order.number,
      sequence,
      year,
      customer: {
        name: order.client.name,
        nif: order.client.nif,
        address: order.client.address,
        postalCode: order.client.postalCode,
        city: order.client.city,
        email: order.client.email,
        phone: order.client.phone,
      },
      lines: order.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        total: line.quantity * line.unitPrice,
      })),
      total: order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice * (1 + line.vatRate / 100), 0),
    });
    const url = issued.url ?? `/ordens/${orderId}/orcamento`;
    await prisma.repairOrder.update({ where: { id: orderId }, data: { quoteNumber: issued.documentNumber, quoteUrl: url } });
    refresh();
    return { ok: true, documentNumber: issued.documentNumber, url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "A Moloni recusou o orçamento." };
  }
}

export async function issueInvoice(orderId: string, paymentMethod = "Transferência"): Promise<Result<{ documentNumber: string; provider: string; url: string }>> {
  await requireUser();
  const order = await prisma.repairOrder.findUnique({
    where: { id: orderId },
    include: {
      client: true,
      vehicle: true,
      lines: { orderBy: { position: "asc" }, include: { article: true } },
    },
  });
  if (!order) return { ok: false, error: "Ordem não encontrada." };
  const client = order.client;
  const vehicle = order.vehicle;
  if (!client || !vehicle) return { ok: false, error: "Indique o cliente e a viatura antes de faturar." };
  if (order.status === "faturada") return { ok: false, error: "Esta ordem já foi faturada." };
  if (order.status !== "concluida") return { ok: false, error: "Só é possível faturar uma ordem concluída." };
  if (order.lines.length === 0) return { ok: false, error: "A ordem não tem linhas para faturar." };
  if (!SHEET_PAYMENTS.includes(paymentMethod as (typeof SHEET_PAYMENTS)[number])) {
    return { ok: false, error: "Escolha o modo de pagamento." };
  }

  const workshop = await prisma.workshop.findUnique({ where: { id: "default" } });
  if (!workshop) return { ok: false, error: "A oficina não está configurada." };

  const year = lisbonParts().year;
  const sequence = await nextInvoiceSequence(prisma, year);
  const draft = buildInvoiceDraft({ order: { ...order, client, vehicle }, workshop, sequence, year });
  draft.paymentMethod = paymentMethod;

  let issued;
  try {
    issued = await issueMoloniInvoice({
      orderId,
      orderNumber: order.number,
      sequence,
      year,
      customer: draft.customer,
      lines: draft.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        total: line.total,
      })),
      total: draft.totals.total,
      paymentMethod,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "O adaptador de faturação recusou o documento.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.repairOrder.findUnique({ where: { id: orderId } });
      if (!current || current.status !== "concluida") throw new Error("A ordem mudou de estado. Atualize a página.");
      const clash = await tx.repairOrder.findFirst({ where: { invoiceNumber: issued.documentNumber } });
      if (clash) throw new Error("Esse número de documento já existe. Tente faturar outra vez.");
      await tx.repairOrder.update({
        where: { id: orderId },
        data: {
          status: "faturada",
          invoiceNumber: issued.documentNumber,
          invoiceProvider: issued.providerLabel,
          invoiceIssuedAt: new Date(),
          invoiceSimulated: issued.simulated,
          invoiceUrl: issued.url ?? `/ordens/${orderId}/fatura`,
          paymentMethod,
          dateOut: current.dateOut ?? dateOnly(lisbonParts().iso),
        },
      });
      await tx.invoiceLog.create({
        data: {
          orderId,
          providerId: issued.providerId,
          providerLabel: issued.providerLabel,
          simulated: issued.simulated,
          documentNumber: issued.documentNumber,
          requestJson: JSON.stringify(draft),
          responseJson: JSON.stringify(issued),
        },
      });
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível gravar a fatura." };
  }

  refresh();
  return { ok: true, documentNumber: issued.documentNumber, provider: issued.providerLabel, url: issued.url ?? `/ordens/${orderId}/fatura` };
}
