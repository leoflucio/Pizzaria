// Resolves the central menu for one store: store override > flavor price > tier price.

export type OverrideTarget = "FLAVOR" | "PRODUCT" | "CRUST" | "ADDON" | "TIER_PRICE" | "COMBO";

export interface RawOverride {
  targetType: OverrideTarget;
  targetId: string;
  sizeId: string; // "" = all sizes
  priceCents: number | null;
  available: boolean;
  exclusive: boolean;
}

export interface RawSize { id: string; name: string; slices: number | null; maxFlavors: number; sort: number; active: boolean }
export interface RawTier { id: string; name: string; sort: number; prices: { sizeId: string; priceCents: number }[] }
export interface RawFlavor {
  id: string; name: string; description: string | null; tierId: string; isSweet: boolean;
  aliases: string[]; ingredients: string[]; active: boolean; sort: number;
  sizePrices: { sizeId: string; priceCents: number }[];
}
export interface RawPricedOption { id: string; name: string; active: boolean; sort: number; prices: { sizeId: string; priceCents: number }[] }
export interface RawCategory { id: string; name: string; kind: "PIZZA" | "PRODUCT" | "COMBO"; sort: number; active: boolean }
export interface RawProduct { id: string; categoryId: string; name: string; description: string | null; priceCents: number; options: string[]; active: boolean; sort: number }
export interface RawCombo {
  id: string; categoryId: string; name: string; description: string | null; priceCents: number;
  pizzaSizeId: string | null; allowedTierIds: string[]; extraPizzaSizeId: string | null; extraTierIds: string[];
  drinkOptions: string[]; weekdays: number[]; active: boolean; sort: number;
}

export interface RawCatalog {
  sizes: RawSize[];
  tiers: RawTier[];
  flavors: RawFlavor[];
  crusts: RawPricedOption[];
  addons: RawPricedOption[];
  categories: RawCategory[];
  products: RawProduct[];
  combos: RawCombo[];
}

export interface ResolvedFlavor {
  id: string; name: string; description: string | null; tierId: string; tierName: string;
  isSweet: boolean; aliases: string[]; ingredients: string[];
  /** price per sizeId; a size missing here means the flavor is not sold in that size */
  prices: Record<string, number>;
  available: boolean;
}
export interface ResolvedOption { id: string; name: string; prices: Record<string, number>; available: boolean }
export interface ResolvedProduct { id: string; categoryId: string; name: string; description: string | null; priceCents: number; options: string[]; available: boolean }
export interface ResolvedCombo extends Omit<RawCombo, "active" | "sort"> { available: boolean }

export interface ResolvedCatalog {
  sizes: RawSize[];
  tiers: { id: string; name: string }[];
  flavors: ResolvedFlavor[];
  crusts: ResolvedOption[];
  addons: ResolvedOption[];
  categories: RawCategory[];
  products: ResolvedProduct[];
  combos: ResolvedCombo[];
}

function byTarget(overrides: RawOverride[]) {
  const map = new Map<string, RawOverride>();
  for (const o of overrides) map.set(`${o.targetType}:${o.targetId}:${o.sizeId}`, o);
  return {
    get(type: OverrideTarget, id: string, sizeId = "") {
      return map.get(`${type}:${id}:${sizeId}`);
    },
    exclusiveIds(type: OverrideTarget, all: RawOverride[]) {
      return new Set(all.filter((o) => o.targetType === type && o.exclusive).map((o) => o.targetId));
    },
  };
}

/**
 * @param exclusiveAnywhere ids (per target type) that are exclusive to *some* store.
 *        Those are hidden everywhere except in stores that have their own exclusive override.
 */
