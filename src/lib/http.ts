import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(e: unknown) {
  if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Dados inválidos.", issues: e.issues }, { status: 400 });
  if (e instanceof Error && ["OrderError", "PricingError"].includes(e.constructor.name)) return NextResponse.json({ error: e.message }, { status: 422 });
  console.error(e);
  return NextResponse.json({ error: "Erro inesperado. Tente de novo." }, { status: 500 });
}
