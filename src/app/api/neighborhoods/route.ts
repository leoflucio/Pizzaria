import { servedNeighborhoods } from "@/domain/delivery";
import { listZones } from "@/server/stores";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ neighborhoods: servedNeighborhoods(await listZones()) });
  } catch (e) {
    return errorResponse(e);
  }
}
