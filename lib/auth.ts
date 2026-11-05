import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { decryptSession, SESSION_COOKIE } from "@/lib/session-crypto";

export async function getSession() {
  const jar = await cookies();
  return decryptSession(jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/entrar");
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) redirect("/entrar");
  return user;
}
