import { sseResponse } from "@/server/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return sseResponse((e) => e.type === "order.updated" && e.publicToken === token, req.signal);
}
