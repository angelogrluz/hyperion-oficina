"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { zonedDateTime } from "@/lib/format";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const DURATIONS = [30, 45, 60, 90, 120, 180];

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveAppointment(formData: FormData): Promise<Result<{ id: string }>> {
  await requireUser();
  const date = text(formData, "date");
  const time = text(formData, "time");
  const duration = Number(text(formData, "duration"));
  const clientId = text(formData, "clientId");
  const vehicleId = text(formData, "vehicleId");
  const title = text(formData, "title");
  const notes = text(formData, "notes");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Data inválida." };
  if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: "Hora inválida." };
  if (!DURATIONS.includes(duration)) return { ok: false, error: "Duração inválida." };
  if (title.length < 2) return { ok: false, error: "Indique o motivo da marcação." };

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, error: "Cliente não encontrado." };
  if (vehicleId) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle || vehicle.clientId !== clientId) {
      return { ok: false, error: "A viatura não pertence ao cliente." };
    }
  }

  const startsAt = zonedDateTime(date, time);
  const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);
  const appointment = await prisma.appointment.create({
    data: {
      startsAt,
      endsAt,
      clientId,
      vehicleId: vehicleId || null,
      title,
      notes,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, id: appointment.id };
}

export async function deleteAppointment(id: string): Promise<Result> {
  await requireUser();
  await prisma.appointment.delete({ where: { id } });
  revalidatePath("/", "layout");
  return { ok: true };
}
