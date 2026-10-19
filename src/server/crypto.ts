import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { appSecret } from "./env";

const key = () => createHash("sha256").update(appSecret()).digest();

/** AES-256-GCM; output is base64(iv | tag | ciphertext). */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}

export function decryptJson<T = unknown>(payload: string): T {
  const buf = Buffer.from(payload, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8")) as T;
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}
