import type { RawCatalog } from "../catalog";

export const sizes = [
  { id: "broto", name: "Brotinho", slices: null, maxFlavors: 1, sort: 0, active: true },
  { id: "media", name: "Média", slices: 6, maxFlavors: 2, sort: 1, active: true },
  { id: "grande", name: "Grande", slices: 8, maxFlavors: 3, sort: 2, active: true },
  { id: "familia", name: "Família", slices: 12, maxFlavors: 3, sort: 3, active: true },
];

const tp = (b: number, m: number, g: number, f: number) => [
  { sizeId: "broto", priceCents: b }, { sizeId: "media", priceCents: m }, { sizeId: "grande", priceCents: g }, { sizeId: "familia", priceCents: f },
];

export const raw: RawCatalog = {
  sizes,
  tiers: [
    { id: "trad", name: "Tradicional", sort: 0, prices: tp(2200, 4400, 5550, 6900) },
    { id: "esp", name: "Especial", sort: 1, prices: tp(2500, 5000, 6200, 7800) },
    { id: "prem", name: "Premium", sort: 2, prices: tp(2800, 5600, 6990, 8800) },
    { id: "doce", name: "Doce", sort: 3, prices: tp(2200, 4400, 5550, 6900) },
  ],
  flavors: [
    { id: "calabresa", name: "Calabresa", description: null, tierId: "trad", isSweet: false, aliases: [], ingredients: ["calabresa", "cebola"], active: true, sort: 0, sizePrices: [] },
    { id: "frango", name: "Frango com Catupiry", description: null, tierId: "trad", isSweet: false, aliases: [], ingredients: ["frango", "catupiry"], active: true, sort: 1, sizePrices: [] },
    { id: "4queijos", name: "Quatro Queijos", description: null, tierId: "esp", isSweet: false, aliases: [], ingredients: [], active: true, sort: 2, sizePrices: [] },
    { id: "camarao", name: "Camarão", description: null, tierId: "prem", isSweet: false, aliases: [], ingredients: [], active: true, sort: 3, sizePrices: [{ sizeId: "grande", priceCents: 7990 }] },
    { id: "chocolate", name: "Chocolate", description: null, tierId: "doce", isSweet: true, aliases: [], ingredients: [], active: true, sort: 4, sizePrices: [] },
  ],
  crusts: [{ id: "cheddar", name: "Cheddar", active: true, sort: 0, prices: [{ sizeId: "grande", priceCents: 1200 }, { sizeId: "familia", priceCents: 1400 }] }],
  addons: [{ id: "bacon", name: "Bacon", active: true, sort: 0, prices: [{ sizeId: "grande", priceCents: 500 }, { sizeId: "familia", priceCents: 700 }] }],
  categories: [
    { id: "cat-pizza", name: "Pizzas", kind: "PIZZA", sort: 0, active: true },
    { id: "cat-bebidas", name: "Bebidas", kind: "PRODUCT", sort: 1, active: true },
    { id: "cat-combos", name: "Combos", kind: "COMBO", sort: 2, active: true },
  ],
  products: [
    { id: "refri2l", categoryId: "cat-bebidas", name: "Refrigerante 2L", description: null, priceCents: 1700, options: ["Coca-Cola", "Guaraná"], active: true, sort: 0 },
    { id: "parm", categoryId: "cat-bebidas", name: "Parmegiana", description: null, priceCents: 3590, options: [], active: true, sort: 1 },
  ],
  combos: [
    {
      id: "combo-familia", categoryId: "cat-combos", name: "Combo Família + Refri 2L", description: null, priceCents: 7785,
      pizzaSizeId: "familia", allowedTierIds: ["trad"], extraPizzaSizeId: null, extraTierIds: [], drinkOptions: ["Guaraná"], weekdays: [], active: true, sort: 0,
    },
  ],
};
