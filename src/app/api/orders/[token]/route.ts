import { getPublicOrder } from "@/server/publicOrder";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const o = await getPublicOrder((await params).token);
    return o ? json(o) : json({ error: "Pedido não encontrado." }, { status: 404 });
  } catch (e) {
    return errorResponse(e);
  }
}
