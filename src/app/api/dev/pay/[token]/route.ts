import { prisma } from "@/server/db";
import { confirmPixPayment } from "@/server/orders";
import { env } from "@/server/env";
import { errorResponse, json } from "@/lib/http";

/** Simulates the PIX webhook for the fake provider (local tests and demos only). */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (!env.ENABLE_FAKE_PAYMENTS) return json({ error: "desativado" }, { status: 404 });
    const order = await prisma.order.findUnique({ where: { publicToken: (await params).token }, include: { payments: true } });
    const p = order?.payments.find((x) => x.provider === "fake" && x.providerTxId);
    if (!p?.providerTxId) return json({ error: "Pagamento não encontrado." }, { status: 404 });
    await confirmPixPayment(p.providerTxId);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
