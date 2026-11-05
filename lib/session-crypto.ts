import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "hcl_session";

export type SessionPayload = {
  sub: string;
  name: string;
  email: string;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET ?? "hyperion-car-lab-demo-secret-key-32b";
  return new TextEncoder().encode(secret);
}

export async function encryptSession(payload: SessionPayload, expiresAt: Date) {
  return new SignJWT({ name: payload.name, email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());
}

export async function decryptSession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.name !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { sub: payload.sub, name: payload.name, email: payload.email };
  } catch {
    return null;
  }
}
