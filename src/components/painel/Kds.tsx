"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { OrderStatus, Role } from "@prisma/client";
import type { StaffOrder } from "@/server/staffOrders";
import { setOrderStatus } from "@/app/painel/actions";
import { beep, useStoreOrders } from "./useStoreOrders";
import { itemLines, minutesSince, time } from "./format";

const LANES: { status: OrderStatus; title: string; next: OrderStatus; action: string }[] = [
  { status: "CONFIRMED", title: "A fazer", next: "IN_OVEN", action: "Pôr no forno" },
  { status: "IN_OVEN", title: "No forno", next: "READY", action: "Pronto" },
];

export function Kds({ store, role, initialOrders }: { store: { id: string; label: string }; role: Role; initialOrders: StaffOrder[] }) {
  const [sound, setSound] = useState(false);
  const { orders, connected, refresh } = useStoreOrders(store.id, initialOrders);
  const [pending, start] = useTransition();
  const [undo, setUndo] = useState<{ id: string; number: string; from: OrderStatus } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, tick] = useState(0);
  const seen = useRef(new Set(initialOrders.filter((o) => o.status === "CONFIRMED").map((o) => o.id)));

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  // Beep when a new order reaches the kitchen.
  useEffect(() => {
    const fresh = orders.filter((o) => o.status === "CONFIRMED" && !seen.current.has(o.id));
    fresh.forEach((o) => seen.current.add(o.id));
    if (fresh.length && sound) beep();
  }, [orders, sound]);

  const advance = (o: StaffOrder, to: OrderStatus) =>
    start(async () => {
      const r = await setOrderStatus(o.id, to);
      if (r.ok) {
        setUndo({ id: o.id, number: o.number, from: o.status });
        if (undoTimer.current) clearTimeout(undoTimer.current);
        undoTimer.current = setTimeout(() => setUndo(null), 10_000);
      }
      await refresh();
    });

  const ready = orders.filter((o) => o.status === "READY");

  return (
    <main className="min-h-[calc(100dvh-52px)] bg-stone-950 p-4 text-white">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold">Cozinha · {store.label}</h1>
        <span className={`chip ${connected ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"}`}>{connected ? "Ao vivo" : "Reconectando…"}</span>
        <span className="text-stone-400">{time(new Date())}</span>
        <button className={`ml-auto rounded-xl px-5 py-3 text-lg font-bold ${sound ? "bg-stone-800" : "animate-pulse bg-brand"}`} onClick={() => { setSound(!sound); if (!sound) beep(); }}>
          {sound ? "🔔 Som ligado" : "🔕 Ativar som"}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {LANES.map((lane) => {
          const list = orders.filter((o) => o.status === lane.status).sort((a, b) => +new Date(a.confirmedAt ?? a.createdAt) - +new Date(b.confirmedAt ?? b.createdAt));
          return (
            <section key={lane.status}>
              <h2 className="mb-3 text-xl font-bold text-stone-300">{lane.title} ({list.length})</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {list.map((o) => {
                  const wait = minutesSince(o.confirmedAt ?? o.createdAt);
                  const late = o.promisedAt && new Date(o.promisedAt).getTime() - Date.now() < 15 * 60_000;
                  return (
                    <article key={o.id} className={`flex flex-col rounded-2xl p-4 ${late ? "bg-red-950 ring-2 ring-red-500" : wait > 20 ? "bg-amber-950 ring-2 ring-amber-500" : "bg-stone-800"}`}>
                      <header className="mb-2 flex items-baseline justify-between">
                        <span className="text-3xl font-black">{o.number.split("-")[1]}</span>
                        <span className="text-lg">{wait} min · {o.fulfillment === "DELIVERY" ? "🛵" : "🏪"}</span>
                      </header>
                      <ul className="mb-3 flex-1 space-y-2 text-lg">
                        {o.items.map((i) => (
                          <li key={i.id}>
                            <p className="font-bold">{i.qty}x {i.name.replace(/^Pizza /, "")}</p>
                            {itemLines(i.details).map((l, k) => <p key={k} className={l.alert ? "rounded bg-red-600 px-2 font-black uppercase" : "pl-2 text-stone-300"}>{l.text}</p>)}
                            {i.notes && <p className="rounded bg-amber-500 px-2 font-bold text-black">{i.notes}</p>}
                          </li>
                        ))}
                      </ul>
                      {o.notes && <p className="mb-3 rounded bg-amber-500 px-2 py-1 font-bold text-black">{o.notes}</p>}
                      <button className="min-h-16 rounded-2xl bg-white text-2xl font-black text-stone-900 active:scale-[.98] disabled:opacity-50" disabled={pending} onClick={() => advance(o, lane.next)}>
                        {lane.action}
                      </button>
                    </article>
                  );
                })}
                {list.length === 0 && <p className="text-stone-500">Nada aqui.</p>}
              </div>
            </section>
          );
        })}
      </div>

      {ready.length > 0 && (
        <p className="mt-6 text-lg text-stone-300">Prontos aguardando saída: {ready.map((o) => o.number.split("-")[1]).join(", ")}</p>
      )}

      {undo && role !== "COURIER" && (
        <div className="fixed inset-x-0 bottom-4 mx-auto flex w-fit items-center gap-4 rounded-2xl bg-white px-5 py-3 text-lg text-stone-900 shadow-2xl">
          Pedido {undo.number} avançou.
          <button className="font-black text-brand" onClick={() => start(async () => { await fetch(`/api/staff/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: undo.id, to: undo.from }) }); setUndo(null); await refresh(); })}>
            Desfazer
          </button>
        </div>
      )}
    </main>
  );
}
