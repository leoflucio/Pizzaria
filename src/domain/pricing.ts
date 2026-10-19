import type { ResolvedCatalog } from "./catalog";

export type MixedPricingRule = "MAX" | "AVERAGE" | "PROPORTIONAL";

export interface PizzaPart { flavorId: string; /** numerator over parts.length when omitted */ fraction?: number; removed?: string[] }

export interface PizzaSelection {
  kind: "PIZZA";
  sizeId: string;
  parts: PizzaPart[];
  crustId?: string | null;
  addonIds?: string[];
  qty: number;
  notes?: string;
}
export interface ProductSelection { kind: "PRODUCT"; productId: string; option?: string | null; qty: number; notes?: string }
export interface ComboSelection {
  kind: "COMBO";
  comboId: string;
  pizza: Omit<PizzaSelection, "kind" | "qty" | "sizeId">;
  extraPizza?: Omit<PizzaSelection, "kind" | "qty" | "sizeId">;
  drink?: string | null;
  qty: number;
  notes?: string;
}
export type CartSelection = PizzaSelection | ProductSelection | ComboSelection;

export class PricingError extends Error {}

export interface PizzaDetails {
  size: string;
  flavors: { name: string; fraction: string; removed: string[] }[];
  crust: string | null;
  addons: string[];
}

export interface PricedLine {
  kind: CartSelection["kind"];
  name: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  details: Record<string, unknown>;
  notes?: string;
  breakdown: string[];
}

function fractionLabel(f: number): string {
  if (Math.abs(f - 1) < 1e-3) return "inteira";
  for (const [n, d] of [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4]] as const) if (Math.abs(f - n / d) < 1e-3) return `${n}/${d}`;
  return `${Math.round(f * 100)}%`;
}

/** Base price of a pizza from its flavors' prices, using the network's mixed-flavor rule. Integer cents, half-up. */
export function mixedBasePrice(prices: number[], fractions: number[], rule: MixedPricingRule): number {
  if (prices.length === 0) throw new PricingError("Escolha pelo menos um sabor.");
  if (prices.length !== fractions.length) throw new PricingError("Frações inválidas.");
  switch (rule) {
    case "MAX":
      return Math.max(...prices);
    case "AVERAGE":
      return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    case "PROPORTIONAL":
      return Math.round(prices.reduce((acc, p, i) => acc + p * fractions[i]!, 0));
  }
}

function normalizeFractions(parts: PizzaPart[]): number[] {
  if (parts.every((p) => p.fraction == null)) return parts.map(() => 1 / parts.length);
  const fr = parts.map((p) => p.fraction ?? 0);
  const sum = fr.reduce((a, b) => a + b, 0);
  if (fr.some((f) => f <= 0) || Math.abs(sum - 1) > 0.001) throw new PricingError("As frações dos sabores precisam somar a pizza inteira.");
  return fr;
}

export function pricePizza(
  catalog: ResolvedCatalog,
  sel: Omit<PizzaSelection, "kind" | "qty">,
  rule: MixedPricingRule,
  opts: { allowedTierIds?: string[]; ignoreFlavorPrice?: boolean } = {},
): { unitPriceCents: number; details: PizzaDetails; breakdown: string[] } {
  const size = catalog.sizes.find((s) => s.id === sel.sizeId);
  if (!size) throw new PricingError("Tamanho indisponível.");
  if (sel.parts.length < 1) throw new PricingError("Escolha pelo menos um sabor.");
  if (sel.parts.length > size.maxFlavors)
    throw new PricingError(`A pizza ${size.name} aceita até ${size.maxFlavors} sabor${size.maxFlavors > 1 ? "es" : ""}.`);

  const fractions = normalizeFractions(sel.parts);
  const prices: number[] = [];
  const flavors: PizzaDetails["flavors"] = [];
  for (const [i, part] of sel.parts.entries()) {
    const f = catalog.flavors.find((x) => x.id === part.flavorId);
    if (!f) throw new PricingError("Sabor não encontrado.");
    if (!f.available) throw new PricingError(`O sabor ${f.name} está esgotado nesta loja.`);
    if (opts.allowedTierIds?.length && !opts.allowedTierIds.includes(f.tierId))
      throw new PricingError(`O sabor ${f.name} não faz parte desta promoção.`);
    const price = f.prices[size.id];
    if (price == null) throw new PricingError(`O sabor ${f.name} não está disponível no tamanho ${size.name}.`);
    const removed = (part.removed ?? []).filter((r) => f.ingredients.includes(r));
    prices.push(price);
    flavors.push({ name: f.name, fraction: fractionLabel(fractions[i]!), removed });
  }

  const breakdown: string[] = [];
  let unit = opts.ignoreFlavorPrice ? 0 : mixedBasePrice(prices, fractions, rule);
  if (!opts.ignoreFlavorPrice) breakdown.push(`${size.name}: ${unit}`);

  let crustName: string | null = null;
  if (sel.crustId) {
    const c = catalog.crusts.find((x) => x.id === sel.crustId);
    if (!c || !c.available) throw new PricingError("Borda indisponível.");
    const p = c.prices[size.id];
    if (p == null) throw new PricingError(`Borda ${c.name} indisponível no tamanho ${size.name}.`);
    unit += p;
    crustName = c.name;
    breakdown.push(`Borda ${c.name}: ${p}`);
  }
  const addons: string[] = [];
  for (const id of new Set(sel.addonIds ?? [])) {
    const a = catalog.addons.find((x) => x.id === id);
    if (!a || !a.available) throw new PricingError("Adicional indisponível.");
    const p = a.prices[size.id];
    if (p == null) throw new PricingError(`Adicional ${a.name} indisponível no tamanho ${size.name}.`);
    unit += p;
    addons.push(a.name);
    breakdown.push(`+ ${a.name}: ${p}`);
  }

  return { unitPriceCents: unit, details: { size: size.name, flavors, crust: crustName, addons }, breakdown };
}

