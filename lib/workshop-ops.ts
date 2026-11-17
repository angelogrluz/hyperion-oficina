import { cloudBlankMode } from "@/lib/cloud-session";

const SERVICES_KEY = "hyperion-oficina-servicos-internos";
const ASSIGN_KEY = "hyperion-oficina-tecnicos";
const LOG_KEY = "hyperion-oficina-tempos";
const PUNCH_KEY = "hyperion-oficina-pontos";
const listeners = new Set<() => void>();

export type InternalService = { id: string; name: string; active: boolean };

export type Assignment = { orderId: string; userId: string; position: number };

export type WorkLog = {
  id: string;
  userId: string;
  kind: "obra" | "interno";
  targetId: string;
  startedAt: string;
  endedAt: string | null;
  carriedMs?: number;
};

export type Punch = { id: string; userId: string; inAt: string; outAt: string | null };

const defaultServices: InternalService[] = [
  { id: "srv-limpeza", name: "Limpeza de oficina", active: true },
  { id: "srv-deslocacao", name: "Deslocação de carros", active: true },
  { id: "srv-pausa", name: "Pausa", active: true },
];

const defaultAssignments: Assignment[] = [
  { orderId: "o-ana", userId: "u-joao", position: 0 },
  { orderId: "o-joao", userId: "u-joao", position: 1 },
  { orderId: "o-rui", userId: "u-joao", position: 2 },
  { orderId: "o-helena", userId: "u-bernardo", position: 0 },
  { orderId: "o-master", userId: "u-bernardo", position: 1 },
];

const defaultLogs: WorkLog[] = [
  { id: "log-demo", userId: "u-joao", kind: "obra", targetId: "o-ana", startedAt: "2026-11-04T09:00:00.000Z", endedAt: "2026-11-04T10:15:00.000Z" },
];

const defaultPunches: Punch[] = [
  { id: "punch-demo", userId: "u-joao", inAt: "2026-11-04T08:30:00.000Z", outAt: "2026-11-04T18:00:00.000Z" },
];

function notify() {
  listeners.forEach((listener) => listener());
}

const cache = new Map<string, { raw: string; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  const raw = localStorage.getItem(key) ?? "";
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return (raw ? hit.value : fallback) as T;
  let value: T = fallback;
  if (raw) {
    try { value = JSON.parse(raw) as T; } catch { value = fallback; }
  }
  cache.set(key, { raw, value });
  return raw ? value : fallback;
}

function write<T>(key: string, value: T) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  notify();
  void import("@/browser/src/cloud").then((cloud) => cloud.afterLocalWrite());
}

export function subscribeOps(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readServices() {
  const items = read<InternalService[] | null>(SERVICES_KEY, null);
  return items?.length ? items : defaultServices;
}
export function writeServices(items: InternalService[]) {
  write(SERVICES_KEY, items);
}

export function readAssignments() {
  if (typeof localStorage !== "undefined" && cloudBlankMode() && !localStorage.getItem(ASSIGN_KEY)) return [];
  return read<Assignment[] | null>(ASSIGN_KEY, null) ?? defaultAssignments;
}
export function writeAssignments(items: Assignment[]) {
  write(ASSIGN_KEY, items);
}

export function readLogs() {
  if (typeof localStorage !== "undefined" && cloudBlankMode() && !localStorage.getItem(LOG_KEY)) return [];
  return read<WorkLog[] | null>(LOG_KEY, null) ?? defaultLogs;
}
export function writeLogs(items: WorkLog[]) {
  write(LOG_KEY, items);
}

export function readPunches() {
  if (typeof localStorage !== "undefined" && cloudBlankMode() && !localStorage.getItem(PUNCH_KEY)) return [];
  return read<Punch[] | null>(PUNCH_KEY, null) ?? defaultPunches;
}
export function writePunches(items: Punch[]) {
  write(PUNCH_KEY, items);
}

export function technicianOf(orderId: string) {
  return readAssignments().find((item) => item.orderId === orderId)?.userId ?? "";
}

export function assignTechnician(orderId: string, userId: string) {
  const rest = readAssignments().filter((item) => item.orderId !== orderId);
  if (!userId) {
    writeAssignments(rest);
    return;
  }
  const position = rest.filter((item) => item.userId === userId).length;
  writeAssignments([...rest, { orderId, userId, position }]);
}

export function reorderAssignments(userId: string, orderIds: string[]) {
  const current = readAssignments();
  const mine = new Map(current.filter((item) => item.userId === userId).map((item) => [item.orderId, item]));
  const next = orderIds.filter((orderId) => mine.has(orderId)).map((orderId, position) => ({ ...mine.get(orderId)!, position }));
  const others = current.filter((item) => item.userId !== userId);
  writeAssignments([...others, ...next]);
}

export function moveAssignment(userId: string, orderId: string, direction: -1 | 1) {
  const items = readAssignments().filter((item) => item.userId === userId).sort((a, b) => a.position - b.position);
  const index = items.findIndex((item) => item.orderId === orderId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return;
  const copy = [...items];
  const [row] = copy.splice(index, 1);
  copy.splice(next, 0, row);
  const others = readAssignments().filter((item) => item.userId !== userId);
  writeAssignments([...others, ...copy.map((item, position) => ({ ...item, position }))]);
}

export function openLog(userId: string) {
  return readLogs().find((item) => item.userId === userId && !item.endedAt) ?? null;
}

export function startWork(userId: string, kind: "obra" | "interno", targetId: string) {
  const carriedMs = personMs(userId, kind, targetId);
  const now = new Date().toISOString();
  const logs = readLogs().map((item) => (item.userId === userId && !item.endedAt ? { ...item, endedAt: now } : item));
  logs.push({ id: crypto.randomUUID(), userId, kind, targetId, startedAt: now, endedAt: null, carriedMs });
  writeLogs(logs);
}

export function stopWork(userId: string) {
  const now = new Date().toISOString();
  writeLogs(readLogs().map((item) => (item.userId === userId && !item.endedAt ? { ...item, endedAt: now } : item)));
}

export function workedMs(orderId: string, now = Date.now()) {
  return readLogs()
    .filter((item) => item.kind === "obra" && item.targetId === orderId)
    .reduce((sum, item) => sum + ((item.endedAt ? new Date(item.endedAt).getTime() : now) - new Date(item.startedAt).getTime()), 0);
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function personMs(userId: string, kind: "obra" | "interno", targetId: string, now = Date.now()) {
  const mine = readLogs().filter((item) => item.userId === userId && item.kind === kind && item.targetId === targetId);
  const latest = mine.reduce<WorkLog | null>((best, item) => (!best || item.startedAt > best.startedAt ? item : best), null);
  if (latest && typeof latest.carriedMs === "number") {
    const end = latest.endedAt ? new Date(latest.endedAt).getTime() : now;
    return Math.max(0, latest.carriedMs) + Math.max(0, end - new Date(latest.startedAt).getTime());
  }
  return mine.reduce((sum, item) => sum + ((item.endedAt ? new Date(item.endedAt).getTime() : now) - new Date(item.startedAt).getTime()), 0);
}

export function punch(userId: string) {
  const rows = readPunches();
  const open = rows.find((item) => item.userId === userId && !item.outAt);
  const now = new Date().toISOString();
  if (open) {
    writePunches(rows.map((item) => (item.id === open.id ? { ...item, outAt: now } : item)));
    writeLogs(readLogs().map((item) => (item.userId === userId && !item.endedAt ? { ...item, endedAt: now } : item)));
  } else writePunches([...rows, { id: crypto.randomUUID(), userId, inAt: now, outAt: null }]);
}
