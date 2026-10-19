import { z } from "zod";
import { canAccessStore, getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { publish } from "@/server/events";

const body = z.object({ orderId: z.string(), to: z.enum(["CONFIRMED", "IN_OVEN"]) });
const PREV: Record<string, string> = { IN_OVEN: "CONFIRMED", READY: "IN_OVEN" };

/** KDS "desfazer": steps an order back one kitchen status within 15 s of the change. */
export async function POST(req: Request) {
  const s = await getSession();
  const { orderId, to } = body.parse(await req.json());
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { events: { orderBy: { at: "desc" }, take: 1 } } });
  if (!s || !order || !canAccessStore(s, order.storeId)) return new Response("Sem acesso", { status: 403 });
  const last = order.events[0];
  if (PREV[order.status] !== to || !last || Date.now() - last.at.getTime() > 15_000) return Response.json({ error: "Não dá mais para desfazer." }, { status: 409 });
  const updated = await prisma.order.update({
    where: { id: orderId, status: order.status },
    data: { status: to, events: { create: { type: "STATUS_CHANGED", fromStatus: order.status, toStatus: to, actorUserId: s.userId, data: { undo: true } } } },
  });
  await publish({ type: "order.updated", orderId, storeId: updated.storeId, status: to, publicToken: updated.publicToken });
  return Response.json({ ok: true });
}
