import { z } from "zod";
import { cartItemSchema } from "@/domain/checkout";
import { quoteCart } from "@/domain/pricing";
import { getNetwork, getStoreCatalog } from "@/server/catalog";
import { localWeekday } from "@/server/stores";
import { errorResponse, json } from "@/lib/http";

const body = z.object({ storeId: z.string().min(1), items: z.array(cartItemSchema).min(1).max(30), deliveryFeeCents: z.number().int().min(0).default(0) });

/** Preview only; the final price is recalculated when the order is created. */
export async function POST(req: Request) {
  try {
    const b = body.parse(await req.json());
    const [network, catalog, clock] = await Promise.all([getNetwork(), getStoreCatalog(b.storeId), localWeekday()]);
    return json(quoteCart(catalog, b.items, network.mixedPricingRule, b.deliveryFeeCents, clock.weekday));
  } catch (e) {
    return errorResponse(e);
  }
}
