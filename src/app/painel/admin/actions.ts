"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma, type OverrideTarget, type Role } from "@prisma/client";
import { canAccessStore, isNetworkAdmin, requireSession, type Session } from "@/server/auth";
import { prisma } from "@/server/db";
import { invalidateCatalog } from "@/server/catalog";
import { encryptJson } from "@/server/crypto";
import { audit } from "@/server/audit";
import { publish } from "@/server/events";
import { parseBRL } from "@/domain/money";

// ---------- helpers ----------

/** Form actions: on validation errors go back to the same page with ?erro=, instead of an error screen. */
function action(fn: (f: FormData) => Promise<void>) {
  return async (f: FormData) => {
    try {
      await fn(f);
    } catch (e) {
      unstable_rethrow(e);
      const msg = e instanceof z.ZodError ? (e.issues[0]?.message ?? "Dados inválidos") : e instanceof Error ? e.message : "Erro ao salvar";
      const back = new URL((await headers()).get("referer") ?? "http://x/painel/admin");
      back.searchParams.delete("ok");
      back.searchParams.set("erro", msg);
      redirect(back.pathname + back.search + back.hash);
    }
  };
}


async function admin(): Promise<Session> {
  const s = await requireSession();
  if (!isNetworkAdmin(s)) throw new Error("Só o dono da rede pode alterar isso.");
  return s;
}

async function manager(storeId: string): Promise<Session> {
  const s = await requireSession();
  if (!canAccessStore(s, storeId, ["STORE_MANAGER"])) throw new Error("Sem permissão para esta loja.");
  return s;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;
const int = (f: FormData, k: string, d = 0) => (str(f, k) === "" ? d : Math.round(Number(str(f, k))));
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const money = (f: FormData, k: string) => parseBRL(str(f, k) || "0");
const moneyOrNull = (f: FormData, k: string) => (str(f, k) === "" ? null : parseBRL(str(f, k)));
const list = (f: FormData, k: string) => str(f, k).split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

function done(path: string, msg = "Salvo") {
  invalidateCatalog();
  revalidatePath("/painel", "layout");
  redirect(`${path}${path.includes("?") ? "&" : "?"}ok=${encodeURIComponent(msg)}`);
}

// ---------- rede ----------

export const saveNetwork = action(async (f: FormData) => {
  const s = await admin();
  const data = z.object({
    name: z.string().min(2).max(60), tagline: z.string().max(120).nullable(),
    mixedPricingRule: z.enum(["MAX", "AVERAGE", "PROPORTIONAL"]), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), timezone: z.string().min(3),
  }).parse({ name: str(f, "name"), tagline: opt(f, "tagline"), mixedPricingRule: str(f, "mixedPricingRule"), primaryColor: str(f, "primaryColor"), timezone: str(f, "timezone") });
  const n = await prisma.network.findFirstOrThrow();
  await prisma.network.update({ where: { id: n.id }, data });
  await audit(s.userId, "network.update", "Network", n.id, data);
  done("/painel/admin/cardapio");
});

// ---------- lojas ----------

export const saveStore = action(async (f: FormData) => {
  const id = str(f, "id");
  const s = id ? await manager(id) : await admin();
  const isAdmin = isNetworkAdmin(s);
  const base = z.object({
    label: z.string().min(2).max(40), phone: z.string().max(20).nullable(), prepBaseMinutes: z.number().int().min(5).max(180),
    pickupMinutes: z.number().int().min(5).max(180), kitchenCapacity: z.number().int().min(1).max(50),
  }).parse({ label: str(f, "label"), phone: opt(f, "phone"), prepBaseMinutes: int(f, "prepBaseMinutes", 25), pickupMinutes: int(f, "pickupMinutes", 30), kitchenCapacity: int(f, "kitchenCapacity", 6) });
  const full = isAdmin
    ? z.object({
        code: z.string().regex(/^[A-Z0-9_]{2,20}$/, "Código: letras maiúsculas, sem espaço"), slug: z.string().regex(/^[a-z0-9-]{2,40}$/, "Endereço do link: minúsculas e hífen"),
        street: z.string().min(2), number: z.string().min(1), neighborhood: z.string().min(2), city: z.string().min(2), state: z.string().length(2),
        lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), active: z.boolean(), sort: z.number().int(),
      }).parse({
        code: str(f, "code").toUpperCase(), slug: str(f, "slug").toLowerCase(), street: str(f, "street"), number: str(f, "number"), neighborhood: str(f, "neighborhood"),
        city: str(f, "city") || "João Pessoa", state: (str(f, "state") || "PB").toUpperCase(), lat: Number(str(f, "lat")), lng: Number(str(f, "lng")), active: bool(f, "active"), sort: int(f, "sort"),
      })
    : {};
  const network = await prisma.network.findFirstOrThrow();
  const data = { ...base, ...full, name: `${network.name} ${base.label}` };
  const store = id
    ? await prisma.store.update({ where: { id }, data })
    : await prisma.store.create({
        data: {
          ...(data as Required<typeof data> & typeof base & Prisma.StoreUncheckedCreateInput), networkId: network.id,
          hours: { create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: "17:30", closesAt: "23:30" })) },
          paymentAccount: { create: { provider: "fake", holderName: data.name } },
        },
      });
  await audit(s.userId, id ? "store.update" : "store.create", "Store", store.id, data as Prisma.InputJsonValue);
  await publish({ type: "store.updated", storeId: store.id });
  done(`/painel/admin/lojas/${store.id}`);
});

