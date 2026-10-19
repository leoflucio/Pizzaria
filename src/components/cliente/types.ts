import type { ResolvedCatalog } from "@/domain/catalog";
import type { CartItemInput } from "@/domain/checkout";
import type { MixedPricingRule } from "@/domain/pricing";

export interface PublicStore {
  id: string; code: string; name: string; label: string; slug: string; address: string; neighborhood: string;
  phone: string | null; lat: number; lng: number; isOpen: boolean; isPaused: boolean; pausedReason: string | null;
  nextOpening: string | null; pickupMinutes: number; accepts: { pix: boolean; card: boolean; cash: boolean };
}

export interface Candidate {
  storeId: string; storeName: string; zoneId: string; zoneName: string; feeCents: number; minOrderCents: number;
  etaMinutes: number; available: boolean; reason?: "PAUSED" | "CLOSED";
}

export interface Address { street: string; number: string; neighborhood: string; complement?: string; reference?: string }

export interface Destination {
  fulfillment: "DELIVERY" | "PICKUP";
  storeId: string;
  address?: Address;
  feeCents: number;
  minOrderCents: number;
  etaMinutes: number;
  alternatives: Candidate[];
}

export interface CartEntry { key: string; item: CartItemInput; name: string; unitPriceCents: number; summary: string[] }

export interface CatalogPayload { mixedPricingRule: MixedPricingRule; catalog: ResolvedCatalog }
