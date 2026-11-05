import Link from "next/link";
import { AppointmentForm } from "@/components/appointment-form";
import { DeleteAppointmentButton } from "@/components/delete-appointment";
import { PageHeader } from "@/components/page-header";
import { Plate } from "@/components/plate";
import { prisma } from "@/lib/db";
import { formatLongDate, lisbonParts, lisbonTime, monthGrid, monthLabel, shiftMonth, zonedDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Agenda" };

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const params = await searchParams;
  const today = lisbonParts();
  const parsed = /^(\d{4})-(\d{2})$/.exec(params.m ?? "");
  const year = parsed ? Number(parsed[1]) : today.year;
  const month = parsed ? Number(parsed[2]) : today.month;
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(params.d ?? "") ? params.d! : today.iso;
  const cells = monthGrid(year, month);
  const start = zonedDateTime(`${year}-${String(month).padStart(2, "0")}-01`, "00:00");
  const next = shiftMonth(year, month, 1);
  const end = zonedDateTime(`${next.year}-${String(next.month).padStart(2, "0")}-01`, "00:00");
  const [appointments, clients, vehicles] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: start, lt: end } },
      include: { client: true, vehicle: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({ orderBy: { plate: "asc" } }),
  ]);
  const counts = new Map<string, number>();
  for (const item of appointments) {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(item.startsAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const selectedItems = appointments.filter((item) => {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(item.startsAt);
    return key === selected;
  });
  const prev = shiftMonth(year, month, -1);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <div>
      <PageHeader title="Agenda" description="Marcações do balcão. A semana começa à segunda-feira." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_340px]">
        <section className="rounded-xl bg-card p-3 ring-1 ring-foreground/10 md:p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{monthLabel(year, month)}</h2>
            <div className="flex gap-2 text-sm">
              <Link className="rounded-lg px-3 py-1 ring-1 ring-foreground/10" href={`/agenda?m=${prev.year}-${String(prev.month).padStart(2, "0")}&d=${selected}`}>Anterior</Link>
              <Link className="rounded-lg px-3 py-1 ring-1 ring-foreground/10" href={`/agenda?d=${today.iso}`}>Hoje</Link>
              <Link className="rounded-lg px-3 py-1 ring-1 ring-foreground/10" href={`/agenda?m=${next.year}-${String(next.month).padStart(2, "0")}&d=${selected}`}>Seguinte</Link>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((cell, index) => cell ? (
              <Link
                key={cell.iso}
                href={`/agenda?m=${monthKey}&d=${cell.iso}`}
                className={cn(
                  "flex min-h-16 flex-col rounded-lg border px-2 py-1 text-left text-sm md:min-h-20",
                  cell.iso === selected ? "border-primary bg-primary/5" : "border-transparent bg-background",
                  cell.iso === today.iso ? "font-semibold" : "",
                )}
              >
                <span>{cell.day}</span>
                {counts.get(cell.iso) ? <span className="mt-auto text-xs text-copper">{counts.get(cell.iso)} marc.</span> : null}
              </Link>
            ) : <div key={`empty-${index}`} />)}
          </div>
        </section>
        <aside className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="font-medium">{formatLongDate(zonedDateTime(selected, "12:00"))}</h2>
          <ul className="mt-3 grid gap-2">
            {selectedItems.map((item) => (
              <li key={item.id} className="rounded-lg bg-background px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{lisbonTime(item.startsAt)}–{lisbonTime(item.endsAt)} · {item.title}</p>
                  <DeleteAppointmentButton id={item.id} />
                </div>
                <p className="text-muted-foreground">{item.client.name}</p>
                {item.vehicle ? <p className="mt-1"><Plate value={item.vehicle.plate} /></p> : null}
                {item.notes ? <p className="mt-1 text-muted-foreground">{item.notes}</p> : null}
              </li>
            ))}
            {selectedItems.length === 0 ? <li className="text-sm text-muted-foreground">Sem marcações neste dia.</li> : null}
          </ul>
          <div className="mt-4 border-t pt-4">
            <h3 className="mb-3 font-medium">Nova marcação</h3>
            <AppointmentForm
              date={selected}
              clients={clients.map((client) => ({ id: client.id, name: client.name }))}
              vehicles={vehicles.map((vehicle) => ({ id: vehicle.id, clientId: vehicle.clientId, plate: vehicle.plate, brand: vehicle.brand, model: vehicle.model }))}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
