import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { expireStalePix } from "./orders";

export const staffOrderInclude = { items: true, payments: true, events: { orderBy: { at: "asc" } } } satisfies Prisma.OrderInclude;
export type StaffOrder = Prisma.OrderGetPayload<{ include: typeof staffOrderInclude }>;

/** Active orders + today's finished ones for one store (caller already checked access). */
export async function listStoreOrders(storeId: string) {
  await expireStalePix();
  const since = new Date(Date.now() - 18 * 3600_000);
  return prisma.order.findMany({
    where: { storeId, OR: [{ status: { in: ["AWAITING_PAYMENT", "RECEIVED", "CONFIRMED", "IN_OVEN", "READY", "OUT_FOR_DELIVERY"] } }, { updatedAt: { gte: since } }] },
    include: staffOrderInclude,
    orderBy: { createdAt: "asc" },
  });
}
