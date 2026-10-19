"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { canAccessStore, isNetworkAdmin, logout, requireSession, roleInStore } from "@/server/auth";
import { changeStatus, transferOrder, OrderError } from "@/server/orders";
import { prisma } from "@/server/db";
import { publish } from "@/server/events";
import { audit } from "@/server/audit";

type Result = { ok: true } | { ok: false; error: string };

async function guardOrder(orderId: string) {
  const s = await requireSession();
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { storeId: true } });
  if (!order || !canAccessStore(s, order.storeId)) throw new OrderError("Pedido não encontrado.");
  const role = roleInStore(s, order.storeId);
  if (!role) throw new OrderError("Sem permissão.");
  return { s, role, storeId: order.storeId };
}

export async function setOrderStatus(orderId: string, to: OrderStatus, reason?: string): Promise<Result> {
  try {
    const { s, role } = await guardOrder(orderId);
    await changeStatus(orderId, to, { userId: s.userId, role }, reason);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function transfer(orderId: string, toStoreId: string): Promise<Result> {
  try {
    const { s, role } = await guardOrder(orderId);
    if (!(isNetworkAdmin(s) || (role === "STORE_MANAGER" && canAccessStore(s, toStoreId)))) throw new OrderError("Só o gestor da rede transfere pedidos entre lojas.");
    await transferOrder(orderId, toStoreId, { userId: s.userId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function togglePause(storeId: string, paused: boolean, reason?: string): Promise<Result> {
  const s = await requireSession();
  if (!canAccessStore(s, storeId, ["STORE_MANAGER", "ATTENDANT"])) return { ok: false, error: "Sem permissão." };
  await prisma.store.update({ where: { id: storeId }, data: { isPaused: paused, pausedReason: paused ? reason || null : null } });
  await audit(s.userId, paused ? "store.pause" : "store.resume", "Store", storeId, { reason: reason ?? null });
  await publish({ type: "store.updated", storeId });
  revalidatePath("/painel", "layout");
  return { ok: true };
}

export async function signOut() {
  await logout();
  redirect("/login");
}
