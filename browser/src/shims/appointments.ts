import { saveAppointmentRecord, deleteAppointmentRecord, convertAppointmentRecord } from "../store";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveAppointment(formData: FormData) {
  const duration = Number(text(formData, "duration"));
  if (!Number.isFinite(duration) || duration < 15) return { ok: false as const, error: "Duração inválida." };
  if (text(formData, "title").length < 2) return { ok: false as const, error: "Indica o tipo de serviço." };
  return saveAppointmentRecord({
    date: text(formData, "date"),
    time: text(formData, "time"),
    duration,
    clientId: text(formData, "clientId"),
    vehicleId: text(formData, "vehicleId"),
    title: text(formData, "title"),
    notes: text(formData, "notes"),
  });
}

export async function deleteAppointment(id: string) {
  return deleteAppointmentRecord(id);
}

export async function convertAppointment(id: string) {
  return convertAppointmentRecord(id);
}
