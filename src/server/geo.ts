import { env } from "./env";
import type { LatLng } from "@/domain/geo";

/** Geocoder behind an interface so it can be swapped (Google, Mapbox) without touching routing. */
export interface GeoProvider {
  geocode(address: { street: string; number: string; neighborhood: string; city: string; state: string }): Promise<LatLng | null>;
}

const none: GeoProvider = { geocode: async () => null };

const nominatim: GeoProvider = {
  async geocode(a) {
    const q = `${a.street}, ${a.number}, ${a.neighborhood}, ${a.city} - ${a.state}, Brasil`;
    try {
      const res = await fetch(`${env.NOMINATIM_URL}/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
        headers: { "User-Agent": "dnapoles-pedidos/1.0" },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;
      const [hit] = (await res.json()) as { lat: string; lon: string }[];
      return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
    } catch {
      return null;
    }
  },
};

export const geo: GeoProvider = env.GEOCODER === "nominatim" ? nominatim : none;