export function pizzaTitle(d: PizzaDetails): string {
  if (d.flavors.length === 1) return `Pizza ${d.size} ${d.flavors[0]!.name}`;
  return `Pizza ${d.size} ` + d.flavors.map((f) => `${f.fraction} ${f.name}`).join(" + ");
}

export function priceLine(catalog: ResolvedCatalog, sel: CartSelection, rule: MixedPricingRule, weekday?: number): PricedLine {
  if (!Number.isInteger(sel.qty) || sel.qty < 1 || sel.qty > 50) throw new PricingError("Quantidade inválida.");

  if (sel.kind === "PIZZA") {
    const r = pricePizza(catalog, sel, rule);
    return {
      kind: "PIZZA", name: pizzaTitle(r.details), qty: sel.qty, unitPriceCents: r.unitPriceCents,
      totalCents: r.unitPriceCents * sel.qty, details: { ...r.details }, notes: sel.notes, breakdown: r.breakdown,
    };
  }

  if (sel.kind === "PRODUCT") {
    const p = catalog.products.find((x) => x.id === sel.productId);
    if (!p || !p.available) throw new PricingError("Produto indisponível nesta loja.");
    if (p.options.length && (!sel.option || !p.options.includes(sel.option))) throw new PricingError(`Escolha uma opção para ${p.name}.`);
    const name = sel.option ? `${p.name} (${sel.option})` : p.name;
    return {
      kind: "PRODUCT", name, qty: sel.qty, unitPriceCents: p.priceCents, totalCents: p.priceCents * sel.qty,
      details: { option: sel.option ?? null }, notes: sel.notes, breakdown: [`${p.name}: ${p.priceCents}`],
    };
  }

  const combo = catalog.combos.find((c) => c.id === sel.comboId);
  if (!combo || !combo.available) throw new PricingError("Combo indisponível nesta loja.");
  if (weekday != null && combo.weekdays.length && !combo.weekdays.includes(weekday)) throw new PricingError(`O combo ${combo.name} não vale hoje.`);
  const breakdown = [`${combo.name}: ${combo.priceCents}`];
  let unit = combo.priceCents;
  const details: Record<string, unknown> = { combo: combo.name };
  if (combo.pizzaSizeId) {
    // Flavor price is included in the combo price; only crust/addons are charged on top.
    const r = pricePizza(catalog, { ...sel.pizza, sizeId: combo.pizzaSizeId }, rule, { allowedTierIds: combo.allowedTierIds, ignoreFlavorPrice: true });
    unit += r.unitPriceCents;
    breakdown.push(...r.breakdown);
    details.pizza = r.details;
  }
  if (combo.extraPizzaSizeId) {
    if (!sel.extraPizza) throw new PricingError("Escolha o sabor da segunda pizza.");
    const r = pricePizza(catalog, { ...sel.extraPizza, sizeId: combo.extraPizzaSizeId }, rule, { allowedTierIds: combo.extraTierIds, ignoreFlavorPrice: true });
    unit += r.unitPriceCents;
    breakdown.push(...r.breakdown);
    details.extraPizza = r.details;
  }
  if (combo.drinkOptions.length) {
    if (!sel.drink || !combo.drinkOptions.includes(sel.drink)) throw new PricingError("Escolha a bebida do combo.");
    details.drink = sel.drink;
  }
  return { kind: "COMBO", name: combo.name, qty: sel.qty, unitPriceCents: unit, totalCents: unit * sel.qty, details, notes: sel.notes, breakdown };
}

export interface CartQuote {
  lines: PricedLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
}

export function quoteCart(catalog: ResolvedCatalog, items: CartSelection[], rule: MixedPricingRule, deliveryFeeCents: number, weekday?: number): CartQuote {
  if (items.length === 0) throw new PricingError("O carrinho está vazio.");
  const lines = items.map((i) => priceLine(catalog, i, rule, weekday));
  const subtotalCents = lines.reduce((a, l) => a + l.totalCents, 0);
  return { lines, subtotalCents, deliveryFeeCents, totalCents: subtotalCents + deliveryFeeCents };
}