export const saveHours = action(async (f: FormData) => {
  const storeId = str(f, "storeId");
  const s = await manager(storeId);
  const rows: { weekday: number; opensAt: string; closesAt: string }[] = [];
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (let d = 0; d < 7; d++) {
    for (let w = 0; w < 3; w++) {
      const o = str(f, `o_${d}_${w}`);
      const c = str(f, `c_${d}_${w}`);
      if (!o && !c) continue;
      if (!hhmm.test(o) || !hhmm.test(c)) throw new Error("Use horários no formato 18:00.");
      rows.push({ weekday: d, opensAt: o, closesAt: c });
    }
  }
  await prisma.$transaction([prisma.storeHours.deleteMany({ where: { storeId } }), prisma.storeHours.createMany({ data: rows.map((r) => ({ ...r, storeId })) })]);
  await audit(s.userId, "store.hours", "Store", storeId, rows);
  done(`/painel/admin/lojas/${storeId}`, "Horários salvos");
});

export const savePaymentAccount = action(async (f: FormData) => {
  const s = await admin();
  const storeId = str(f, "storeId");
  const credentialsRaw = str(f, "credentials");
  let credentialsEnc: string | undefined;
  if (credentialsRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(credentialsRaw);
    } catch {
      throw new Error('Credenciais precisam estar em JSON, ex.: {"accessToken": "..."}');
    }
    credentialsEnc = encryptJson(parsed);
  }
  const data = {
    provider: str(f, "provider") || "fake", holderName: str(f, "holderName"), document: opt(f, "document"), pixKey: opt(f, "pixKey"),
    acceptsPix: bool(f, "acceptsPix"), acceptsCard: bool(f, "acceptsCard"), acceptsCash: bool(f, "acceptsCash"),
    ...(credentialsEnc ? { credentialsEnc } : {}), ...(bool(f, "clearCredentials") ? { credentialsEnc: null } : {}),
  };
  if (data.holderName.length < 2) throw new Error("Informe o titular da conta.");
  await prisma.paymentAccount.upsert({ where: { storeId }, create: { storeId, ...data }, update: data });
  // Never log secrets.
  await audit(s.userId, "payment_account.update", "Store", storeId, { provider: data.provider, holderName: data.holderName, credentialsChanged: !!credentialsEnc });
  done(`/painel/admin/lojas/${storeId}`, "Conta de recebimento salva");
});

export const savePrinter = action(async (f: FormData) => {
  const storeId = str(f, "storeId");
  await manager(storeId);
  const id = str(f, "id");
  const data = { name: str(f, "name") || "Impressora", kind: str(f, "kind") || "BROWSER", host: opt(f, "host"), port: str(f, "port") ? int(f, "port") : null, copies: int(f, "copies", 1), active: bool(f, "active") };
  if (id) await prisma.printer.update({ where: { id, storeId }, data });
  else await prisma.printer.create({ data: { ...data, storeId } });
  done(`/painel/admin/lojas/${storeId}`, "Impressora salva");
});

// ---------- áreas de entrega ----------

