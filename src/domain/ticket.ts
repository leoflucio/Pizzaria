// Plain-text ticket for 80 mm thermal printers (48 columns, Font A).
import { formatBRL } from "./money";

export const COLS = 48;

export interface TicketOrder {
  brand: string;
  storeLabel: string;
  number: string;
  createdAt: Date;
  timeZone: string;
  fulfillment: "DELIVERY" | "PICKUP";
  customerName: string;
  customerPhone: string;
  address?: { street: string; number: string; neighborhood: string; complement?: string | null; reference?: string | null } | null;
  items: { qty: number; name: string; totalCents: number; details: Record<string, unknown>; notes?: string | null }[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  paymentLabel: string;
  paid: boolean;
  changeForCents?: number | null;
  notes?: string | null;
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

function wrap(text: string, width = COLS, indent = ""): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length > width - (lines.length ? indent.length : 0)) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = candidate;
  }
  if (cur) lines.push(cur);
  return lines.map((l, i) => (i === 0 ? l : indent + l));
}

function lr(left: string, right: string): string {
  const space = COLS - left.length - right.length;
  if (space >= 1) return left + " ".repeat(space) + right;
  return `${left}\n${" ".repeat(Math.max(0, COLS - right.length))}${right}`;
}

const center = (s: string) => " ".repeat(Math.max(0, Math.floor((COLS - s.length) / 2))) + s;
const rule = (c = "-") => c.repeat(COLS);

interface PizzaDetailsLike { size?: string; flavors?: { name: string; fraction: string; removed?: string[] }[]; crust?: string | null; addons?: string[] }

function pizzaLines(d: PizzaDetailsLike, indent: string): string[] {
  const out: string[] = [];
  for (const f of d.flavors ?? []) {
    out.push(...wrap(`${indent}${f.fraction === "inteira" ? "" : f.fraction + " "}${f.name}`, COLS, indent + "  "));
    for (const r of f.removed ?? []) out.push(`${indent}  ** SEM ${r.toUpperCase()} **`);
  }
  if (d.crust) out.push(`${indent}Borda: ${d.crust}`);
  for (const a of d.addons ?? []) out.push(`${indent}+ ${a}`);
  return out;
}

/** Ticket text with accents removed (most ESC/POS code pages print them wrong). */
export function renderTicket(o: TicketOrder): string {
  const when = new Intl.DateTimeFormat("pt-BR", { timeZone: o.timeZone, dateStyle: "short", timeStyle: "short" }).format(o.createdAt);
  const lines: string[] = [
    center(o.brand.toUpperCase()),
    center(o.storeLabel),
    rule("="),
    lr(`PEDIDO ${o.number}`, when),
    center(o.fulfillment === "DELIVERY" ? "*** ENTREGA ***" : "*** RETIRADA NO BALCAO ***"),
    rule(),
    `Cliente: ${o.customerName}`,
    `Fone: ${o.customerPhone}`,
  ];
  if (o.fulfillment === "DELIVERY" && o.address) {
    lines.push(...wrap(`End.: ${o.address.street}, ${o.address.number}${o.address.complement ? " - " + o.address.complement : ""}`, COLS, "      "));
    lines.push(`Bairro: ${o.address.neighborhood}`);
    if (o.address.reference) lines.push(...wrap(`Ref.: ${o.address.reference}`, COLS, "      "));
  }
  lines.push(rule());
  for (const it of o.items) {
    lines.push(...lr(`${it.qty}x ${it.name}`.slice(0, COLS - 12), formatBRL(it.totalCents)).split("\n"));
    const d = it.details as Record<string, unknown>;
    if (d.flavors) lines.push(...pizzaLines(d as PizzaDetailsLike, "   "));
    if (d.pizza) lines.push(...pizzaLines(d.pizza as PizzaDetailsLike, "   "));
    if (d.extraPizza) {
      lines.push(`   + ${(d.extraPizza as PizzaDetailsLike).size ?? "Pizza"}:`);
      lines.push(...pizzaLines(d.extraPizza as PizzaDetailsLike, "     "));
    }
    if (typeof d.drink === "string") lines.push(`   Bebida: ${d.drink}`);
    if (it.notes) lines.push(...wrap(`   Obs: ${it.notes}`, COLS, "        "));
  }
  lines.push(rule());
  lines.push(lr("Subtotal", formatBRL(o.subtotalCents)));
  if (o.deliveryFeeCents) lines.push(lr("Entrega", formatBRL(o.deliveryFeeCents)));
  if (o.discountCents) lines.push(lr("Desconto", "-" + formatBRL(o.discountCents)));
  lines.push(lr("TOTAL", formatBRL(o.totalCents)));
  lines.push(lr("Pagamento", `${o.paymentLabel}${o.paid ? " (PAGO)" : ""}`));
  if (o.changeForCents) lines.push(lr("Troco para", `${formatBRL(o.changeForCents)} (levar ${formatBRL(o.changeForCents - o.totalCents)})`));
  if (o.notes) {
    lines.push(rule());
    lines.push(...wrap(`OBS: ${o.notes}`, COLS, "     "));
  }
  lines.push(rule("="), "", "");
  return strip(lines.join("\n"));
}
