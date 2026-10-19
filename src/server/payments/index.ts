import { decryptJson } from "../crypto";
import { fakeProvider } from "./fake";
import type { PaymentAccountConfig, PaymentProvider } from "./types";

const providers: Record<string, PaymentProvider> = { [fakeProvider.id]: fakeProvider };

export function getProvider(id: string): PaymentProvider {
  const p = providers[id];
  if (!p) throw new Error(`Gateway de pagamento "${id}" ainda não está integrado.`);
  return p;
}

export function listProviders(): { id: string; label: string }[] {
  return Object.values(providers).map((p) => ({ id: p.id, label: p.label }));
}

export function toAccountConfig(a: { id: string; provider: string; holderName: string; pixKey: string | null; credentialsEnc: string | null }): PaymentAccountConfig {
  return { id: a.id, provider: a.provider, holderName: a.holderName, pixKey: a.pixKey, credentials: a.credentialsEnc ? decryptJson(a.credentialsEnc) : {} };
}

export type { PaymentProvider } from "./types";
