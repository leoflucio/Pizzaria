export type OrderStatus =
  | "AWAITING_PAYMENT" | "RECEIVED" | "CONFIRMED" | "IN_OVEN" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELED";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "Aguardando pagamento",
  RECEIVED: "Recebido",
  CONFIRMED: "Confirmado",
  IN_OVEN: "No forno",
  READY: "Pronto",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};

/** What the customer sees: READY is internal for delivery orders. */
export function customerStatusLabel(s: OrderStatus, fulfillment: "DELIVERY" | "PICKUP"): string {
  if (s === "READY") return fulfillment === "PICKUP" ? "Pronto para retirada" : "No forno";
  if (s === "DELIVERED" && fulfillment === "PICKUP") return "Retirado";
  return STATUS_LABEL[s];
}

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  AWAITING_PAYMENT: ["RECEIVED", "CANCELED"],
  RECEIVED: ["CONFIRMED", "CANCELED"],
  CONFIRMED: ["IN_OVEN", "CANCELED"],
  IN_OVEN: ["READY", "CANCELED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELED: [],
};

export type Actor = "NETWORK_ADMIN" | "STORE_MANAGER" | "ATTENDANT" | "KITCHEN" | "COURIER" | "SYSTEM";

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor, fulfillment: "DELIVERY" | "PICKUP"): boolean {
  if (!NEXT[from].includes(to)) return false;
  if (to === "OUT_FOR_DELIVERY" && fulfillment !== "DELIVERY") return false;
  if (from === "READY" && to === "DELIVERED" && fulfillment === "DELIVERY") return false;
  if (to === "CANCELED" && (from === "IN_OVEN" || from === "READY")) return actor === "NETWORK_ADMIN" || actor === "STORE_MANAGER";
  if (to === "RECEIVED") return actor === "SYSTEM" || actor === "NETWORK_ADMIN" || actor === "STORE_MANAGER";
  if (actor === "KITCHEN") return (from === "CONFIRMED" && to === "IN_OVEN") || (from === "IN_OVEN" && to === "READY");
  return true;
}

export function nextStatuses(from: OrderStatus, actor: Actor, fulfillment: "DELIVERY" | "PICKUP"): OrderStatus[] {
  return NEXT[from].filter((to) => canTransition(from, to, actor, fulfillment));
}

/** Transfer between stores only before the kitchen starts. */
export function canTransfer(s: OrderStatus): boolean {
  return s === "AWAITING_PAYMENT" || s === "RECEIVED" || s === "CONFIRMED";
}

export const ACTIVE_STATUSES: OrderStatus[] = ["AWAITING_PAYMENT", "RECEIVED", "CONFIRMED", "IN_OVEN", "READY", "OUT_FOR_DELIVERY"];
