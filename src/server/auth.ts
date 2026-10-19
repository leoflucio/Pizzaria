import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { appSecret, env } from "./env";

const COOKIE = "dnp_session";
const secret = () => new TextEncoder().encode(appSecret());

export interface Assignment { role: Role; storeId: string | null }
export interface Session { userId: string; name: string; email: string; assignments: Assignment[] }

export async function login(email: string, password: string): Promise<Session | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() }, include: { assignments: true } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) return null;
  const session: Session = {
    userId: user.id, name: user.name, email: user.email,
    assignments: user.assignments.map((a) => ({ role: a.role, storeId: a.storeId })),
  };
  const token = await new SignJWT({ s: session }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env.APP_URL.startsWith("https"), path: "/", maxAge: 60 * 60 * 12 });
  return session;
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return (payload as { s: Session }).s;
  } catch {
    return null;
  }
}

export function isNetworkAdmin(s: Session): boolean {
  return s.assignments.some((a) => a.role === "NETWORK_ADMIN");
}

/** Stores this session may see, optionally limited to some roles. `"ALL"` for network admins. */
export function allowedStoreIds(s: Session, roles?: Role[]): string[] | "ALL" {
  if (isNetworkAdmin(s)) return "ALL";
  return s.assignments.filter((a) => a.storeId && (!roles || roles.includes(a.role))).map((a) => a.storeId!);
}

export function canAccessStore(s: Session, storeId: string, roles?: Role[]): boolean {
  const allowed = allowedStoreIds(s, roles);
  return allowed === "ALL" || allowed.includes(storeId);
}

/** Highest role the session holds in a store (for status rules). */
export function roleInStore(s: Session, storeId: string): Role | null {
  if (isNetworkAdmin(s)) return "NETWORK_ADMIN";
  const order: Role[] = ["STORE_MANAGER", "ATTENDANT", "KITCHEN", "COURIER"];
  const mine = s.assignments.filter((a) => a.storeId === storeId).map((a) => a.role);
  return order.find((r) => mine.includes(r)) ?? null;
}

/** Prisma `where` fragment that limits rows to the session's stores. */
export function storeScope(s: Session, roles?: Role[]): { storeId?: { in: string[] } } {
  const allowed = allowedStoreIds(s, roles);
  return allowed === "ALL" ? {} : { storeId: { in: allowed } };
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireStoreAccess(storeId: string, roles?: Role[]): Promise<Session> {
  const s = await requireSession();
  if (!canAccessStore(s, storeId, roles)) redirect("/painel?erro=acesso");
  return s;
}

export async function requireNetworkAdmin(): Promise<Session> {
  const s = await requireSession();
  if (!isNetworkAdmin(s)) redirect("/painel?erro=acesso");
  return s;
}

export class ForbiddenError extends Error {
  constructor() {
    super("Sem permissão para esta loja.");
  }
}
