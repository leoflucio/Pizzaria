import { exclusiveSets, resolveCatalog, type RawCatalog, type RawOverride, type ResolvedCatalog } from "@/domain/catalog";
import type { MixedPricingRule } from "@/domain/pricing";
import { prisma } from "./db";

// Small in-process cache; every admin edit calls invalidateCatalog().
const g = globalThis as unknown as { __dnpCatalog?: Map<string, { at: number; value: ResolvedCatalog }> };
const cache = (g.__dnpCatalog ??= new Map());
const TTL_MS = 60_000;

export function invalidateCatalog() {
  cache.clear();
}

async function loadRaw(): Promise<RawCatalog> {
  const [sizes, tiers, flavors, crusts, addons, categories, products, combos] = await Promise.all([
    prisma.pizzaSize.findMany(),
    prisma.flavorTier.findMany({ include: { prices: true } }),
    prisma.flavor.findMany({ include: { sizePrices: true } }),
    prisma.crust.findMany({ include: { prices: true } }),
    prisma.addon.findMany({ include: { prices: true } }),
    prisma.category.findMany(),
    prisma.product.findMany(),
    prisma.combo.findMany(),
  ]);
  return { sizes, tiers, flavors, crusts, addons, categories, products, combos };
}

export async function getStoreCatalog(storeId: string): Promise<ResolvedCatalog> {
  const hit = cache.get(storeId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const [raw, all] = await Promise.all([loadRaw(), prisma.storeCatalogOverride.findMany()]);
  const asRaw = (o: (typeof all)[number]): RawOverride => ({ targetType: o.targetType, targetId: o.targetId, sizeId: o.sizeId, priceCents: o.priceCents, available: o.available, exclusive: o.exclusive });
  const value = resolveCatalog(raw, all.filter((o) => o.storeId === storeId).map(asRaw), exclusiveSets(all.map(asRaw)));
  cache.set(storeId, { at: Date.now(), value });
  return value;
}

export async function getNetwork() {
  const n = await prisma.network.findFirst();
  if (!n) throw new Error("Rede não cadastrada. Rode o seed (npm run db:seed).");
  return n as typeof n & { mixedPricingRule: MixedPricingRule };
}