export const saveZone = action(async (f: FormData) => {
  const storeId = str(f, "storeId");
  const s = await manager(storeId);
  const id = str(f, "id");
  const kind = z.enum(["NEIGHBORHOOD", "RADIUS", "POLYGON"]).parse(str(f, "kind"));
  let polygon: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
  if (kind === "POLYGON") {
    const raw = str(f, "polygon");
    try {
      const g = JSON.parse(raw);
      // Accepts a ring [[lng,lat],...], a GeoJSON Polygon, Feature or FeatureCollection (geojson.io export).
      const geom = g.type === "FeatureCollection" ? g.features[0].geometry : g.type === "Feature" ? g.geometry : g;
      const ring = Array.isArray(geom) ? geom : geom.coordinates[0];
      if (!Array.isArray(ring) || ring.length < 3) throw new Error();
      polygon = ring.map((p: number[]) => [Number(p[0]), Number(p[1])]);
    } catch {
      throw new Error("Polígono inválido. Cole o GeoJSON exportado do geojson.io.");
    }
  }
  const data = {
    name: str(f, "name") || "Área", kind, neighborhoods: kind === "NEIGHBORHOOD" ? list(f, "neighborhoods") : [],
    radiusMeters: kind === "RADIUS" ? Math.round(Number(str(f, "radiusKm").replace(",", ".")) * 1000) : null,
    polygon, feeCents: money(f, "fee"), minOrderCents: money(f, "minOrder"), extraMinutes: int(f, "extraMinutes"), priority: int(f, "priority"), active: bool(f, "active"),
  };
  if (kind === "NEIGHBORHOOD" && data.neighborhoods.length === 0) throw new Error("Liste pelo menos um bairro.");
  if (kind === "RADIUS" && !(data.radiusMeters! > 0)) throw new Error("Informe o raio em km.");
  const zone = id ? await prisma.deliveryZone.update({ where: { id, storeId }, data }) : await prisma.deliveryZone.create({ data: { ...data, storeId } });
  await audit(s.userId, id ? "zone.update" : "zone.create", "DeliveryZone", zone.id, { ...data, polygon: kind === "POLYGON" ? "(polígono)" : null } as Prisma.InputJsonValue);
  done(`/painel/admin/lojas/${storeId}/areas`, "Área salva");
});

export const deleteZone = action(async (f: FormData) => {
  const storeId = str(f, "storeId");
  const s = await manager(storeId);
  await prisma.deliveryZone.delete({ where: { id: str(f, "id"), storeId } });
  await audit(s.userId, "zone.delete", "DeliveryZone", str(f, "id"));
  done(`/painel/admin/lojas/${storeId}/areas`, "Área removida");
});

// ---------- cardápio central ----------

export const saveSize = action(async (f: FormData) => {
  await admin();
  const id = str(f, "id");
  const data = { name: str(f, "name"), slices: str(f, "slices") ? int(f, "slices") : null, maxFlavors: Math.min(4, Math.max(1, int(f, "maxFlavors", 1))), sort: int(f, "sort"), active: bool(f, "active") };
  if (!data.name) throw new Error("Nome obrigatório.");
  if (id) await prisma.pizzaSize.update({ where: { id }, data });
  else await prisma.pizzaSize.create({ data });
  done("/painel/admin/cardapio#tamanhos");
});

/** Saves a price grid: fields named p_<rowId>_<sizeId>. Empty = not sold in that size. */
async function savePriceGrid(f: FormData, model: "tierPrice" | "crustPrice" | "addonPrice" | "flavorSizePrice", key: "tierId" | "crustId" | "addonId" | "flavorId") {
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [name, value] of f.entries()) {
    const m = /^p_([^_]+)_(.+)$/.exec(name);
    if (!m) continue;
    const [, rowId, sizeId] = m;
    const v = String(value).trim();
    const where = { [`${key}_sizeId`]: { [key]: rowId, sizeId } } as never;
    const delegate = prisma[model] as unknown as { upsert: (a: unknown) => Prisma.PrismaPromise<unknown>; deleteMany: (a: unknown) => Prisma.PrismaPromise<unknown> };
    if (v === "") ops.push(delegate.deleteMany({ where: { [key]: rowId, sizeId } }));
    else {
      const priceCents = parseBRL(v);
      ops.push(delegate.upsert({ where, create: { [key]: rowId, sizeId, priceCents }, update: { priceCents } }));
    }
  }
  await prisma.$transaction(ops);
}

export const saveTierPrices = action(async (f: FormData) => {
  const s = await admin();
  await savePriceGrid(f, "tierPrice", "tierId");
  await audit(s.userId, "prices.tiers", "TierPrice");
  done("/painel/admin/cardapio#faixas", "Preços salvos");
});

