import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/db";
import { encryptSession, SESSION_COOKIE } from "@/lib/session-crypto";

async function main() {
const user = await prisma.user.findFirstOrThrow();
const order = await prisma.repairOrder.findFirstOrThrow({ where: { status: "concluida" } });
const quote = await prisma.quote.findFirstOrThrow({ where: { status: "aberto" } });
const token = await encryptSession(
  { sub: user.id, name: user.name, email: user.email },
  new Date(Date.now() + 86_400_000),
);
const cookie = `${SESSION_COOKIE}=${token}`;
const base = "http://127.0.0.1:43123";

const checks: Array<[string, string | null, string]> = [
  ["/entrar", null, "Iniciar sessão"],
  ["/", cookie, "Ordens por fechar"],
  ["/clientes", cookie, "Ana Martins"],
  ["/viaturas", cookie, "AB-19-CK"],
  ["/ordens", cookie, "OR-2026"],
  [`/ordens/${order.id}`, cookie, "Faturar"],
  ["/orcamentos", cookie, "ORC-2026"],
  [`/orcamentos/${quote.id}`, cookie, "Converter em OR"],
  ["/artigos", cookie, "OLEO-5W30"],
  ["/fornecedores", cookie, "LubriNorte"],
  ["/compras", cookie, "ECOLUB"],
  ["/agenda", cookie, "Agenda"],
  ["/faturacao", cookie, "Moloni (simulação)"],
  [`/ordens/${order.id}/imprimir`, cookie, "Ordem de reparação"],
  [`/orcamentos/${quote.id}/imprimir`, cookie, "Orçamento"],
];

let failed = 0;
for (const [path, auth, needle] of checks) {
  const response = await fetch(base + path, {
    headers: auth ? { cookie: auth } : {},
    redirect: "manual",
  });
  const body = await response.text();
  const ok = response.status === 200 && body.includes(needle);
  if (!ok) failed += 1;
  console.log(ok ? "OK" : "FAIL", response.status, path, ok ? "" : body.slice(0, 180).replaceAll("\n", " "));
}

const anon = await fetch(base + "/", { redirect: "manual" });
const loginRedirect = anon.status >= 300 && anon.status < 400 && (anon.headers.get("location") ?? "").includes("/entrar");
console.log(loginRedirect ? "OK" : "FAIL", "redirect", anon.status, anon.headers.get("location"));
if (!loginRedirect) failed += 1;

const pdf = await fetch(`${base}/api/ordens/${order.id}/pdf`, { headers: { cookie } });
const bytes = Buffer.from(await pdf.arrayBuffer());
writeFileSync("/tmp/ordem.pdf", bytes);
const pdfOk = pdf.status === 200 && bytes.subarray(0, 4).toString() === "%PDF" && bytes.length > 2000;
console.log(pdfOk ? "OK" : "FAIL", "pdf", pdf.status, bytes.length);
if (!pdfOk) failed += 1;

await prisma.$disconnect();
if (failed) process.exit(1);
}

main();
