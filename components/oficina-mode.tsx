"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PinDialog } from "@/components/pin-dialog";
import { pinMatches, readUsers, subscribeAccess } from "@/lib/user-settings";
import {
  assignTechnician,
  formatClock,
  moveAssignment,
  openLog,
  readAssignments,
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
};

export function OficinaMode({ orders, admin = false }: { orders: OficinaOrder[]; admin?: boolean }) {
  const users = useSyncExternalStore(subscribeAccess, readUsers, readUsers).filter((user) => user.active && user.technician);
  const services = useSyncExternalStore(subscribeOps, readServices, readServices).filter((service) => service.active);
  useSyncExternalStore(subscribeOps, readLogs, readLogs);
  useSyncExternalStore(subscribeOps, readAssignments, readAssignments);
  const [techId, setTechId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [pinFor, setPinFor] = useState("");
  const [pinError, setPinError] = useState("");
  const [reorder, setReorder] = useState(false);
  const [chat, setChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<{ from: "tecnico" | "ajuda"; text: string }[]>([]);
  const [touched, setTouched] = useState(Date.now());

  useEffect(() => {
    if (admin || chat || !techId) return;
    const timer = window.setInterval(() => {
      if (Date.now() - touched > 15000) {
        setTechId("");
        setOrderId("");
        setChat(false);
      }
    }, 400);
    return () => window.clearInterval(timer);
  }, [admin, chat, techId, touched]);

  const tech = users.find((user) => user.id === techId);
  const queue = readAssignments().filter((item) => item.userId === techId).sort((a, b) => a.position - b.position);
  const running = techId ? openLog(techId) : null;
  const order = orders.find((item) => item.id === orderId);

  function identify(id: string) {
    if (admin) {
      setTechId(id);
      setOrderId("");
      return;
    }
    setPinFor(id);
    setPinError("");
  }

  function touch() {
    setTouched(Date.now());
  }

  return (
    <div data-testid="modo-oficina" className="min-h-[70vh] bg-white p-3 text-[#22272a]" onPointerDown={touch}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold">{admin ? "Técnicos" : "Modo oficina"}</h1>
        {tech ? <button type="button" className="h-12 rounded-xl border px-4 text-[18px]" onClick={() => { setTechId(""); setOrderId(""); setChat(false); }}>{tech.name}</button> : null}
      </div>
      {!tech ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {users.map((user) => (
            <button key={user.id} type="button" data-testid="tecnico-nome" className="h-24 rounded-2xl bg-[#00a9fd] text-[28px] font-semibold text-white" onClick={() => identify(user.id)}>{user.name}</button>
          ))}
        </div>
      ) : order ? (
        <div className="grid gap-3">
          <button type="button" className="h-12 w-fit rounded-xl border px-4 text-[18px]" onClick={() => { setOrderId(""); setChat(false); }}>Voltar às obras</button>
          <h2 className="text-[26px] font-semibold">{order.number} · {order.plate}</h2>
          <p className="text-[18px] text-[#4d6d73]">{order.vehicle}</p>
          <ul className="grid gap-2">
            {order.tasks.length ? order.tasks.map((task) => <li key={task} data-testid="tarefa" className="rounded-xl bg-[#f4f6f8] px-4 py-3 text-[20px]">{task}</li>) : <li className="text-[18px] text-[#8d939c]">Sem tarefas de serviço nesta obra.</li>}
          </ul>
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
            {admin ? <button type="button" data-testid="reordenar" className="h-12 rounded-xl border px-4 text-[18px]" onClick={() => setReorder((value) => !value)}>{reorder ? "Concluir" : "✎ Ordenar"}</button> : null}
          </div>
          <div className="grid gap-2">
            {queue.map((item) => {
              const card = orders.find((orderItem) => orderItem.id === item.orderId);
              if (!card) return null;
              const active = running?.kind === "obra" && running.targetId === card.id;
              return (
                <div key={card.id} data-testid="obra-tecnico" className="flex items-center gap-2">
                  <button type="button" className={`h-20 flex-1 rounded-2xl px-4 text-left text-[22px] font-semibold ${active ? "bg-[#1f9d55] text-white" : "bg-[#e7f7f8]"}`} onClick={() => setOrderId(card.id)}>
                    {card.number} · {card.plate}
                    <span className="mt-1 block text-[16px] font-normal">{card.vehicle}</span>
                  </button>
                  {admin && reorder ? (
                    <span className="grid gap-1">
                      <button type="button" aria-label="Subir obra" className="h-9 rounded border px-2" onClick={() => moveAssignment(tech.id, card.id, -1)}>↑</button>
                      <button type="button" aria-label="Descer obra" className="h-9 rounded border px-2" onClick={() => moveAssignment(tech.id, card.id, 1)}>↓</button>
                    </span>
                  ) : null}
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
                  <p className="text-[20px] font-semibold">{service.name}</p>
                  <TimerButtons userId={tech.id} kind="interno" targetId={service.id} running={active} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {pinFor ? (
        <PinDialog title={users.find((user) => user.id === pinFor)?.name ?? "PIN"} error={pinError} onClose={() => setPinFor("")} onSubmit={(pin) => {
          if (!pinMatches(pinFor, pin)) {
            setPinError(readUsers().find((user) => user.id === pinFor)?.pin ? "PIN incorreto." : "Este utilizador ainda não tem PIN. Defina-o em Utilizadores.");
            return;
          }
          setTechId(pinFor);
          setPinFor("");
          setOrderId("");
        }} />
      ) : null}
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

export function workedLabel(orderId: string) {
  return formatClock(workedMs(orderId));
}

export { assignTechnician };
