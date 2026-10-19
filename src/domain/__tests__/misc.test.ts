import { describe, expect, it } from "vitest";
import { isOpenAt, nextOpening } from "../hours";
import { canTransition, canTransfer, nextStatuses } from "../status";
import { formatBRL, parseBRL } from "../money";
import { renderTicket } from "../ticket";
import { checkoutSchema, phoneSchema } from "../checkout";

const TZ = "America/Fortaleza";
const all7 = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: "17:30", closesAt: "23:30" }));

describe("horários", () => {
  it("aberta dentro do horário no fuso da rede", () => {
    expect(isOpenAt(all7, new Date("2026-10-23T22:00:00Z"), TZ)).toBe(true); // 19:00 local
    expect(isOpenAt(all7, new Date("2026-10-23T15:00:00Z"), TZ)).toBe(false); // 12:00 local
  });
  it("janela que passa da meia-noite", () => {
    const h = [{ weekday: 5, opensAt: "18:00", closesAt: "01:00" }];
    expect(isOpenAt(h, new Date("2026-10-24T03:30:00Z"), TZ)).toBe(true); // sábado 00:30 local
    expect(isOpenAt(h, new Date("2026-10-24T04:30:00Z"), TZ)).toBe(false); // sábado 01:30
  });
  it("próxima abertura", () => {
    expect(nextOpening(all7, new Date("2026-10-23T15:00:00Z"), TZ)).toBe("hoje às 17:30");
  });
});

describe("status do pedido", () => {
  it("fluxo de entrega", () => {
    expect(canTransition("CONFIRMED", "IN_OVEN", "KITCHEN", "DELIVERY")).toBe(true);
    expect(canTransition("READY", "OUT_FOR_DELIVERY", "ATTENDANT", "DELIVERY")).toBe(true);
    expect(canTransition("READY", "DELIVERED", "ATTENDANT", "DELIVERY")).toBe(false);
    expect(canTransition("READY", "DELIVERED", "ATTENDANT", "PICKUP")).toBe(true);
  });
  it("cozinha só mexe no forno; cancelar no forno é só gerente", () => {
    expect(canTransition("RECEIVED", "CONFIRMED", "KITCHEN", "DELIVERY")).toBe(false);
    expect(canTransition("IN_OVEN", "CANCELED", "ATTENDANT", "DELIVERY")).toBe(false);
    expect(canTransition("IN_OVEN", "CANCELED", "STORE_MANAGER", "DELIVERY")).toBe(true);
    expect(nextStatuses("AWAITING_PAYMENT", "ATTENDANT", "DELIVERY")).toEqual(["CANCELED"]);
  });
  it("transferência só antes do forno", () => {
    expect(canTransfer("CONFIRMED")).toBe(true);
    expect(canTransfer("IN_OVEN")).toBe(false);
  });
});

describe("dinheiro e validação", () => {
  it("formata e lê BRL", () => {
    expect(formatBRL(5550)).toBe("R$ 55,50");
    expect(parseBRL("R$ 1.234,56")).toBe(123456);
  });
  it("telefone brasileiro", () => {
    expect(phoneSchema.parse("(83) 99876-5432")).toBe("83998765432");
    expect(phoneSchema.parse("+55 83 99876-5432")).toBe("83998765432");
    expect(() => phoneSchema.parse("12345")).toThrow();
  });
  it("entrega exige endereço", () => {
    const base = { storeId: "s", fulfillment: "DELIVERY", items: [{ kind: "PRODUCT", productId: "p", qty: 1 }], customer: { name: "Ana", phone: "83998765432" }, paymentMethod: "PIX", idempotencyKey: "12345678" };
    expect(checkoutSchema.safeParse(base).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, fulfillment: "PICKUP" }).success).toBe(true);
  });
});

describe("comanda 80 mm", () => {
  it("cabe em 48 colunas e destaca remoções", () => {
    const t = renderTicket({
      brand: "D'Napoles", storeLabel: "Manaíra", number: "MAN-0007", createdAt: new Date("2026-10-23T22:00:00Z"), timeZone: TZ,
      fulfillment: "DELIVERY", customerName: "Ana", customerPhone: "83998765432",
      address: { street: "Avenida Monteiro da Franca", number: "500", neighborhood: "Manaíra", reference: "Perto da praça" },
      items: [{ qty: 1, name: "Pizza Grande 1/2 Calabresa + 1/2 Frango com Catupiry", totalCents: 6750, details: { size: "Grande", flavors: [{ name: "Calabresa", fraction: "1/2", removed: ["cebola"] }, { name: "Frango com Catupiry", fraction: "1/2", removed: [] }], crust: "Cheddar", addons: [] } }],
      subtotalCents: 6750, deliveryFeeCents: 400, discountCents: 0, totalCents: 7150, paymentLabel: "Dinheiro", paid: false, changeForCents: 10000,
    });
    for (const line of t.split("\n")) expect(line.length).toBeLessThanOrEqual(48);
    expect(t).toContain("** SEM CEBOLA **");
    expect(t).toContain("Borda: Cheddar");
    expect(t).toContain("levar R$ 28,50");
    expect(t).not.toMatch(/[áéíóúãç]/);
  });
});
