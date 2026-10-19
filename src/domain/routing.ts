import { bestZoneForStore, type CustomerLocation, type Zone } from "./delivery";
import { haversineMeters } from "./geo";

export interface RoutableStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isOpen: boolean;
  isPaused: boolean;
  prepBaseMinutes: number;
  kitchenCapacity: number;
  /** pizzas waiting or in the oven right now */
  queueSize: number;
}

export interface Candidate {
  storeId: string;
  storeName: string;
  zoneId: string;
  zoneName: string;
  feeCents: number;
  minOrderCents: number;
  etaMinutes: number;
  available: boolean;
  reason?: "PAUSED" | "CLOSED";
}

export type RoutingResult =
  | { ok: true; chosen: Candidate; alternatives: Candidate[]; candidates: Candidate[] }
  | { ok: false; reason: "OUT_OF_AREA"; candidates: [] }
  | { ok: false; reason: "ALL_UNAVAILABLE"; candidates: Candidate[] };

/** Minutes per pizza in the queue, scaled by how many pizzas the kitchen bakes at once. */
const MINUTES_PER_QUEUE_SLOT = 12;
/** Urban road speed in m/min (~20 km/h) and road-vs-straight-line factor. */
const SPEED_M_PER_MIN = 333;
const ROAD_FACTOR = 1.4;
const TIE_MINUTES = 3;

export function estimateMinutes(store: RoutableStore, zone: Zone, loc: CustomerLocation): number {
  const queue = Math.ceil(store.queueSize / Math.max(1, store.kitchenCapacity)) * MINUTES_PER_QUEUE_SLOT;
  const travel = loc.point ? Math.round((haversineMeters(store, loc.point) * ROAD_FACTOR) / SPEED_M_PER_MIN) : 15;
  return store.prepBaseMinutes + queue + travel + zone.extraMinutes;
}

/**
 * Picks the store for a delivery address:
 * 1. stores with a zone covering the address;
 * 2. only open and not paused;
 * 3. lowest ETA (queue + prep + travel + zone extra); within TIE_MINUTES, lower fee, then zone priority.
 */
export function routeDelivery(stores: RoutableStore[], zones: Zone[], loc: CustomerLocation): RoutingResult {
  const candidates: (Candidate & { priority: number })[] = [];
  for (const s of stores) {
    const zone = bestZoneForStore(zones, s, loc);
    if (!zone) continue;
    const available = s.isOpen && !s.isPaused;
    candidates.push({
      storeId: s.id, storeName: s.name, zoneId: zone.id, zoneName: zone.name, feeCents: zone.feeCents,
      minOrderCents: zone.minOrderCents, etaMinutes: estimateMinutes(s, zone, loc), available,
      reason: available ? undefined : s.isPaused ? "PAUSED" : "CLOSED", priority: zone.priority,
    });
  }
  if (candidates.length === 0) return { ok: false, reason: "OUT_OF_AREA", candidates: [] };

  const strip = ({ priority: _p, ...c }: Candidate & { priority: number }): Candidate => c;
  const open = candidates.filter((c) => c.available);
  if (open.length === 0) return { ok: false, reason: "ALL_UNAVAILABLE", candidates: candidates.map(strip) };

  open.sort((a, b) => {
    if (Math.abs(a.etaMinutes - b.etaMinutes) > TIE_MINUTES) return a.etaMinutes - b.etaMinutes;
    return a.feeCents - b.feeCents || b.priority - a.priority || a.etaMinutes - b.etaMinutes;
  });
  const [chosen, ...alternatives] = open.map(strip);
  return { ok: true, chosen: chosen!, alternatives, candidates: candidates.map(strip) };
}