export const saveTier = action(async (f: FormData) => {
  await admin();
  const id = str(f, "id");
  const data = { name: str(f, "name"), sort: int(f, "sort") };
  if (id) await prisma.flavorTier.update({ where: { id }, data });
  else await prisma.flavorTier.create({ data });
  done("/painel/admin/cardapio#faixas");
});

export const saveFlavor = action(async (f: FormData) => {
  const s = await admin();
  const id = str(f, "id");
  const data = {
    name: str(f, "name"), description: opt(f, "description"), tierId: str(f, "tierId"), isSweet: bool(f, "isSweet"),
    ingredients: list(f, "ingredients").map((x) => x.toLowerCase()), aliases: list(f, "aliases").map((x) => x.toLowerCase()), active: bool(f, "active"), sort: int(f, "sort"),
  };
  if (!data.name || !data.tierId) throw new Error("Nome e faixa são obrigatórios.");
  const flavor = id ? await prisma.flavor.update({ where: { id }, data }) : await prisma.flavor.create({ data });
  // Optional own price per size (overrides the tier).
  for (const [name, value] of f.entries()) {
    const m = /^fp_(.+)$/.exec(name);
    if (!m) continue;
    const v = String(value).trim();
    if (v === "") await prisma.flavorSizePrice.deleteMany({ where: { flavorId: flavor.id, sizeId: m[1] } });
    else await prisma.flavorSizePrice.upsert({ where: { flavorId_sizeId: { flavorId: flavor.id, sizeId: m[1]! } }, create: { flavorId: flavor.id, sizeId: m[1]!, priceCents: parseBRL(v) }, update: { priceCents: parseBRL(v) } });
  }
  await audit(s.userId, id ? "flavor.update" : "flavor.create", "Flavor", flavor.id, data);
  done("/painel/admin/cardapio#sabores", `Sabor ${data.name} salvo`);
});

export const saveOption = action(async (f: FormData) => {
  await admin();
  const kind = str(f, "kind") as "crust" | "addon";
  const id = str(f, "id");
  const data = { name: str(f, "name"), active: bool(f, "active"), sort: int(f, "sort") };
  if (!data.name) throw new Error("Nome obrigatório.");
  const row = kind === "crust" ? (id ? await prisma.crust.update({ where: { id }, data }) : await prisma.crust.create({ data })) : id ? await prisma.addon.update({ where: { id }, data }) : await prisma.addon.create({ data });
  const prefix = `p_${row.id}_`;
  const grid = new FormData();
  for (const [k, v] of f.entries()) if (k.startsWith("p_") || k.startsWith("pnew_")) grid.append(k.replace(/^pnew_/, prefix), v);
  await savePriceGrid(grid, kind === "crust" ? "crustPrice" : "addonPrice", kind === "crust" ? "crustId" : "addonId");
  done(`/painel/admin/cardapio#${kind === "crust" ? "bordas" : "adicionais"}`);
});

export const saveCategory = action(async (f: FormData) => {
  await admin();
  const id = str(f, "id");
  const data = { name: str(f, "name"), kind: z.enum(["PIZZA", "PRODUCT", "COMBO"]).parse(str(f, "kind") || "PRODUCT"), sort: int(f, "sort"), active: bool(f, "active") };
  if (id) await prisma.category.update({ where: { id }, data });
  else await prisma.category.create({ data });
  done("/painel/admin/cardapio#categorias");
});

export const saveProduct = action(async (f: FormData) => {
  await admin();
  const id = str(f, "id");
  const data = { categoryId: str(f, "categoryId"), name: str(f, "name"), description: opt(f, "description"), priceCents: money(f, "price"), options: list(f, "options"), active: bool(f, "active"), sort: int(f, "sort") };
  if (!data.name || !data.categoryId) throw new Error("Nome e categoria são obrigatórios.");
  if (id) await prisma.product.update({ where: { id }, data });
  else await prisma.product.create({ data });
  done("/painel/admin/cardapio#produtos", `${data.name} salvo`);
});

