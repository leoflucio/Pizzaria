import { Prisma, type OrderStatus, type Role } from "@prisma/client";
import { quoteCart, PricingError } from "@/domain/pricing";
import { canTransfer, canTransition, type Actor } from "@/domain/status";
import type { CheckoutInput } from "@/domain/checkout";
import { localClock } from "@/domain/hours";
import { prisma } from "./db";
import { env } from "./env";
import { publish } from "./events";
import { getNetwork, getStoreCatalog } from "./catalog";
import { listStoreStatus } from "./stores";
import { routeAddress } from "./routing";
import { randomToken } from "./crypto";
import { getProvider, toAccountConfig } from "./payments";
import { audit } from "./audit";

export class OrderError extends Error {}

async function nextOrderNumber(tx: Prisma.TransactionClient, storeId: string, code: string, day: string): Promise<string> {
  const row = await tx.orderCounter.upsert({
    where: { storeId_day: { storeId, day } },
    create: { storeId, day, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${code.slice(0, 3)}-${String(row.value).padStart(4, "0")}`;
}

export async function createOrder(input: CheckoutInput, channel: "APP" | "WHATSAPP" | "COUNTER" | "PHONE" = "APP") {
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;

  const network = await getNetwork();
  const stores = await listStoreStatus();
  const store = stores.find((s) => s.id === input.storeId);
  if (!store) throw new OrderError("Loja não encontrada.");
  if (store.isPaused) throw new OrderError(`A loja ${store.label} pausou os pedidos agora.${store.pausedReason ? " " + store.pausedReason : ""}`);
  if (!store.isOpen) throw new OrderError(`A loja ${store.label} está fechada. Abre ${store.nextOpening ?? "em breve"}.`);

  const method = input.paymentMethod;
  if ((method === "PIX" && !store.accepts.pix) || (method === "CARD_ON_DELIVERY" && !store.accepts.card) || (method === "CASH" && !store.accepts.cash))
    throw new OrderError("Forma de pagamento não aceita nesta loja.");

  // Revalidate delivery area and fee on the server; never trust the browser.
  let deliveryFeeCents = 0;
  let zoneId: string | null = null;
  let routingDecision: Prisma.InputJsonValue | undefined;
  let minOrderCents = 0;
  if (input.fulfillment === "DELIVERY") {
    const a = input.address!;
    const routing = await routeAddress({ neighborhood: a.neighborhood, street: a.street, number: a.number, point: a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null });
    const candidate = routing.candidates.find((c) => c.storeId === store.id);
    if (!candidate) throw new OrderError("Esta loja não entrega no endereço informado.");
    deliveryFeeCents = candidate.feeCents;
    zoneId = candidate.zoneId;
    minOrderCents = candidate.minOrderCents;
    routingDecision = JSON.parse(JSON.stringify({ candidates: routing.candidates, chosenByCustomer: store.id }));
  }

  const clock = localClock(new Date(), network.timezone);
  const catalog = await getStoreCatalog(store.id);
  let quote;
  try {
    quote = quoteCart(catalog, input.items, network.mixedPricingRule, deliveryFeeCents, clock.weekday);
  } catch (e) {
    if (e instanceof PricingError) throw new OrderError(e.message);
    throw e;
  }
  if (quote.subtotalCents < minOrderCents) throw new OrderError(`Pedido mínimo para este bairro: R$ ${(minOrderCents / 100).toFixed(2).replace(".", ",")}.`);
  if (method === "CASH" && input.changeForCents != null && input.changeForCents < quote.totalCents) throw new OrderError("O troco precisa ser maior que o total.");

  const storeRow = await prisma.store.findUniqueOrThrow({ where: { id: store.id }, include: { paymentAccount: true } });
  const promisedMinutes = input.fulfillment === "PICKUP" ? store.pickupMinutes : (routingDecision ? ((routingDecision as { candidates: { storeId: string; etaMinutes: number }[] }).candidates.find((c) => c.storeId === store.id)?.etaMinutes ?? 60) : 60);

  const order = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { phone: input.customer.phone },
      create: { phone: input.customer.phone, name: input.customer.name, marketingOptIn: input.customer.marketingOptIn, marketingOptInAt: input.customer.marketingOptIn ? new Date() : null },
      update: { name: input.customer.name, deletedAt: null, ...(input.customer.marketingOptIn ? { marketingOptIn: true, marketingOptInAt: new Date() } : {}) },
    });
    const number = await nextOrderNumber(tx, store.id, store.code, clock.date);
    const status: OrderStatus = method === "PIX" ? "AWAITING_PAYMENT" : "RECEIVED";
    return tx.order.create({
      data: {
        publicToken: randomToken(18), number, storeId: store.id, customerId: customer.id, customerName: input.customer.name,
        customerPhone: input.customer.phone, channel, fulfillment: input.fulfillment, status,
        address: input.fulfillment === "DELIVERY" ? (input.address as Prisma.InputJsonValue) : Prisma.JsonNull,
        zoneId, subtotalCents: quote.subtotalCents, deliveryFeeCents, totalCents: quote.totalCents, paymentMethod: method,
        changeForCents: method === "CASH" ? (input.changeForCents ?? null) : null, notes: input.notes ?? null, routingDecision,
        idempotencyKey: input.idempotencyKey, promisedAt: new Date(Date.now() + promisedMinutes * 60_000),
        items: {
          create: quote.lines.map((l) => ({ kind: l.kind, name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents, details: l.details as Prisma.InputJsonValue, notes: l.notes ?? null })),
        },
        events: { create: { type: "CREATED", toStatus: status, data: { channel } } },
        payments: { create: { method, amountCents: quote.totalCents, provider: method === "PIX" ? (storeRow.paymentAccount?.provider ?? "fake") : "offline" } },
      },
      include: { payments: true },
    });
  });

  if (method === "PIX") {
    if (!storeRow.paymentAccount) throw new OrderError("Loja sem conta de recebimento configurada.");
    const provider = getProvider(storeRow.paymentAccount.provider);
    const charge = await provider.createPixCharge({
      account: toAccountConfig(storeRow.paymentAccount), amountCents: order.totalCents, orderNumber: order.number,
      expiresInMinutes: env.PIX_EXPIRES_MINUTES, description: `${network.name} ${store.label} pedido ${order.number}`,
    });
    await prisma.payment.update({ where: { id: order.payments[0]!.id }, data: { providerTxId: charge.providerTxId, pixCopyPaste: charge.copyPaste, expiresAt: charge.expiresAt } });
  } else {
    await publish({ type: "order.created", orderId: order.id, storeId: order.storeId, number: order.number });
  }
  return order;
}

/** Called by a payment webhook (or the fake "simulate" button). Idempotent. */
export async function confirmPixPayment(providerTxId: string) {
  const payment = await prisma.payment.findUnique({ where: { providerTxId }, include: { order: true } });
  if (!payment) throw new OrderError("Pagamento não encontrado.");
  if (payment.status === "PAID") return payment.order;
  await prisma.payment.update({ where: { id: payment.id }, data: { status: "PAID", paidAt: new Date() } });
  let order = payment.order;
  if (order.status === "AWAITING_PAYMENT") {
    order = await prisma.order.update({
      where: { id: order.id },
      data: { status: "RECEIVED", events: { create: [{ type: "PAYMENT_CONFIRMED", data: { providerTxId } }, { type: "STATUS_CHANGED", fromStatus: "AWAITING_PAYMENT", toStatus: "RECEIVED" }] } },
    });
    await publish({ type: "order.created", orderId: order.id, storeId: order.storeId, number: order.number });
    await publish({ type: "order.updated", orderId: order.id, storeId: order.storeId, status: order.status, publicToken: order.publicToken });
  }
  return order;
}

/** Cancels PIX orders whose charge expired. Safe to call often (on panel load / cron). */
export async function expireStalePix() {
  const stale = await prisma.payment.findMany({ where: { method: "PIX", status: "PENDING", expiresAt: { lt: new Date() } }, include: { order: true } });
  for (const p of stale) {
    await prisma.payment.update({ where: { id: p.id }, data: { status: "EXPIRED" } });
    if (p.order.status === "AWAITING_PAYMENT") {
      const o = await prisma.order.update({ where: { id: p.orderId }, data: { status: "CANCELED", events: { create: { type: "STATUS_CHANGED", fromStatus: "AWAITING_PAYMENT", toStatus: "CANCELED", data: { reason: "PIX expirou" } } } } });
      await publish({ type: "order.updated", orderId: o.id, storeId: o.storeId, status: o.status, publicToken: o.publicToken });
    }
  }
}

export async function changeStatus(orderId: string, to: OrderStatus, actor: { userId: string; role: Role }, reason?: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!canTransition(order.status, to, actor.role as Actor, order.fulfillment)) throw new OrderError("Mudança de status não permitida.");
  const updated = await prisma.order.update({
    where: { id: orderId, status: order.status },
    data: {
      status: to,
      ...(to === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
      events: { create: { type: "STATUS_CHANGED", fromStatus: order.status, toStatus: to, actorUserId: actor.userId, data: reason ? { reason } : undefined } },
    },
  });
  if ((to === "DELIVERED") && order.paymentMethod !== "PIX") {
    await prisma.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "PAID", paidAt: new Date() } });
  }
  await publish({ type: "order.updated", orderId, storeId: updated.storeId, status: to, publicToken: updated.publicToken });
  return updated;
}

export async function transferOrder(orderId: string, toStoreId: string, actor: { userId: string }) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!canTransfer(order.status)) throw new OrderError("Só é possível transferir antes de ir para o forno.");
  if (order.storeId === toStoreId) throw new OrderError("O pedido já está nessa loja.");
  const target = await prisma.store.findUniqueOrThrow({ where: { id: toStoreId } });
  const network = await getNetwork();
  const day = localClock(new Date(), network.timezone).date;
  const updated = await prisma.$transaction(async (tx) => {
    const number = await nextOrderNumber(tx, target.id, target.code, day);
    return tx.order.update({
      where: { id: orderId },
      data: {
        storeId: target.id, number, transferredFromStoreId: order.storeId,
        events: { create: { type: "TRANSFERRED", actorUserId: actor.userId, data: { from: order.storeId, to: target.id, oldNumber: order.number } } },
      },
    });
  });
  await audit(actor.userId, "order.transfer", "Order", orderId, { from: order.storeId, to: target.id });
  await publish({ type: "order.transferred", orderId, fromStoreId: order.storeId, storeId: target.id, number: updated.number });
  await publish({ type: "order.updated", orderId, storeId: target.id, status: updated.status, publicToken: updated.publicToken });
  return updated;
}
