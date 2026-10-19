import { listStoreStatus } from "@/server/stores";
import { getNetwork } from "@/server/catalog";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [network, stores] = await Promise.all([getNetwork(), listStoreStatus()]);
    return json({
      network: { name: network.name, tagline: network.tagline, primaryColor: network.primaryColor },
      stores: stores.map(({ queueSize: _q, kitchenCapacity: _k, prepBaseMinutes: _p, ...s }) => s),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
