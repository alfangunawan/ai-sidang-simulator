import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

const KEYLEN = 64;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pw, Buffer.from(saltHex, "hex"), KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function expiresAt(fromIso: string, days = 30): string {
  return new Date(new Date(fromIso).getTime() + days * 86_400_000).toISOString();
}

const COOKIE = "sid";
const MAX_AGE = 30 * 86_400; // seconds

export function setAuthCookie(res: Response, token: string, secure: boolean): void {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`,
  );
}

export function clearAuthCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function readAuthCookie(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=") || null;
  }
  return null;
}
