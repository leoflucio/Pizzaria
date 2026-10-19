import { getSession, canAccessStore } from "@/server/auth";
import { sseResponse } from "@/server/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const storeId = new URL(req.url).searchParams.get("storeId");
  const s = await getSession();
  if (!s || !storeId || !canAccessStore(s, storeId)) return new Response("Sem acesso", { status: 403 });
  return sseResponse((e) => e.storeId === storeId || (e.type === "order.transferred" && e.fromStoreId === storeId), req.signal);
}
