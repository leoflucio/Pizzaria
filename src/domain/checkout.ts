import { z } from "zod";

const part = z.object({ flavorId: z.string().min(1), fraction: z.number().positive().max(1).optional(), removed: z.array(z.string()).max(20).optional() });
const pizzaCore = z.object({ parts: z.array(part).min(1).max(4), crustId: z.string().nullish(), addonIds: z.array(z.string()).max(10).optional() });
const notes = z.string().trim().max(200).optional();

export const cartItemSchema = z.discriminatedUnion("kind", [
  pizzaCore.extend({ kind: z.literal("PIZZA"), sizeId: z.string().min(1), qty: z.number().int().min(1).max(50), notes }),
  z.object({ kind: z.literal("PRODUCT"), productId: z.string().min(1), option: z.string().nullish(), qty: z.number().int().min(1).max(50), notes }),
  z.object({ kind: z.literal("COMBO"), comboId: z.string().min(1), pizza: pizzaCore, extraPizza: pizzaCore.optional(), drink: z.string().nullish(), qty: z.number().int().min(1).max(50), notes }),
]);

export const addressSchema = z.object({
  street: z.string().trim().min(2).max(120),
  number: z.string().trim().min(1).max(10),
  neighborhood: z.string().trim().min(2).max(80),
  complement: z.string().trim().max(80).nullish(),
  reference: z.string().trim().max(120).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
});

export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .transform((d) => (d.startsWith("55") && d.length >= 12 ? d.slice(2) : d))
  .refine((d) => /^[1-9]{2}9?\d{8}$/.test(d), "Telefone inválido. Use DDD + número.");

export const checkoutSchema = z
  .object({
    storeId: z.string().min(1),
    fulfillment: z.enum(["DELIVERY", "PICKUP"]),
    address: addressSchema.nullish(),
    items: z.array(cartItemSchema).min(1).max(30),
    customer: z.object({ name: z.string().trim().min(2).max(80), phone: phoneSchema, marketingOptIn: z.boolean().default(false) }),
    paymentMethod: z.enum(["PIX", "CARD_ON_DELIVERY", "CASH"]),
    changeForCents: z.number().int().positive().nullish(),
    notes: z.string().trim().max(300).nullish(),
    idempotencyKey: z.string().min(8).max(80),
  })
  .refine((v) => v.fulfillment === "PICKUP" || !!v.address, { message: "Informe o endereço de entrega.", path: ["address"] });

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CartItemInput = z.infer<typeof cartItemSchema>;
