import { canAccessStore, getSession } from "@/server/auth";
import { listStoreOrders } from "@/server/staffOrders";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const storeId = new URL(req.url).searchParams.get("storeId");
  const s = await getSession();
  if (!s || !storeId || !canAccessStore(s, storeId)) return new Response("Sem acesso", { status: 403 });
  const [orders, store] = await Promise.all([listStoreOrders(storeId), prisma.store.findUnique({ where: { id: storeId }, select: { isPaused: true, pausedReason: true } })]);
  return Response.json({ orders, store });
}