export function resolveCatalog(
  raw: RawCatalog,
  storeOverrides: RawOverride[],
  exclusiveAnywhere: Partial<Record<OverrideTarget, Set<string>>> = {},
): ResolvedCatalog {
  const ov = byTarget(storeOverrides);
  const sizes = raw.sizes.filter((s) => s.active).sort((a, b) => a.sort - b.sort);
  const tierById = new Map(raw.tiers.map((t) => [t.id, t]));

  const isOffered = (type: OverrideTarget, id: string) => {
    if (!exclusiveAnywhere[type]?.has(id)) return true;
    return ov.get(type, id)?.exclusive === true;
  };
  const isAvailable = (type: OverrideTarget, id: string) => ov.get(type, id)?.available !== false;

  const tierPrice = (tierId: string, sizeId: string): number | undefined => {
    const o = ov.get("TIER_PRICE", tierId, sizeId);
    if (o?.priceCents != null) return o.priceCents;
    return tierById.get(tierId)?.prices.find((p) => p.sizeId === sizeId)?.priceCents;
  };

  const flavors: ResolvedFlavor[] = raw.flavors
    .filter((f) => f.active && isOffered("FLAVOR", f.id))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "pt-BR"))
    .map((f) => {
      const prices: Record<string, number> = {};
      for (const s of sizes) {
        const store = ov.get("FLAVOR", f.id, s.id)?.priceCents;
        const own = f.sizePrices.find((p) => p.sizeId === s.id)?.priceCents;
        const price = store ?? own ?? tierPrice(f.tierId, s.id);
        if (price != null) prices[s.id] = price;
      }
      return {
        id: f.id, name: f.name, description: f.description, tierId: f.tierId,
        tierName: tierById.get(f.tierId)?.name ?? "", isSweet: f.isSweet, aliases: f.aliases,
        ingredients: f.ingredients, prices, available: isAvailable("FLAVOR", f.id),
      };
    });

  const resolveOptions = (type: "CRUST" | "ADDON", list: RawPricedOption[]): ResolvedOption[] =>
    list
      .filter((c) => c.active && isOffered(type, c.id))
      .sort((a, b) => a.sort - b.sort)
      .map((c) => {
        const prices: Record<string, number> = {};
        for (const s of sizes) {
          const store = ov.get(type, c.id, s.id)?.priceCents;
          const own = c.prices.find((p) => p.sizeId === s.id)?.priceCents;
          const price = store ?? own;
          if (price != null) prices[s.id] = price;
        }
        return { id: c.id, name: c.name, prices, available: isAvailable(type, c.id) };
      });

  const products: ResolvedProduct[] = raw.products
    .filter((p) => p.active && isOffered("PRODUCT", p.id))
    .sort((a, b) => a.sort - b.sort)
    .map((p) => ({
      id: p.id, categoryId: p.categoryId, name: p.name, description: p.description,
      priceCents: ov.get("PRODUCT", p.id)?.priceCents ?? p.priceCents,
      options: p.options, available: isAvailable("PRODUCT", p.id),
    }));

  const combos: ResolvedCombo[] = raw.combos
    .filter((c) => c.active && isOffered("COMBO", c.id))
    .sort((a, b) => a.sort - b.sort)
    .map(({ active: _a, sort: _s, ...c }) => ({
      ...c,
      priceCents: ov.get("COMBO", c.id)?.priceCents ?? c.priceCents,
      available: isAvailable("COMBO", c.id),
    }));

  const usedCategories = new Set([...products.map((p) => p.categoryId), ...combos.map((c) => c.categoryId)]);
  const categories = raw.categories
    .filter((c) => c.active && (c.kind === "PIZZA" || usedCategories.has(c.id)))
    .sort((a, b) => a.sort - b.sort);

  return {
    sizes,
    tiers: raw.tiers.sort((a, b) => a.sort - b.sort).map((t) => ({ id: t.id, name: t.name })),
    flavors,
    crusts: resolveOptions("CRUST", raw.crusts),
    addons: resolveOptions("ADDON", raw.addons),
    categories,
    products,
    combos,
  };
}

export function exclusiveSets(allOverrides: RawOverride[]): Partial<Record<OverrideTarget, Set<string>>> {
  const out: Partial<Record<OverrideTarget, Set<string>>> = {};
  for (const o of allOverrides) {
    if (!o.exclusive) continue;
    (out[o.targetType] ??= new Set()).add(o.targetId);
  }
  return out;
}
