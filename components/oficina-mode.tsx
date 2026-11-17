"use client";

import { useEffect, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { ProductBackButton } from "@/components/product-mark";
import { pinMatches, readUsers, subscribeAccess } from "@/lib/user-settings";
import { readSession } from "@/browser/src/shims/auth";
import { recordPath } from "@/lib/nav-history";
import {
  assignTechnician,
  formatClock,
  openLog,
  reorderAssignments,
  personMs,
  punch,
  readAssignments,
  readPunches,
  readLogs,
  readServices,
  startWork,
  stopWork,
  subscribeOps,
  workedMs,
} from "@/lib/workshop-ops";

export type OficinaOrder = {
  id: string;
  number: string;
  plate: string;
  vehicle: string;
  clientName: string;
  tasks: string[];
  serviceHours: number | null;
};

export function OficinaMode({ orders, admin = false }: { orders: OficinaOrder[]; admin?: boolean }) {
  const users = useSyncExternalStore(subscribeAccess, readUsers, readUsers).filter((user) => user.active && user.technician);
  const services = useSyncExternalStore(subscribeOps, readServices, readServices).filter((service) => service.active);
  useSyncExternalStore(subscribeOps, readLogs, readLogs);
  useSyncExternalStore(subscribeOps, readAssignments, readAssignments);
  const [techId, setTechId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [pinFor, setPinFor] = useState("");
  const [reorder, setReorder] = useState(false);
  const [chat, setChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<{ from: "tecnico" | "ajuda"; text: string }[]>([]);
  const [touched, setTouched] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [ponto, setPonto] = useState("");
  const [pontoMsg, setPontoMsg] = useState("");
  const [internos, setInternos] = useState(false);
  const [serviceId, setServiceId] = useState("");
  useEffect(() => { if (!admin) recordPath("/modo-oficina"); }, [admin]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (admin || chat || (!techId && !internos)) return;
    const timer = window.setInterval(() => {
      if (Date.now() - touched > 15000) {
        setTechId("");
        setOrderId("");
        setChat(false);
        setInternos(false);
        setServiceId("");
        setReorder(false);
      }
    }, 400);
    return () => window.clearInterval(timer);
  }, [admin, chat, techId, internos, touched]);

  const tech = users.find((user) => user.id === techId);
  const queue = readAssignments().filter((item) => item.userId === techId).sort((a, b) => a.position - b.position);
  const running = techId ? openLog(techId) : null;
  const order = orders.find((item) => item.id === orderId);

  function identify(id: string) {
    setTechId(id);
    setOrderId("");
    setChat(false);
  }

  function touch() {
    setTouched(Date.now());
  }

  function startDrag(event: ReactPointerEvent, userId: string, orderId: string) {
    event.preventDefault();
    const ids = readAssignments().filter((item) => item.userId === userId).sort((a, b) => a.position - b.position).map((item) => item.orderId);
    const move = (ev: PointerEvent) => {
      const target = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest("[data-order-id]")?.getAttribute("data-order-id");
      if (!target || target === orderId) return;
      const from = ids.indexOf(orderId);
      const to = ids.indexOf(target);
      if (from < 0 || to < 0 || from === to) return;
      ids.splice(from, 1);
      ids.splice(to, 0, orderId);
      reorderAssignments(userId, ids);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  return (
    <div data-testid={admin ? "pagina-tecnicos" : "modo-oficina"} className={admin ? "min-h-[70vh] bg-white p-3 text-[#22272a]" : "min-h-screen bg-white p-4 text-[#22272a]"} onPointerDown={touch}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="w-52">{admin ? <h1 className="text-[28px] font-semibold">Técnicos</h1> : <ProductBackButton onBeforeBack={() => { if (orderId) { setOrderId(""); setChat(false); return true; } if (techId) { setTechId(""); setChat(false); return true; } return Boolean(readSession()?.role === "mecanico"); }} />}</div>
        {tech ? <button type="button" className="h-12 rounded-xl border px-4 text-[18px]" onClick={() => { setTechId(""); setOrderId(""); setChat(false); }}>{tech.name}</button> : <h1 className="text-[28px] font-semibold">{admin ? "" : "Modo oficina"}</h1>}
      </div>
      {!tech ? (
        <div className="grid gap-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {users.map((user) => (
              <button key={user.id} type="button" data-testid="tecnico-nome" className="h-12 rounded-xl bg-[#00a9fd] px-4 text-[18px] font-semibold text-white" onClick={() => identify(user.id)}>{user.name}</button>
            ))}
          </div>
          {admin ? null : (
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="picar-ponto" className="h-16 min-w-64 flex-1 rounded-2xl bg-[#22272a] text-[28px] font-semibold text-white" onClick={() => { setPonto(""); setPontoMsg(""); setPinFor("ponto"); }}>Picar o ponto</button>
              <button type="button" data-testid="servicos-internos" className="h-16 min-w-64 flex-1 rounded-2xl border-2 border-[#22272a] text-[24px] font-semibold" onClick={() => { setInternos(true); setServiceId(""); }}>Serviços internos</button>
            </div>
          )}
          {admin ? null : <TechnicianTable users={users} orders={orders} services={services} now={now} />}
          {internos ? (
            <div data-testid="lista-internos" className="grid gap-2 rounded-2xl border border-[#d5ebed] bg-white p-3">
              <div className="flex items-center justify-between"><h2 className="text-[20px] font-semibold">Serviços internos</h2><button type="button" onClick={() => setInternos(false)}>Fechar</button></div>
              {!serviceId ? services.map((service) => (
                <button key={service.id} type="button" data-testid="interno-opcao" className="h-14 rounded-xl bg-[#f4f6f8] text-left text-[20px] font-semibold" onClick={() => setServiceId(service.id)}>{service.name}</button>
              )) : (
                <div className="grid gap-2">
                  <p className="text-[16px]">Quem começa {services.find((service) => service.id === serviceId)?.name}?</p>
                  {users.map((user) => (
                    <button key={user.id} type="button" className="h-12 rounded-xl bg-[#00a9fd] text-[18px] font-semibold text-white" onClick={() => { startWork(user.id, "interno", serviceId); setInternos(false); setServiceId(""); }}>{user.name}</button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : order ? (
        <div className="grid gap-3">
          <button type="button" className="h-12 w-fit rounded-xl border px-4 text-[18px]" onClick={() => { setOrderId(""); setChat(false); }}>Voltar às obras</button>
          <h2 className="text-[26px] font-semibold">{order.number} · {order.plate}</h2>
          <p className="text-[18px] text-[#4d6d73]">{order.vehicle}</p>
          <ul className="grid gap-2">
            {order.tasks.length ? order.tasks.map((task) => <li key={task} data-testid="tarefa" className="rounded-xl bg-[#f4f6f8] px-4 py-3 text-[20px]">{task}</li>) : <li className="text-[18px] text-[#8d939c]">Sem tarefas de serviço nesta obra.</li>}
          </ul>
          <p data-testid="relogio-tecnico" className="text-[42px] font-semibold tabular-nums text-[#00a9fd]">{formatClock(personMs(tech.id, "obra", order.id, now))}</p>
          <TimerButtons userId={tech.id} kind="obra" targetId={order.id} running={running?.kind === "obra" && running.targetId === order.id} />
          <button type="button" data-testid="ajuda-tecnica" className="h-14 rounded-2xl border-2 border-[#00a9fd] text-[20px] font-semibold text-[#00a9fd]" onClick={() => { setChat(true); setMessages([{ from: "ajuda", text: `Viatura ${order.vehicle}, matrícula ${order.plate}. Tarefas: ${order.tasks.join("; ") || "nenhuma"}. O assistente fica disponível na fase cloud.` }]); }}>Ajuda técnica</button>
          {chat ? (
            <div data-testid="ajuda-chat" className="rounded-2xl border border-[#d5ebed] p-3">
              <div className="mb-2 flex justify-between"><p className="text-[18px] font-semibold">Ajuda técnica</p><button type="button" onClick={() => setChat(false)}>Fechar</button></div>
              <ul className="grid max-h-64 gap-2 overflow-auto">
                {messages.map((message, index) => <li key={index} className={`rounded-xl px-3 py-2 text-[16px] ${message.from === "ajuda" ? "bg-[#e7f7f8]" : "bg-[#f4f6f8]"}`}>{message.text}</li>)}
              </ul>
              <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!draft.trim()) return; setMessages((current) => [...current, { from: "tecnico", text: draft.trim() }, { from: "ajuda", text: "Resposta automática ainda não está ligada. Fica para a fase cloud." }]); setDraft(""); }}>
                <input value={draft} onChange={(event) => setDraft(event.target.value)} className="h-12 flex-1 rounded-xl border px-3 text-[18px]" placeholder="Escreva a dúvida" />
                <button className="h-12 rounded-xl bg-[#00a9fd] px-4 font-semibold text-white">Enviar</button>
              </form>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] font-semibold">Obras de {tech.name}</h2>
            <button type="button" data-testid="reordenar" className="h-12 rounded-xl border px-4 text-[18px]" onClick={() => setReorder((value) => !value)}>{reorder ? "Concluir" : "✎ Ordenar"}</button>
          </div>
          <div className="grid gap-2">
            {queue.map((item) => {
              const card = orders.find((orderItem) => orderItem.id === item.orderId);
              if (!card) return null;
              const active = running?.kind === "obra" && running.targetId === card.id;
              return (
                <div key={card.id} data-testid="obra-tecnico" data-order-id={card.id} className="flex items-center gap-2">
                  {reorder ? <span data-testid="drag-handle" aria-label="Arrastar obra" className="grid h-20 w-10 cursor-grab place-items-center rounded-xl bg-[#e1e2e5] text-[22px] select-none active:cursor-grabbing" onPointerDown={(event) => startDrag(event, tech.id, card.id)}>≡</span> : null}
                  <button type="button" className={`h-20 flex-1 rounded-2xl px-4 text-left text-[22px] font-semibold ${active ? "bg-[#1f9d55] text-white" : "bg-[#e7f7f8]"}`} onClick={() => { if (!reorder) setOrderId(card.id); }}>
                    {card.number} · {card.plate}
                    <span className="mt-1 block text-[16px] font-normal">{card.vehicle}</span>
                  </button>
                </div>
              );
            })}
          </div>
          <h2 className="text-[22px] font-semibold">Serviços internos</h2>
          <div className="grid gap-2">
            {services.map((service) => {
              const active = running?.kind === "interno" && running.targetId === service.id;
              return (
                <div key={service.id} data-testid="servico-oficina" className="flex items-center justify-between gap-2 rounded-2xl bg-[#f4f6f8] px-4 py-3">
                  <div>
                    <p className="text-[20px] font-semibold">{service.name}</p>
                    {active ? <p data-testid="relogio-interno" className="text-[28px] font-semibold tabular-nums text-[#00a9fd]">{formatClock(personMs(tech.id, "interno", service.id, now))}</p> : null}
                  </div>
                  <TimerButtons userId={tech.id} kind="interno" targetId={service.id} running={active} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {pinFor === "ponto" ? (
        <form data-testid="ponto-teclado" className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" onSubmit={(event) => {
          event.preventDefault();
          if (ponto.length !== 4) { setPontoMsg("PIN incorreto."); return; }
          const user = readUsers().find((item) => item.active && item.clocksIn && pinMatches(item.id, ponto));
          if (!user) { setPontoMsg("PIN incorreto."); return; }
          const hadOpen = readPunches().some((item) => item.userId === user.id && !item.outAt);
          punch(user.id);
          const row = readPunches().filter((item) => item.userId === user.id).at(-1);
          const stamp = new Date(hadOpen ? row?.outAt ?? Date.now() : row?.inAt ?? Date.now());
          const clock = `${String(stamp.getHours()).padStart(2, "0")}:${String(stamp.getMinutes()).padStart(2, "0")}`;
          setPontoMsg(`${user.name}: ${hadOpen ? "saída" : "entrada"} registada às ${clock}.`);
          setPonto("");
          window.setTimeout(() => { setPinFor(""); setPontoMsg(""); }, 2200);
        }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="text-[32px] font-semibold">Picar o ponto</h2>
            <p data-testid="ponto-pin" className="mt-4 text-center text-[40px] tracking-[0.35em]">{(ponto || "").padEnd(4, "·").slice(0, 4)}</p>
            {pontoMsg ? <p data-testid="ponto-confirmacao" className="mt-3 text-center text-[22px] font-semibold">{pontoMsg}</p> : null}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9","←","0","OK"].map((key) => (
                <button key={key} type={key === "OK" ? "submit" : "button"} className="h-20 rounded-xl bg-[#e7f7f8] text-[28px] font-semibold" onClick={() => { if (key === "←") setPonto((value) => value.slice(0, -1)); else if (key !== "OK") setPonto((value) => (value + key).slice(0, 4)); }}>{key}</button>
              ))}
            </div>
            <button type="button" className="mt-3 h-14 w-full rounded-xl border text-[20px]" onClick={() => { setPinFor(""); setPontoMsg(""); }}>Fechar</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function paceClass(elapsed: number, hours: number | null) {
  if (hours == null || hours <= 0) return "";
  const estimate = hours * 3_600_000;
  if (elapsed >= estimate) return "text-[#d64545]";
  if (elapsed >= estimate * 0.9) return "text-[#b8860b]";
  return "text-[#1f9d55]";
}

function TechnicianTable({ users, orders, services, now }: { users: Array<{ id: string; name: string }>; orders: OficinaOrder[]; services: Array<{ id: string; name: string }>; now: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#d5ebed] bg-white">
      <table data-testid="oficina-tabela" className="w-full min-w-[760px] text-left text-[16px]">
        <thead>
          <tr className="text-[14px] text-[#4d6d73]">
            <th className="px-3 py-2 font-semibold">Nome</th>
            <th className="px-3 py-2 font-semibold">Marca e modelo</th>
            <th className="px-3 py-2 font-semibold">Nº obra</th>
            <th className="px-3 py-2 font-semibold">Tempo decorrido</th>
            <th className="px-3 py-2 font-semibold">Tempo estipulado</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const open = openLog(user.id);
            const order = open?.kind === "obra" ? orders.find((item) => item.id === open.targetId) : null;
            const service = open?.kind === "interno" ? services.find((item) => item.id === open.targetId) : null;
            const elapsed = open ? personMs(user.id, open.kind, open.targetId, now) : 0;
            const hours = order?.serviceHours ?? null;
            return (
              <tr key={user.id} data-testid="linha-tecnico" className="border-t border-[#eaeaf2]">
                <td className="px-3 py-3 font-semibold">{user.name}</td>
                <td className="px-3 py-3">{order?.vehicle || service?.name || "Livre"}</td>
                <td className="px-3 py-3">{order?.number ?? "—"}</td>
                <td className={`px-3 py-3 font-semibold tabular-nums ${open?.kind === "obra" ? paceClass(elapsed, hours) : ""}`}>{open ? formatClock(elapsed) : "—"}</td>
                <td className="px-3 py-3 tabular-nums">{hours ? formatClock(hours * 3_600_000) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TimerButtons({ userId, kind, targetId, running }: { userId: string; kind: "obra" | "interno"; targetId: string; running: boolean }) {
  return running ? (
    <button type="button" data-testid="terminar" className="h-14 rounded-xl bg-[#d64545] px-4 text-[18px] font-semibold text-white" onClick={() => stopWork(userId)}>Terminar</button>
  ) : (
    <button type="button" data-testid="comecar" className="h-14 rounded-xl bg-[#1f9d55] px-4 text-[18px] font-semibold text-white" onClick={() => startWork(userId, kind, targetId)}>Começar</button>
  );
}

export function TechnicianStatus({ orders }: { orders: OficinaOrder[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useSyncExternalStore(subscribeOps, readLogs, readLogs);
  const techs = useSyncExternalStore(subscribeAccess, readUsers, readUsers).filter((user) => user.active && user.technician);
  const services = readServices();
  return (
    <aside data-testid="tecnicos-agora" className="h-fit rounded-2xl border border-[#d5ebed] bg-white p-4">
      <h2 className="text-[20px] font-semibold">Técnicos agora</h2>
      <ul className="mt-3 grid gap-3">
        {techs.map((tech) => {
          const open = openLog(tech.id);
          if (!open) return <li key={tech.id} data-testid="tecnico-livre" className="rounded-xl bg-[#f4f6f8] px-3 py-2 text-[17px]"><span className="font-semibold">{tech.name}</span> · Livre</li>;
          const elapsed = formatClock(personMs(tech.id, open.kind, open.targetId, now));
          const place = open.kind === "interno"
            ? services.find((service) => service.id === open.targetId)?.name ?? "Serviço interno"
            : orders.find((item) => item.id === open.targetId);
          const label = typeof place === "string" || !place ? place || "Serviço" : `${place.clientName} · ${place.plate} · ${place.number}`;
          return <li key={tech.id} data-testid="tecnico-ocupado" className="rounded-xl bg-[#e7f7f8] px-3 py-2 text-[17px]"><span className="font-semibold">{tech.name}</span><span className="mt-1 block">{label}</span><span className="text-[22px] font-semibold tabular-nums text-[#00a9fd]">{elapsed}</span></li>;
        })}
      </ul>
    </aside>
  );
}

export function workedLabel(orderId: string) {
  return formatClock(workedMs(orderId));
}

export { assignTechnician };
