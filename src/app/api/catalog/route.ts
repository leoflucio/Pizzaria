import { getNetwork, getStoreCatalog } from "@/server/catalog";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const storeId = new URL(req.url).searchParams.get("storeId");
    if (!storeId) return json({ error: "storeId obrigatório" }, { status: 400 });
    const [network, catalog] = await Promise.all([getNetwork(), getStoreCatalog(storeId)]);
    return json({ mixedPricingRule: network.mixedPricingRule, catalog });
  } catch (e) {
    return errorResponse(e);
  }
}
