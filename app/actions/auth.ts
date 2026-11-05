"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { encryptSession, SESSION_COOKIE } from "@/lib/session-crypto";

export type LoginState = { error?: string } | null;

function safeNext(value: string) {
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/entrar")) return value;
  return "/";
}

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) {
    return { error: "E-mail ou palavra-passe incorretos." };
  }

  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const token = await encryptSession({ sub: user.id, name: user.name, email: user.email }, expires);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  redirect(safeNext(String(formData.get("from") ?? "")));
}

export async function logout() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  redirect("/entrar");
}
