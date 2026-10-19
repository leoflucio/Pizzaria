import { customerStatusLabel } from "@/domain/status";
import { prisma } from "./db";
import { expireStalePix } from "./orders";
import { env } from "./env";

/** Order as the customer sees it (no internal routing data). */
export async function getPublicOrder(token: string) {
  await expireStalePix();
  const o = await prisma.order.findUnique({
    where: { publicToken: token },
    include: { items: true, payments: { orderBy: { createdAt: "desc" }, take: 1 }, store: true, events: { orderBy: { at: "asc" } } },
  });
  if (!o) return null;
  const p = o.payments[0];
  return {
    token: o.publicToken, number: o.number, status: o.status, statusLabel: customerStatusLabel(o.status, o.fulfillment),
    fulfillment: o.fulfillment, createdAt: o.createdAt, promisedAt: o.promisedAt,
    store: { name: o.store.name, label: o.store.label, address: `${o.store.street}, ${o.store.number} - ${o.store.neighborhood}`, phone: o.store.phone },
    items: o.items.map((i) => ({ name: i.name, qty: i.qty, unitPriceCents: i.unitPriceCents, details: i.details, notes: i.notes })),
    subtotalCents: o.subtotalCents, deliveryFeeCents: o.deliveryFeeCents, totalCents: o.totalCents,
    paymentMethod: o.paymentMethod, changeForCents: o.changeForCents,
    payment: p ? { status: p.status, pixCopyPaste: p.pixCopyPaste, expiresAt: p.expiresAt, provider: p.provider } : null,
    canSimulatePayment: env.ENABLE_FAKE_PAYMENTS && p?.provider === "fake" && p.status === "PENDING" && o.paymentMethod === "PIX",
    timeline: o.events.filter((e) => e.toStatus).map((e) => ({ status: e.toStatus!, label: customerStatusLabel(e.toStatus as never, o.fulfillment), at: e.at })),
  };
}
export type PublicOrder = NonNullable<Awaited<ReturnType<typeof getPublicOrder>>>;