export const saveCombo = action(async (f: FormData) => {
  await admin();
  const id = str(f, "id");
  const data = {
    categoryId: str(f, "categoryId"), name: str(f, "name"), description: opt(f, "description"), priceCents: money(f, "price"),
    pizzaSizeId: opt(f, "pizzaSizeId"), allowedTierIds: f.getAll("allowedTierIds").map(String), extraPizzaSizeId: opt(f, "extraPizzaSizeId"),
    extraTierIds: f.getAll("extraTierIds").map(String), drinkOptions: list(f, "drinkOptions"), weekdays: f.getAll("weekdays").map(Number), active: bool(f, "active"), sort: int(f, "sort"),
  };
  if (!data.name || !data.categoryId) throw new Error("Nome e categoria são obrigatórios.");
  if (id) await prisma.combo.update({ where: { id }, data });
  else await prisma.combo.create({ data });
  done("/painel/admin/cardapio#combos", `${data.name} salvo`);
});

// ---------- ajustes por loja ----------

export const saveOverrides = action(async (f: FormData) => {
  const storeId = str(f, "storeId");
  const s = await manager(storeId);
  const isAdmin = isNetworkAdmin(s);
  // Rows: o_<type>_<targetId>_<sizeId|all>_{price,available,exclusive,present}
  const rows = new Map<string, { type: OverrideTarget; targetId: string; sizeId: string; price: string; available: boolean; exclusive: boolean }>();
  for (const [name] of f.entries()) {
    const m = /^o_(FLAVOR|PRODUCT|CRUST|ADDON|TIER_PRICE|COMBO)_([^_]+)_([^_]+)_present$/.exec(name);
    if (!m) continue;
    const [, type, targetId, size] = m;
    const k = `o_${type}_${targetId}_${size}`;
    rows.set(k, { type: type as OverrideTarget, targetId: targetId!, sizeId: size === "all" ? "" : size!, price: str(f, `${k}_price`), available: bool(f, `${k}_available`), exclusive: bool(f, `${k}_exclusive`) });
  }
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const r of rows.values()) {
    const where = { storeId_targetType_targetId_sizeId: { storeId, targetType: r.type, targetId: r.targetId, sizeId: r.sizeId } };
    const existing = await prisma.storeCatalogOverride.findUnique({ where });
    const exclusive = isAdmin ? r.exclusive : (existing?.exclusive ?? false); // only the owner decides exclusivity
    const priceCents = r.price === "" ? null : parseBRL(r.price);
    const isDefault = priceCents == null && r.available && !exclusive;
    if (isDefault) ops.push(prisma.storeCatalogOverride.deleteMany({ where: { storeId, targetType: r.type, targetId: r.targetId, sizeId: r.sizeId } }));
    else ops.push(prisma.storeCatalogOverride.upsert({ where, create: { storeId, targetType: r.type, targetId: r.targetId, sizeId: r.sizeId, priceCents, available: r.available, exclusive }, update: { priceCents, available: r.available, exclusive } }));
  }
  await prisma.$transaction(ops);
  await audit(s.userId, "overrides.update", "Store", storeId, { count: rows.size });
  done(`/painel/admin/ajustes/${storeId}${str(f, "tab") ? `?tab=${str(f, "tab")}` : ""}`, "Ajustes da loja salvos");
});

// ---------- equipe ----------

export const saveUser = action(async (f: FormData) => {
  const s = await requireSession();
  const id = str(f, "id");
  const role = z.enum(["NETWORK_ADMIN", "STORE_MANAGER", "ATTENDANT", "KITCHEN", "COURIER"]).parse(str(f, "role")) as Role;
  const storeId = role === "NETWORK_ADMIN" ? null : str(f, "storeId") || null;
  if (role !== "NETWORK_ADMIN" && !storeId) throw new Error("Escolha a loja.");
  if (!isNetworkAdmin(s) && (role === "NETWORK_ADMIN" || role === "STORE_MANAGER" || !storeId || !canAccessStore(s, storeId, ["STORE_MANAGER"]))) throw new Error("Sem permissão para criar esse acesso.");
  const email = str(f, "email").toLowerCase();
  const password = str(f, "password");
  if (!id && password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
  const data = { name: str(f, "name"), email, active: id ? bool(f, "active") : true, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) };
  const user = id ? await prisma.user.update({ where: { id }, data }) : await prisma.user.create({ data: data as Prisma.UserCreateInput });
  if (!id || f.get("updateRole") === "1") {
    await prisma.staffAssignment.deleteMany({ where: { userId: user.id, ...(isNetworkAdmin(s) ? {} : { storeId }) } });
    await prisma.staffAssignment.create({ data: { userId: user.id, role, storeId } });
  }
  await audit(s.userId, id ? "user.update" : "user.create", "User", user.id, { email, role, storeId, passwordChanged: !!password });
  done("/painel/admin/equipe", "Usuário salvo");
});
