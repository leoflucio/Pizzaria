import { z } from "zod";
import { routeAddress } from "@/server/routing";
import { errorResponse, json } from "@/lib/http";

const body = z.object({
  neighborhood: z.string().trim().min(2).max(80),
  street: z.string().trim().max(120).optional(),
  number: z.string().trim().max(10).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export async function POST(req: Request) {
  try {
    const b = body.parse(await req.json());
    const r = await routeAddress({ neighborhood: b.neighborhood, street: b.street, number: b.number, point: b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : null });
    return json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
