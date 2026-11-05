import Link from "next/link";
import { AppointmentForm } from "@/components/appointment-form";
import { DeleteAppointmentButton } from "@/components/delete-appointment";
import { prisma } from "@/lib/db";
import { lisbonISODate, lisbonParts, lisbonTime, zonedDateTime } from "@/lib/format";

export const metadata = { title: "Agenda" };

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const LABELS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function shift(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const today = lisbonParts().iso;
  const selected = /^\d{4}-\d{2}-\d{2}$/.test((await searchParams).d ?? "") ? (await searchParams).d! : today;
  const weekday = (new Date(`${selected}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = shift(selected, -weekday);
  const days = LABELS.map((label, index) => ({ label, iso: shift(monday, index) }));
  const start = zonedDateTime(days[0].iso, "00:00");
  const end = zonedDateTime(shift(days[5].iso, 1), "00:00");
  const [appointments, clients, vehicles] = await Promise.all([
    prisma.appointment.findMany({ where: { startsAt: { gte: start, lt: end } }, include: { client: true, vehicle: true }, orderBy: { startsAt: "asc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({ orderBy: { plate: "asc" } }),
  ]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-x-auto rounded-xl border border-[#d5ebed] bg-white">
        <div className="flex items-center justify-between border-b border-[#d5ebed] px-3 py-2">
          <div className="flex gap-2 text-sm">
            <Link className="rounded-md px-2 py-1 hover:bg-[#e7f7f8]" href={`/agenda?d=${shift(monday, -7)}`}>‹</Link>
            <span className="font-medium">Semana de {days[0].iso}</span>
            <Link className="rounded-md px-2 py-1 hover:bg-[#e7f7f8]" href={`/agenda?d=${shift(monday, 7)}`}>›</Link>
          </div>
          <Link href={`/agenda?d=${today}`} className="text-sm text-[#0b8f9c]">Hoje</Link>
        </div>
        <div className="grid min-w-[760px] grid-cols-[64px_repeat(6,1fr)]">
          <div />
          {days.map((day) => (
            <Link key={day.iso} href={`/agenda?d=${day.iso}`} className={`border-l border-[#d5ebed] px-2 py-2 text-center text-sm ${day.iso === selected ? "bg-[#0b8f9c] text-white" : "bg-[#e7f7f8] text-[#0b5f68]"}`}>
              {day.label} {Number(day.iso.slice(8))}
            </Link>
          ))}
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="border-t border-[#d5ebed] px-2 py-3 text-xs text-[#4d6d73]">{String(hour).padStart(2, "0")}:00</div>
              {days.map((day) => {
                const items = appointments.filter((item) => lisbonISODate(item.startsAt) === day.iso && Number(lisbonTime(item.startsAt).slice(0, 2)) === hour);
                return (
                  <div key={`${day.iso}-${hour}`} className="min-h-12 border-t border-l border-[#d5ebed] p-1">
                    {items.map((item) => (
                      <div key={item.id} className="rounded bg-[#e7f7f8] px-1 py-1 text-xs text-[#0b5f68]">
                        <p className="font-medium">{lisbonTime(item.startsAt)} {item.title}</p>
                        <p>{item.client.name}</p>
                        <DeleteAppointmentButton id={item.id} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <aside className="rounded-xl border border-[#d5ebed] bg-white p-4">
        <h2 className="mb-3 font-medium">Nova marcação · {selected}</h2>
        <AppointmentForm
          date={selected}
          clients={clients.map((client) => ({ id: client.id, name: client.name }))}
          vehicles={vehicles.map((vehicle) => ({ id: vehicle.id, clientId: vehicle.clientId, plate: vehicle.plate, brand: vehicle.brand, model: vehicle.model }))}
        />
      </aside>
    </div>
  );
}
