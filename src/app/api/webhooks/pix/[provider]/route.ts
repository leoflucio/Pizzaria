import { prisma } from "@/server/db";
import { getProvider, toAccountConfig } from "@/server/payments";
import { confirmPixPayment } from "@/server/orders";
import { env } from "@/server/env";
import { errorResponse, json } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider: id } = await params;
    if (id === "fake" && !env.ENABLE_FAKE_PAYMENTS) return json({ error: "desativado" }, { status: 404 });
    const provider = getProvider(id);
    const accounts = await prisma.paymentAccount.findMany({ where: { provider: id } });
    const result = await provider.parseWebhook({ headers: req.headers, body: await req.text(), accounts: accounts.map(toAccountConfig) });
    if (!result) return json({ ignored: true });
    if (result.status === "PAID") await confirmPixPayment(result.providerTxId);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
