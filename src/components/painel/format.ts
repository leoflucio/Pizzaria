import { formatBRL } from "@/domain/money";

export const PAYMENT_LABEL: Record<string, string> = { PIX: "PIX", CARD_ON_DELIVERY: "Cartão", CASH: "Dinheiro" };

export function time(d: string | Date) {
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" });
}

export function minutesSince(d: string | Date) {
  return Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
}

interface P { size?: string; flavors?: { name: string; fraction: string; removed?: string[] }[]; crust?: string | null; addons?: string[] }

/** Lines the kitchen needs for one item. */
export function itemLines(details: unknown): { text: string; alert?: boolean }[] {
  const d = (details ?? {}) as Record<string, unknown>;
  const pizza = (p: P, prefix = "") => [
    ...(p.flavors ?? []).flatMap((f) => [
      { text: `${prefix}${f.fraction === "inteira" ? "" : f.fraction + " "}${f.name}` },
      ...(f.removed ?? []).map((r) => ({ text: `${prefix}  SEM ${r.toUpperCase()}`, alert: true })),
    ]),
    ...(p.crust ? [{ text: `${prefix}Borda ${p.crust}` }] : []),
    ...(p.addons ?? []).map((a) => ({ text: `${prefix}+ ${a}` })),
  ];
  if (d.flavors) return pizza(d as P);
  const out: { text: string; alert?: boolean }[] = [];
  if (d.pizza) out.push(...pizza(d.pizza as P));
  if (d.extraPizza) out.push({ text: `${(d.extraPizza as P).size}:` }, ...pizza(d.extraPizza as P, "  "));
  if (typeof d.drink === "string") out.push({ text: `Bebida: ${d.drink}` });
  return out;
}

export { formatBRL };
