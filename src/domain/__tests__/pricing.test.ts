import { describe, expect, it } from "vitest";
import { exclusiveSets, resolveCatalog, type RawOverride } from "../catalog";
import { mixedBasePrice, pricePizza, priceLine, quoteCart, PricingError } from "../pricing";
import { raw } from "./fixtures";

const catalog = resolveCatalog(structuredClone(raw), []);

describe("mixedBasePrice", () => {
  it("MAX cobra o sabor mais caro", () => {
    expect(mixedBasePrice([5550, 6200], [0.5, 0.5], "MAX")).toBe(6200);
  });
  it("AVERAGE arredonda meio centavo para cima", () => {
    // (5550 + 6200 + 6990) / 3 = 6246.67
    expect(mixedBasePrice([5550, 6200, 6990], [1 / 3, 1 / 3, 1 / 3], "AVERAGE")).toBe(6247);
    // (1001 + 1002) / 2 = 1001.5 -> 1002
    expect(mixedBasePrice([1001, 1002], [0.5, 0.5], "AVERAGE")).toBe(1002);
  });
  it("PROPORTIONAL usa a fração de cada sabor", () => {
    expect(mixedBasePrice([6000, 9000], [2 / 3, 1 / 3], "PROPORTIONAL")).toBe(7000);
    expect(mixedBasePrice([5550, 6200], [0.5, 0.5], "PROPORTIONAL")).toBe(5875);
  });
});

describe("pricePizza", () => {
  it("meia calabresa meia frango com catupiry, borda de cheddar (Grande)", () => {
    const r = pricePizza(catalog, { sizeId: "grande", parts: [{ flavorId: "calabresa" }, { flavorId: "frango" }], crustId: "cheddar" }, "MAX");
    expect(r.unitPriceCents).toBe(5550 + 1200);
    expect(r.details.flavors.map((f) => f.fraction)).toEqual(["1/2", "1/2"]);
  });

  it("sabor com preço próprio sobrepõe a faixa", () => {
    const r = pricePizza(catalog, { sizeId: "grande", parts: [{ flavorId: "camarao" }] }, "MAX");
    expect(r.unitPriceCents).toBe(7990);
  });

  it("três sabores pela média com adicional", () => {
    const r = pricePizza(catalog, { sizeId: "familia", parts: [{ flavorId: "calabresa" }, { flavorId: "4queijos" }, { flavorId: "camarao" }], addonIds: ["bacon"] }, "AVERAGE");
    expect(r.unitPriceCents).toBe(Math.round((6900 + 7800 + 8800) / 3) + 700);
  });

  it("respeita o máximo de sabores do tamanho", () => {
    expect(() => pricePizza(catalog, { sizeId: "media", parts: [{ flavorId: "calabresa" }, { flavorId: "frango" }, { flavorId: "4queijos" }] }, "MAX")).toThrow(/até 2 sabores/);
    expect(() => pricePizza(catalog, { sizeId: "broto", parts: [{ flavorId: "calabresa" }, { flavorId: "frango" }] }, "MAX")).toThrow(PricingError);
  });

  it("remover ingrediente não muda o preço e só aceita ingredientes do sabor", () => {
    const r = pricePizza(catalog, { sizeId: "grande", parts: [{ flavorId: "calabresa", removed: ["cebola", "inventado"] }] }, "MAX");
    expect(r.unitPriceCents).toBe(5550);
    expect(r.details.flavors[0]!.removed).toEqual(["cebola"]);
  });

  it("borda indisponível no tamanho gera erro", () => {
    expect(() => pricePizza(catalog, { sizeId: "broto", parts: [{ flavorId: "calabresa" }], crustId: "cheddar" }, "MAX")).toThrow(/Borda/);
  });

  it("frações precisam somar 1", () => {
    expect(() => pricePizza(catalog, { sizeId: "grande", parts: [{ flavorId: "calabresa", fraction: 0.5 }, { flavorId: "frango", fraction: 0.25 }] }, "PROPORTIONAL")).toThrow(/frações/);
  });
});

