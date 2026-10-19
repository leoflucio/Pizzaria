// Seed: rede D'Napoles, 3 lojas reais (João Pessoa/PB) e cardápio inicial.
// Tudo aqui é ponto de partida e pode ser editado no painel.
import { PrismaClient, type OverrideTarget } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const R = (reais: number) => Math.round(reais * 100);

async function main() {
  const already = await prisma.network.findFirst();
  if (already && process.env.SEED_FORCE !== "1") {
    console.log("Seed já aplicado; use SEED_FORCE=1 com o banco limpo para refazer.");
    return;
  }

  const network = await prisma.network.create({
    data: { name: "D'Napoles", mixedPricingRule: "MAX", primaryColor: "#b91c1c", tagline: "Pizzaria em João Pessoa" },
  });

  // Coordenadas aproximadas; ajuste o pino de cada loja no painel.
  const storeData = [
    { code: "CRISTO", label: "Cristo", slug: "cristo", street: "Rua Presidente Ranieri Mazilli", number: "1791", neighborhood: "Cristo Redentor", lat: -7.1556, lng: -34.8789, prepBaseMinutes: 30, pickupMinutes: 45 },
    { code: "MANAIRA", label: "Manaíra", slug: "manaira", street: "Avenida Monteiro da Franca", number: "1090", neighborhood: "Manaíra", lat: -7.0968, lng: -34.8356, prepBaseMinutes: 25, pickupMinutes: 30 },
    { code: "BANCARIOS", label: "Bancários", slug: "bancarios", street: "Rua Walfredo Macedo Brandão", number: "1099", neighborhood: "Jardim Cidade Universitária", lat: -7.1436, lng: -34.8358, prepBaseMinutes: 20, pickupMinutes: 20 },
  ];
  const stores: Record<string, { id: string }> = {};
  for (const [i, s] of storeData.entries()) {
    stores[s.code] = await prisma.store.create({
      data: {
        ...s, networkId: network.id, name: `D'Napoles ${s.label}`, city: "João Pessoa", state: "PB", sort: i,
        // Aberta todos os dias (decisão do dono em 19/10/2026).
        hours: { create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: "17:30", closesAt: "23:30" })) },
        paymentAccount: { create: { provider: "fake", holderName: `D'Napoles ${s.label}`, pixKey: null } },
        printers: { create: { name: "Cozinha 80 mm", kind: "BROWSER" } },
      },
    });
  }

  // Áreas de entrega iniciais por bairro (taxas de exemplo).
  const zones: Record<string, [string, number, number][]> = {
    // [bairro, taxa R$, minutos extras]
    CRISTO: [
      ["Cristo Redentor", 4, 0], ["Jaguaribe", 6, 5], ["Ernesto Geisel", 6, 5], ["Rangel", 6, 5], ["Varjão", 6, 5],
      ["Cruz das Armas", 7, 8], ["Oitizeiro", 7, 8], ["Água Fria", 6, 6], ["João Paulo II", 6, 5], ["Funcionários", 7, 8],
      ["Grotão", 7, 8], ["Costa e Silva", 7, 8], ["Ernani Sátiro", 7, 8], ["José Américo", 6, 6], ["Valentina", 9, 12],
    ],
    MANAIRA: [
      ["Manaíra", 4, 0], ["Tambaú", 5, 3], ["Jardim Oceania", 5, 4], ["Bessa", 5, 5], ["Aeroclube", 5, 5],
      ["João Agripino", 5, 4], ["Cabo Branco", 6, 6], ["Brisamar", 6, 6], ["Miramar", 6, 6], ["São José", 6, 5],
      ["Pedro Gondim", 7, 8], ["Expedicionários", 7, 8], ["Tambauzinho", 7, 8], ["Torre", 8, 10], ["Altiplano Cabo Branco", 8, 10],
    ],
    BANCARIOS: [
      ["Bancários", 4, 0], ["Jardim Cidade Universitária", 4, 0], ["Castelo Branco", 5, 4], ["Anatólia", 5, 4],
      ["Jardim São Paulo", 5, 4], ["Mangabeira", 6, 6], ["Cidade dos Colibris", 6, 6], ["José Américo", 6, 6], ["Água Fria", 6, 6],
      ["Portal do Sol", 7, 8], ["Altiplano Cabo Branco", 7, 8], ["Planalto da Boa Esperança", 7, 8], ["Valentina", 8, 10],
      ["Penha", 9, 12], ["Ponta do Seixas", 9, 12],
    ],
  };
  for (const [code, list] of Object.entries(zones)) {
    // Agrupa bairros com a mesma taxa e tempo numa área só, como o dono editaria.
    const groups = new Map<string, string[]>();
    for (const [n, fee, extra] of list) groups.set(`${fee}|${extra}`, [...(groups.get(`${fee}|${extra}`) ?? []), n]);
    for (const [key, names] of groups) {
      const [fee, extra] = key.split("|").map(Number);
      await prisma.deliveryZone.create({
        data: { storeId: stores[code]!.id, name: `Taxa R$ ${fee}`, kind: "NEIGHBORHOOD", neighborhoods: names, feeCents: R(fee!), extraMinutes: extra!, minOrderCents: R(30) },
      });
    }
  }

  // Tamanhos atuais (iguais nas 3 lojas no pedir.delivery).
  const sizeData = [
    { name: "Brotinho", slices: null, maxFlavors: 1 },
    { name: "Pequena", slices: 4, maxFlavors: 2 },
    { name: "Média", slices: 6, maxFlavors: 2 },
    { name: "Grande", slices: 8, maxFlavors: 3 },
    { name: "Família", slices: 12, maxFlavors: 3 },
  ];
  const sizes: { id: string }[] = [];
  for (const [i, s] of sizeData.entries()) sizes.push(await prisma.pizzaSize.create({ data: { ...s, sort: i } }));
  const [broto, pequena, , grande, familia] = sizes;

  const tierData: [string, number[]][] = [
    ["Tradicional", [22, 33, 44, 55.5, 69]],
    ["Especial", [25, 38, 50, 62, 78]],
    ["Premium", [28, 42, 56, 69.9, 88]],
    ["Doce", [22, 33, 44, 55.5, 69]],
  ];
  const tiers: Record<string, string> = {};
  for (const [i, [name, prices]] of tierData.entries()) {
    const t = await prisma.flavorTier.create({
      data: { name, sort: i, prices: { create: prices.map((p, j) => ({ sizeId: sizes[j]!.id, priceCents: R(p) })) } },
    });
    tiers[name] = t.id;
  }

  const flavors: [string, string, string[], string[]?][] = [
    ["Tradicional", "Mussarela", ["molho de tomate", "mussarela", "orégano", "azeitona"]],
    ["Tradicional", "Calabresa", ["molho de tomate", "mussarela", "calabresa", "cebola", "orégano"]],
    ["Tradicional", "Calabresa Acebolada", ["molho de tomate", "calabresa", "cebola", "orégano"]],
    ["Tradicional", "Marguerita", ["molho de tomate", "mussarela", "tomate", "manjericão"]],
    ["Tradicional", "Portuguesa", ["molho de tomate", "mussarela", "presunto", "ovo", "cebola", "ervilha", "azeitona"]],
    ["Tradicional", "Frango com Catupiry", ["molho de tomate", "frango", "catupiry", "milho"], ["frango catupiry", "frango c/ catupiry"]],
    ["Tradicional", "Milho", ["molho de tomate", "mussarela", "milho"]],
    ["Tradicional", "Napolitana", ["molho de tomate", "mussarela", "tomate", "parmesão"]],
    ["Tradicional", "Bacon", ["molho de tomate", "mussarela", "bacon"]],
    ["Especial", "Quatro Queijos", ["molho de tomate", "mussarela", "provolone", "parmesão", "catupiry"], ["4 queijos"]],
    ["Especial", "Frango com Cheddar", ["molho de tomate", "frango", "cheddar"]],
    ["Especial", "Carne de Sol com Queijo Coalho", ["molho de tomate", "carne de sol", "queijo coalho", "cebola"], ["carne de sol"]],
    ["Especial", "Lombo Canadense", ["molho de tomate", "mussarela", "lombo", "catupiry"]],
    ["Especial", "Atum", ["molho de tomate", "mussarela", "atum", "cebola"]],
    ["Especial", "Toscana", ["molho de tomate", "mussarela", "linguiça toscana", "cebola"]],
    ["Premium", "D'Napoles", ["molho de tomate", "mussarela", "filé", "bacon", "catupiry", "cebola"], ["da casa"]],
    ["Premium", "Camarão", ["molho de tomate", "mussarela", "camarão", "catupiry"]],
    ["Premium", "Filé com Gorgonzola", ["molho de tomate", "mussarela", "filé", "gorgonzola"]],
    ["Premium", "Parma com Rúcula", ["molho de tomate", "mussarela", "presunto parma", "rúcula", "tomate seco"]],
    ["Doce", "Chocolate", ["chocolate ao leite", "granulado"]],
    ["Doce", "Brigadeiro", ["chocolate", "granulado"]],
    ["Doce", "Romeu e Julieta", ["mussarela", "goiabada"]],
    ["Doce", "Banana com Canela", ["banana", "canela", "açúcar", "leite condensado"]],
    ["Doce", "Prestígio", ["chocolate", "coco ralado"]],
  ];
  for (const [i, [tier, name, ingredients, aliases]] of flavors.entries()) {
    await prisma.flavor.create({ data: { name, tierId: tiers[tier]!, ingredients, aliases: aliases ?? [], isSweet: tier === "Doce", sort: i } });
  }

  const crustPrices = [8, 10, 12, 14, 16];
  for (const [i, name] of ["Catupiry", "Cheddar", "Cream Cheese", "Chocolate"].entries()) {
    await prisma.crust.create({ data: { name, sort: i, prices: { create: sizes.map((s, j) => ({ sizeId: s.id, priceCents: R(crustPrices[j]!) })) } } });
  }
  const addonPrices = [3, 4, 5, 6, 7];
  for (const [i, name] of ["Bacon", "Catupiry extra", "Ovo", "Cebola", "Azeitona", "Queijo extra"].entries()) {
    await prisma.addon.create({ data: { name, sort: i, prices: { create: sizes.map((s, j) => ({ sizeId: s.id, priceCents: R(addonPrices[j]!) })) } } });
  }

  const catPizza = await prisma.category.create({ data: { name: "Pizzas", kind: "PIZZA", sort: 1 } });
  void catPizza;
  const catCombos = await prisma.category.create({ data: { name: "Combos", kind: "COMBO", sort: 0 } });
  const catParm = await prisma.category.create({ data: { name: "Parmegiana", kind: "PRODUCT", sort: 2 } });
  const catDrinks = await prisma.category.create({ data: { name: "Bebidas", kind: "PRODUCT", sort: 3 } });
  const catWines = await prisma.category.create({ data: { name: "Vinhos", kind: "PRODUCT", sort: 4 } });

  const refri = ["Coca-Cola", "Guaraná Antarctica"];
  const p = async (categoryId: string, name: string, price: number, extra: { description?: string; options?: string[] } = {}, sort = 0) =>
    prisma.product.create({ data: { categoryId, name, priceCents: R(price), description: extra.description, options: extra.options ?? [], sort } });

  const parm = await p(catParm.id, "Parmegiana de Carne", 35.9, { description: "Empanado de carne, coberto com mussarela e molho ao sugo da casa. Acompanha espaguete e batata frita." });
  const lata = await p(catDrinks.id, "Refrigerante lata", 7, { options: refri }, 0);
  const litro = await p(catDrinks.id, "Refrigerante 1L", 16, { options: refri }, 1);
  const doisL = await p(catDrinks.id, "Refrigerante 2L", 17, { options: refri }, 2);
  await p(catDrinks.id, "Heineken long neck", 11.9, {}, 3);
  await p(catDrinks.id, "Água mineral", 6, {}, 4);
  await p(catDrinks.id, "Água com gás", 5.5, {}, 5);
  const wines: [string, number][] = [
    ["Espumante Casa Perini Aquarela Rosé", 102], ["Chandon Brut 750 ml", 169], ["Vinho branco New Roads 750 ml (ARG)", 64],
    ["Vinho tinto Trapiche Cabernet Sauvignon (ARG)", 76], ["Vinho tinto Trapiche Malbec (ARG)", 76], ["Vinho branco Adobe Riesling (CHI)", 126],
    ["Vinho tinto Adobe Cabernet Sauvignon (CHI)", 126], ["Vinho tinto Santa Helena Reservado Cab. Merlot (CHI)", 56],
    ["Vinho tinto Santa Helena Reservado Cab. Sauvignon (CHI)", 56], ["Vinho tinto Knock Blend Tempranillo/Syrah 750 ml (ESP)", 98],
    ["Vinho tinto EA 750 ml (POR)", 129.9], ["Vinho tinto Fazenda Velha Suave 750 ml (POR)", 44],
  ];
  const wineIds: string[] = [];
  for (const [i, [n, v]] of wines.entries()) wineIds.push((await p(catWines.id, n, v, {}, i)).id);

  const drinks2l = ["Guaraná Antarctica", "Coca-Cola", "Sukita", "Soda"];
  const comboFamilia = await prisma.combo.create({
    data: { categoryId: catCombos.id, name: "Combo Família + Refri 2L", description: "Pizza Família (12 fatias) com sabores tradicionais + refrigerante 2L.", priceCents: R(77.85), pizzaSizeId: familia!.id, allowedTierIds: [tiers.Tradicional!], drinkOptions: drinks2l, sort: 0 },
  });
  const comboDoce = await prisma.combo.create({
    data: { categoryId: catCombos.id, name: "Família + Pequena Doce", description: "Pizza Família tradicional + Pizza Pequena doce.", priceCents: R(97), pizzaSizeId: familia!.id, allowedTierIds: [tiers.Tradicional!], extraPizzaSizeId: pequena!.id, extraTierIds: [tiers.Doce!], sort: 1 },
  });
  const comboGrande = await prisma.combo.create({
    data: { categoryId: catCombos.id, name: "Grande + Guaraná 2L", description: "Pizza Grande com até 2 sabores tradicionais + Guaraná Antarctica 2L.", priceCents: R(67.4), pizzaSizeId: grande!.id, allowedTierIds: [tiers.Tradicional!], drinkOptions: ["Guaraná Antarctica"], sort: 2 },
  });
  void broto;

  // Ajustes por loja, refletindo o cardápio atual de cada unidade.
  const ov = (store: string, targetType: OverrideTarget, targetId: string, data: { priceCents?: number; exclusive?: boolean; available?: boolean }) =>
    prisma.storeCatalogOverride.create({ data: { storeId: stores[store]!.id, targetType, targetId, ...data } });

  await ov("CRISTO", "PRODUCT", parm.id, { exclusive: true });
  for (const id of wineIds) await ov("MANAIRA", "PRODUCT", id, { exclusive: true });
  await ov("BANCARIOS", "PRODUCT", lata.id, { priceCents: R(6) });
  await ov("BANCARIOS", "PRODUCT", litro.id, { priceCents: R(15) });
  await ov("BANCARIOS", "PRODUCT", doisL.id, { priceCents: R(16.5) });
  await ov("MANAIRA", "COMBO", comboFamilia.id, { priceCents: R(77.8) });
  await ov("MANAIRA", "COMBO", comboDoce.id, { exclusive: true });
  await ov("BANCARIOS", "COMBO", comboDoce.id, { exclusive: true, priceCents: R(84) });
  await ov("BANCARIOS", "COMBO", comboGrande.id, { exclusive: true });

  // Usuários iniciais. Troque as senhas no primeiro acesso.
  const password = process.env.SEED_PASSWORD || "dnapoles123";
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { email: "dono@dnapoles.local", name: "Dono da rede", passwordHash: hash, assignments: { create: { role: "NETWORK_ADMIN" } } } });
  for (const s of storeData) {
    const storeId = stores[s.code]!.id;
    const slug = s.slug;
    await prisma.user.create({ data: { email: `gerente.${slug}@dnapoles.local`, name: `Gerente ${s.label}`, passwordHash: hash, assignments: { create: { role: "STORE_MANAGER", storeId } } } });
    await prisma.user.create({ data: { email: `atendente.${slug}@dnapoles.local`, name: `Atendente ${s.label}`, passwordHash: hash, assignments: { create: { role: "ATTENDANT", storeId } } } });
    await prisma.user.create({ data: { email: `cozinha.${slug}@dnapoles.local`, name: `Cozinha ${s.label}`, passwordHash: hash, assignments: { create: { role: "KITCHEN", storeId } } } });
  }

  console.log(`Seed ok: 3 lojas, ${flavors.length} sabores, ${wines.length + 7} produtos, 3 combos. Senha inicial: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
