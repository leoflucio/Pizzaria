import { routeDelivery, type RoutingResult } from "@/domain/routing";
import type { LatLng } from "@/domain/geo";
import { geo } from "./geo";
import { listStoreStatus, listZones, toRoutable } from "./stores";

export async function routeAddress(input: { neighborhood: string; street?: string; number?: string; point?: LatLng | null }): Promise<RoutingResult> {
  let point = input.point ?? null;
  if (!point && input.street && input.number) {
    point = await geo.geocode({ street: input.street, number: input.number, neighborhood: input.neighborhood, city: "João Pessoa", state: "PB" });
  }
  const [stores, zones] = await Promise.all([listStoreStatus(), listZones()]);
  return routeDelivery(stores.map(toRoutable), zones, { neighborhood: input.neighborhood, point });
}
