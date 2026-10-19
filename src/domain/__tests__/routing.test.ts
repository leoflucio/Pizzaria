import { describe, expect, it } from "vitest";
import { bestZoneForStore, servedNeighborhoods, zoneCovers, type Zone } from "../delivery";
import { routeDelivery, type RoutableStore } from "../routing";

const cristo: RoutableStore = { id: "cristo", name: "Cristo", lat: -7.1556, lng: -34.8789, isOpen: true, isPaused: false, prepBaseMinutes: 30, kitchenCapacity: 6, queueSize: 0 };
const bancarios: RoutableStore = { id: "bancarios", name: "Bancários", lat: -7.1436, lng: -34.8358, isOpen: true, isPaused: false, prepBaseMinutes: 20, kitchenCapacity: 6, queueSize: 0 };
const manaira: RoutableStore = { id: "manaira", name: "Manaíra", lat: -7.0968, lng: -34.8356, isOpen: true, isPaused: false, prepBaseMinutes: 25, kitchenCapacity: 6, queueSize: 0 };

const z = (p: Partial<Zone> & Pick<Zone, "id" | "storeId" | "kind" | "feeCents">): Zone => ({
  name: p.id, neighborhoods: [], radiusMeters: null, polygon: null, minOrderCents: 0, extraMinutes: 0, priority: 0, active: true, ...p,
});

const zones: Zone[] = [
  z({ id: "c1", storeId: "cristo", kind: "NEIGHBORHOOD", neighborhoods: ["Cristo Redentor"], feeCents: 400 }),
  z({ id: "c2", storeId: "cristo", kind: "NEIGHBORHOOD", neighborhoods: ["José Américo", "Água Fria"], feeCents: 600, extraMinutes: 6 }),
  z({ id: "b1", storeId: "bancarios", kind: "NEIGHBORHOOD", neighborhoods: ["Bancários"], feeCents: 400 }),
  z({ id: "b2", storeId: "bancarios", kind: "NEIGHBORHOOD", neighborhoods: ["Jose Americo", "Altiplano Cabo Branco"], feeCents: 600, extraMinutes: 6 }),
  z({ id: "m1", storeId: "manaira", kind: "NEIGHBORHOOD", neighborhoods: ["Manaíra", "Altiplano Cabo Branco"], feeCents: 800, extraMinutes: 10 }),
  z({ id: "m-raio", storeId: "manaira", kind: "RADIUS", radiusMeters: 2000, feeCents: 500 }),
];

describe("áreas de entrega", () => {
  it("bairro ignora acento e maiúsculas", () => {
    expect(zoneCovers(zones[3]!, bancarios, { neighborhood: "josé américo" })).toBe(true);
  });
  it("raio usa a distância até a loja", () => {
    expect(zoneCovers(zones[5]!, manaira, { point: { lat: -7.1, lng: -34.836 } })).toBe(true);
    expect(zoneCovers(zones[5]!, manaira, { point: { lat: -7.2, lng: -34.836 } })).toBe(false);
  });
  it("polígono", () => {
    const poly = z({ id: "p", storeId: "cristo", kind: "POLYGON", feeCents: 500, polygon: [[-34.89, -7.17], [-34.87, -7.17], [-34.87, -7.15], [-34.89, -7.15]] });
    expect(zoneCovers(poly, cristo, { point: { lat: -7.16, lng: -34.88 } })).toBe(true);
    expect(zoneCovers(poly, cristo, { point: { lat: -7.14, lng: -34.88 } })).toBe(false);
  });
  it("na mesma loja, a área de maior prioridade e menor taxa vence", () => {
    const local = [z({ id: "a", storeId: "cristo", kind: "NEIGHBORHOOD", neighborhoods: ["X"], feeCents: 900 }), z({ id: "b", storeId: "cristo", kind: "NEIGHBORHOOD", neighborhoods: ["X"], feeCents: 500 })];
    expect(bestZoneForStore(local, cristo, { neighborhood: "x" })!.id).toBe("b");
  });
  it("lista bairros atendidos sem repetir", () => {
    const list = servedNeighborhoods(zones);
    expect(list.filter((n) => n.toLowerCase().startsWith("jos")).length).toBe(1);
    expect(list).toContain("Altiplano Cabo Branco");
  });
});

describe("roteamento entre unidades", () => {
  it("endereço numa área só vai para aquela loja", () => {
    const r = routeDelivery([cristo, bancarios, manaira], zones, { neighborhood: "Cristo Redentor" });
    expect(r.ok && r.chosen.storeId).toBe("cristo");
  });

  it("endereço em duas áreas vai para a loja com menor tempo estimado", () => {
    // José Américo: Cristo (preparo 30) x Bancários (preparo 20) -> Bancários
    const r = routeDelivery([cristo, bancarios, manaira], zones, { neighborhood: "José Américo" });
    expect(r.ok && r.chosen.storeId).toBe("bancarios");
    expect(r.ok && r.alternatives.map((a) => a.storeId)).toEqual(["cristo"]);
  });

  it("fila da cozinha cheia muda a escolha", () => {
    const busy = { ...bancarios, queueSize: 18 }; // 3 fornadas x 12 min
    const r = routeDelivery([cristo, busy, manaira], zones, { neighborhood: "José Américo" });
    expect(r.ok && r.chosen.storeId).toBe("cristo");
  });

  it("empate de tempo decide pela menor taxa", () => {
    const a = { ...cristo, prepBaseMinutes: 20 };
    const local = [
      z({ id: "x1", storeId: "cristo", kind: "NEIGHBORHOOD", neighborhoods: ["Y"], feeCents: 700 }),
      z({ id: "x2", storeId: "bancarios", kind: "NEIGHBORHOOD", neighborhoods: ["Y"], feeCents: 500, extraMinutes: 2 }),
    ];
    const r = routeDelivery([a, bancarios], local, { neighborhood: "Y" });
    expect(r.ok && r.chosen.storeId).toBe("bancarios");
  });

  it("loja pausada passa o pedido para a próxima que entrega", () => {
    const r = routeDelivery([cristo, { ...bancarios, isPaused: true }, manaira], zones, { neighborhood: "José Américo" });
    expect(r.ok && r.chosen.storeId).toBe("cristo");
    expect(r.candidates.find((c) => c.storeId === "bancarios")?.reason).toBe("PAUSED");
  });

  it("todas fechadas ou pausadas", () => {
    const r = routeDelivery([{ ...cristo, isOpen: false }, { ...bancarios, isPaused: true }, manaira], zones, { neighborhood: "José Américo" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("ALL_UNAVAILABLE");
  });

  it("fora da área", () => {
    const r = routeDelivery([cristo, bancarios, manaira], zones, { neighborhood: "Cabedelo" });
    expect(!r.ok && r.reason).toBe("OUT_OF_AREA");
  });
});
