"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StaffOrder } from "@/server/staffOrders";

/** Live list of a store's orders: SSE triggers a refetch; polling every 20 s is the safety net. */
export function useStoreOrders(storeId: string, initial: StaffOrder[], onNewOrder?: () => void) {
  const [orders, setOrders] = useState(initial);
  const [store, setStore] = useState<{ isPaused: boolean; pausedReason: string | null } | null>(null);
  const [connected, setConnected] = useState(true);
  const known = useRef(new Set(initial.map((o) => o.id)));
  const cb = useRef(onNewOrder);
  cb.current = onNewOrder;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff/orders?storeId=${storeId}`, { cache: "no-store" });
      if (res.status === 403) return void (location.href = "/login");
      const data = (await res.json()) as { orders: StaffOrder[]; store: { isPaused: boolean; pausedReason: string | null } };
      const fresh = data.orders.filter((o) => !known.current.has(o.id) && o.status === "RECEIVED");
      data.orders.forEach((o) => known.current.add(o.id));
      setOrders(data.orders);
      setStore(data.store);
      if (fresh.length) cb.current?.();
    } catch {}
  }, [storeId]);

  useEffect(() => {
    const es = new EventSource(`/api/staff/stream?storeId=${storeId}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = () => refresh();
    const t = setInterval(refresh, 20_000);
    return () => { es.close(); clearInterval(t); };
  }, [storeId, refresh]);

  return { orders, store, connected, refresh };
}

/** Short two-tone beep with Web Audio (no audio file needed). Needs one user click to unlock audio. */
export function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.start(t);
      o.stop(t + 0.23);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {}
}
