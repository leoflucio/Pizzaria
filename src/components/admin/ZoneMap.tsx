"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

interface ZoneShape { id: string; name: string; kind: string; radiusMeters: number | null; polygon: [number, number][] | null; active: boolean }

// Leaflet is bundled (no CDN) and loaded only in the browser.
async function loadLeaflet(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const L = await import("leaflet");
  return L.default ?? L;
}

/**
 * Map of a store's zones. "Desenhar área" lets the manager click points; the
 * resulting ring is written into the textarea with id `targetId` (new zone form).
 */
export function ZoneMap({ store, zones, targetId }: { store: { lat: number; lng: number; name: string }; zones: ZoneShape[]; targetId: string }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const drawRef = useRef<{ points: [number, number][]; layer: any } | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [drawing, setDrawing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    loadLeaflet().then((L) => {
      if (disposed || !el.current || mapRef.current) return;
      const map = L.map(el.current).setView([store.lat, store.lng], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      L.circleMarker([store.lat, store.lng], { radius: 9, color: "#7f1d1d", fillColor: "#b91c1c", fillOpacity: 1 }).addTo(map).bindTooltip(store.name, { permanent: true, direction: "top" });
      for (const z of zones) {
        const style = { color: z.active ? "#b91c1c" : "#78716c", weight: 2, fillOpacity: 0.12 };
        if (z.kind === "RADIUS" && z.radiusMeters) L.circle([store.lat, store.lng], { radius: z.radiusMeters, ...style }).addTo(map).bindTooltip(z.name);
        if (z.kind === "POLYGON" && z.polygon) L.polygon(z.polygon.map(([lng, lat]) => [lat, lng]), style).addTo(map).bindTooltip(z.name);
      }
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const d = drawRef.current;
        if (!d) return;
        d.points.push([Number(e.latlng.lng.toFixed(6)), Number(e.latlng.lat.toFixed(6))]);
        if (d.layer) map.removeLayer(d.layer);
        d.layer = L.polygon(d.points.map(([lng, lat]) => [lat, lng]), { color: "#2563eb", weight: 2 }).addTo(map);
        const ta = document.getElementById(targetId) as HTMLTextAreaElement | null;
        if (ta) ta.value = JSON.stringify(d.points);
      });
      mapRef.current = map;
    }).catch(() => setFailed(true));
    return () => { disposed = true; };
  }, [store, zones, targetId]);

  const toggle = () => {
    const map = mapRef.current;
    if (drawing) {
      setDrawing(false);
      drawRef.current = null;
      return;
    }
    if (drawRef.current?.layer && map) map.removeLayer(drawRef.current.layer);
    drawRef.current = { points: [], layer: null };
    const kind = document.getElementById(`${targetId}-kind`) as HTMLSelectElement | null;
    if (kind) kind.value = "POLYGON";
    setDrawing(true);
  };

  if (failed) return <p className="text-sm text-stone-500">Não foi possível carregar o mapa. As áreas continuam editáveis pelos campos abaixo.</p>;
  return (
    <div>
      <div ref={el} className="h-80 w-full overflow-hidden rounded-xl bg-stone-100" />
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className={drawing ? "btn-primary py-2" : "btn-ghost py-2"} onClick={toggle}>{drawing ? "Terminar desenho" : "Desenhar nova área no mapa"}</button>
        {drawing && <span className="text-stone-600">Clique no mapa para marcar os cantos da área. Depois preencha a taxa abaixo e salve.</span>}
      </div>
    </div>
  );
}