describe("ajustes por loja", () => {
  const overrides: RawOverride[] = [
    { targetType: "FLAVOR", targetId: "frango", sizeId: "", priceCents: null, available: false, exclusive: false },
    { targetType: "TIER_PRICE", targetId: "trad", sizeId: "grande", priceCents: 5990, available: true, exclusive: false },
    { targetType: "PRODUCT", targetId: "refri2l", sizeId: "", priceCents: 1650, available: true, exclusive: false },
  ];
  const loja2 = resolveCatalog(structuredClone(raw), overrides);

  it("sabor esgotado só nesta loja", () => {
    expect(() => pricePizza(loja2, { sizeId: "grande", parts: [{ flavorId: "frango" }] }, "MAX")).toThrow(/esgotado/);
    expect(() => pricePizza(catalog, { sizeId: "grande", parts: [{ flavorId: "frango" }] }, "MAX")).not.toThrow();
  });

  it("preço da faixa ajustado por loja e tamanho", () => {
    expect(pricePizza(loja2, { sizeId: "grande", parts: [{ flavorId: "calabresa" }] }, "MAX").unitPriceCents).toBe(5990);
    expect(pricePizza(loja2, { sizeId: "familia", parts: [{ flavorId: "calabresa" }] }, "MAX").unitPriceCents).toBe(6900);
  });

  it("preço de produto por loja", () => {
    expect(priceLine(loja2, { kind: "PRODUCT", productId: "refri2l", option: "Coca-Cola", qty: 2 }, "MAX").totalCents).toBe(3300);
  });

  it("item exclusivo aparece só na loja dona", () => {
    const all: RawOverride[] = [{ targetType: "PRODUCT", targetId: "parm", sizeId: "", priceCents: null, available: true, exclusive: true }];
    const ex = exclusiveSets(all);
    const dona = resolveCatalog(structuredClone(raw), all, ex);
    const outra = resolveCatalog(structuredClone(raw), [], ex);
    expect(dona.products.some((p) => p.id === "parm")).toBe(true);
    expect(outra.products.some((p) => p.id === "parm")).toBe(false);
  });
});

describe("combos e carrinho", () => {
  it("combo cobra preço fixo + borda, e só aceita sabores da faixa", () => {
    const line = priceLine(catalog, { kind: "COMBO", comboId: "combo-familia", pizza: { parts: [{ flavorId: "calabresa" }], crustId: "cheddar" }, drink: "Guaraná", qty: 1 }, "MAX");
    expect(line.totalCents).toBe(7785 + 1400);
    expect(() => priceLine(catalog, { kind: "COMBO", comboId: "combo-familia", pizza: { parts: [{ flavorId: "camarao" }] }, drink: "Guaraná", qty: 1 }, "MAX")).toThrow(/promoção/);
    expect(() => priceLine(catalog, { kind: "COMBO", comboId: "combo-familia", pizza: { parts: [{ flavorId: "calabresa" }] }, qty: 1 }, "MAX")).toThrow(/bebida/);
  });

  it("produto com opção exige a escolha", () => {
    expect(() => priceLine(catalog, { kind: "PRODUCT", productId: "refri2l", qty: 1 }, "MAX")).toThrow(/opção/);
  });

  it("total do carrinho com frete", () => {
    const q = quoteCart(catalog, [
      { kind: "PIZZA", sizeId: "grande", parts: [{ flavorId: "calabresa" }, { flavorId: "frango" }], crustId: "cheddar", qty: 2 },
      { kind: "PRODUCT", productId: "refri2l", option: "Guaraná", qty: 1 },
    ], "MAX", 600);
    expect(q.subtotalCents).toBe((5550 + 1200) * 2 + 1700);
    expect(q.totalCents).toBe(q.subtotalCents + 600);
  });
});
