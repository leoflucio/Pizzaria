import { z } from "zod";

const schema = z.object({
  // Read by Prisma directly; optional here so `next build` works without a database.
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  APP_SECRET: z.string().min(16).default("dev-secret-change-me-please"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DEMO_ALWAYS_OPEN: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  ENABLE_FAKE_PAYMENTS: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  GEOCODER: z.enum(["none", "nominatim"]).default("none"),
  NOMINATIM_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
  PIX_EXPIRES_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
});

export const env = schema.parse(process.env);

export const DEFAULT_SECRET = "dev-secret-change-me-please";

/** Refuse to sign sessions or encrypt credentials with the public default secret in production. */
export function appSecret(): string {
  if (env.APP_SECRET === DEFAULT_SECRET && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build")
    throw new Error("Defina APP_SECRET no ambiente de produção.");
  return env.APP_SECRET;
}
