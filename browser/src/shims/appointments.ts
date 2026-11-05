import { saveAppointmentRecord, deleteAppointmentRecord } from "../store";

const DURATIONS = [30, 45, 60, 90, 120, 180];

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveAppointment(formData: FormData) {
  const duration = Number(text(formData, "duration"));
  if (!DURATIONS.includes(duration)) return { ok: false as const, error: "Duração inválida." };
  if (text(formData, "title").length < 2) return { ok: false as const, error: "Indique o motivo da marcação." };
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
