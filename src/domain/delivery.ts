import { haversineMeters, normalizeName, pointInPolygon, type LatLng } from "./geo";

export type ZoneKind = "NEIGHBORHOOD" | "RADIUS" | "POLYGON";

export interface Zone {
  id: string;
  storeId: string;
  name: string;
  kind: ZoneKind;
  neighborhoods: string[];
  radiusMeters: number | null;
  polygon: [number, number][] | null;
  feeCents: number;
  minOrderCents: number;
  extraMinutes: number;
  priority: number;
  active: boolean;
}

export interface CustomerLocation {
  neighborhood?: string | null;
  point?: LatLng | null;
}

export interface ZoneStoreRef { id: string; lat: number; lng: number }

/** True when the zone covers the location. Neighborhood match is accent/case-insensitive. */
export function zoneCovers(zone: Zone, store: ZoneStoreRef, loc: CustomerLocation): boolean {
  if (!zone.active) return false;
  switch (zone.kind) {
    case "NEIGHBORHOOD": {
      if (!loc.neighborhood) return false;
      const n = normalizeName(loc.neighborhood);
      return zone.neighborhoods.some((z) => normalizeName(z) === n);
    }
    case "RADIUS":
      return !!loc.point && zone.radiusMeters != null && haversineMeters(store, loc.point) <= zone.radiusMeters;
    case "POLYGON":
      return !!loc.point && !!zone.polygon && zone.polygon.length >= 3 && pointInPolygon(loc.point, zone.polygon);
  }
}

/**
 * Best zone of one store for the location: the store's most specific match wins
 * (higher priority first, then the cheaper fee).
 */
export function bestZoneForStore(zones: Zone[], store: ZoneStoreRef, loc: CustomerLocation): Zone | null {
  const matches = zones.filter((z) => z.storeId === store.id && zoneCovers(z, store, loc));
  matches.sort((a, b) => b.priority - a.priority || a.feeCents - b.feeCents);
  return matches[0] ?? null;
}

/** Every served neighborhood across stores, for the address picker. */
export function servedNeighborhoods(zones: Zone[]): string[] {
  const seen = new Map<string, string>();
  for (const z of zones) if (z.active && z.kind === "NEIGHBORHOOD") for (const n of z.neighborhoods) seen.set(normalizeName(n), n);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
