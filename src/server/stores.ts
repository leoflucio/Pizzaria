import { isOpenAt, localClock, nextOpening } from "@/domain/hours";
import type { Zone } from "@/domain/delivery";
import type { RoutableStore } from "@/domain/routing";
import { prisma } from "./db";
import { env } from "./env";
import { getNetwork } from "./catalog";

export interface StoreStatus {
  id: string; code: string; name: string; label: string; slug: string;
  address: string; neighborhood: string; phone: string | null; lat: number; lng: number;
  isOpen: boolean; isPaused: boolean; pausedReason: string | null; nextOpening: string | null;
  pickupMinutes: number; prepBaseMinutes: number; kitchenCapacity: number; queueSize: number;
  accepts: { pix: boolean; card: boolean; cash: boolean };
}

export async function listStoreStatus(now = new Date()): Promise<StoreStatus[]> {
  const network = await getNetwork();
  const stores = await prisma.store.findMany({ where: { active: true }, include: { hours: true, paymentAccount: true }, orderBy: { sort: "asc" } });
  const queue = await prisma.order.groupBy({ by: ["storeId"], where: { status: { in: ["RECEIVED", "CONFIRMED", "IN_OVEN"] } }, _count: true });
  const q = new Map(queue.map((r) => [r.storeId, r._count]));
  return stores.map((s) => {
    const open = env.DEMO_ALWAYS_OPEN || isOpenAt(s.hours, now, network.timezone);
    return {
      id: s.id, code: s.code, name: s.name, label: s.label, slug: s.slug,
      address: `${s.street}, ${s.number} - ${s.neighborhood}`, neighborhood: s.neighborhood, phone: s.phone, lat: s.lat, lng: s.lng,
      isOpen: open, isPaused: s.isPaused, pausedReason: s.pausedReason, nextOpening: open ? null : nextOpening(s.hours, now, network.timezone),
      pickupMinutes: s.pickupMinutes, prepBaseMinutes: s.prepBaseMinutes, kitchenCapacity: s.kitchenCapacity, queueSize: q.get(s.id) ?? 0,
      accepts: { pix: s.paymentAccount?.acceptsPix ?? false, card: s.paymentAccount?.acceptsCard ?? true, cash: s.paymentAccount?.acceptsCash ?? true },
    };
  });
}

export function toRoutable(s: StoreStatus): RoutableStore {
  return { id: s.id, name: s.name, lat: s.lat, lng: s.lng, isOpen: s.isOpen, isPaused: s.isPaused, prepBaseMinutes: s.prepBaseMinutes, kitchenCapacity: s.kitchenCapacity, queueSize: s.queueSize };
}

export async function listZones(): Promise<Zone[]> {
  const zones = await prisma.deliveryZone.findMany({ where: { active: true, store: { active: true } } });
  return zones.map((z) => ({ ...z, polygon: (z.polygon as [number, number][] | null) ?? null }));
}

export async function localWeekday(now = new Date()) {
  const n = await getNetwork();
  return localClock(now, n.timezone);
}
