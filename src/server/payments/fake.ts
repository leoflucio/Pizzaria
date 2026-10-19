import { randomToken } from "../crypto";
import type { PaymentProvider } from "./types";

/** Local/dev provider: generates a fake PIX code; payment is confirmed by the "simular pagamento" button. */
export const fakeProvider: PaymentProvider = {
  id: "fake",
  label: "Simulado (testes)",
  async createPixCharge({ account, amountCents, orderNumber, expiresInMinutes }) {
    const tx = `fake_${randomToken(10)}`;
    const amount = (amountCents / 100).toFixed(2);
    return {
      providerTxId: tx,
      copyPaste: `00020126PIXSIMULADO|${account.holderName}|${orderNumber}|R$${amount}|${tx}`,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60_000),
    };
  },
  async parseWebhook({ body }) {
    const data = JSON.parse(body) as { providerTxId?: string; status?: string };
    if (!data.providerTxId) return null;
    return { providerTxId: data.providerTxId, status: data.status === "EXPIRED" ? "EXPIRED" : "PAID" };
  },
};
