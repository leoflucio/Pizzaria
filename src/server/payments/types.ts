export interface PixCharge {
  providerTxId: string;
  copyPaste: string;
  expiresAt: Date;
}

export interface PaymentAccountConfig {
  id: string;
  provider: string;
  holderName: string;
  pixKey: string | null;
  credentials: Record<string, string>;
}

export interface WebhookResult {
  providerTxId: string;
  status: "PAID" | "EXPIRED" | "REFUNDED";
}

/** One implementation per gateway (Mercado Pago, Asaas, Efí...). Each store has its own account. */
export interface PaymentProvider {
  readonly id: string;
  readonly label: string;
  createPixCharge(input: { account: PaymentAccountConfig; amountCents: number; orderNumber: string; expiresInMinutes: number; description: string }): Promise<PixCharge>;
  /** Validates the webhook signature and returns the normalized event, or null to ignore it. */
  parseWebhook(input: { headers: Headers; body: string; accounts: PaymentAccountConfig[] }): Promise<WebhookResult | null>;
}
