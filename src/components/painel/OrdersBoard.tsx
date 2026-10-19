"use client";

import { useEffect, useState, useTransition } from "react";
import type { OrderStatus, Role } from "@prisma/client";
import { STATUS_LABEL, nextStatuses, canTransfer as canTransferStatus, type Actor } from "@/domain/status";
import type { StaffOrder } from "@/server/staffOrders";
import { setOrderStatus, togglePause, transfer } from "@/app/painel/actions";
import { beep, useStoreOrders } from "./useStoreOrders";
import { PAYMENT_LABEL, formatBRL, itemLines, minutesSince, time } from "./format";

interface Props {
  store: { id: string; label: string; slug: string; isPaused: boolean; pausedReason: string | null };
  role: Role;
  canTransfer: boolean;
  otherStores: { id: string; label: string }[];
  initialOrders: StaffOrder[];
}

const COLUMNS: { title: string; statuses: OrderStatus[] }[] = [
  { title: "Novos", statuses: ["AWAITING_PAYMENT", "RECEIVED"] },
  { title: "Em preparo", statuses: ["CONFIRMED", "IN_OVEN"] },
  { title: "Prontos e em entrega", statuses: ["READY", "OUT_FOR_DELIVERY"] },
];

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  RECEIVED: "Confirmar pagamento", CONFIRMED: "Confirmar", IN_OVEN: "Pôr no forno", READY: "Pronto", OUT_FOR_DELIVERY: "Saiu para entrega", DELIVERED: "Entregue",
};

export function OrdersBoard({ store, role, canTransfer, otherStores, initialOrders }: Props) {
  const [sound, setSound] = useState(false);
  const { orders, store: live, connected, refresh } = useStoreOrders(store.id, initialOrders, () => sound && beep());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const paused = live?.isPaused ?? store.isPaused;
  const [, tick] = useState(0);

  // Keep ringing every 15 s while there are unconfirmed orders.
  const waiting = orders.filter((o) => o.status === "RECEIVED").length;
  useEffect(() => {
    if (!sound || waiting === 0) return;
    const t = setInterval(beep, 15_000);
    return () => clearInterval(t);
  }, [sound, waiting]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Erro");
      await refresh();
    });

  const act = (o: StaffOrder, to: OrderStatus) => {
    if (to === "CANCELED") {
      const reason = prompt(`Motivo do cancelamento do pedido ${o.number}:`);
      if (reason === null) return;
      return run(() => setOrderStatus(o.id, to, reason));
    }
    run(() => setOrderStatus(o.id, to));
    if (to === "CONFIRMED") window.open(`/comanda/${o.id}?print=1`, "_blank", "width=420,height=700");
  };

  const active = orders.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELED");
  const done = orders.filter((o) => o.status === "DELIVERED" || o.status === "CANCELED").reverse();

  return (
    <main className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold">Pedidos · {store.label}</h1>
        <span className={`chip ${connected ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{connected ? "Ao vivo" : "Reconectando…"}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className={sound ? "btn-ghost" : "btn-primary animate-pulse"} onClick={() => { setSound(!sound); if (!sound) beep(); }}>
            {sound ? "🔔 Som ligado" : "🔕 Ativar som de novos pedidos"}
          </button>
          {role !== "KITCHEN" && (
            <button
              className={paused ? "btn-primary bg-green-700 hover:bg-green-800" : "btn-ghost text-red-700"}
              disabled={pending}
              onClick={() => {
                if (paused) return run(() => togglePause(store.id, false));
                const reason = prompt("Pausar pedidos desta loja. Motivo (opcional, aparece para o cliente):");
                if (reason !== null) run(() => togglePause(store.id, true, reason));
              }}
            >
              {paused ? "▶ Retomar pedidos" : "⏸ Pausar pedidos"}
            </button>
          )}
        </div>
      </div>
      {paused && <p className="mb-4 rounded-xl bg-amber-100 p-3 font-semibold text-amber-900">Loja pausada. Os clientes estão sendo direcionados para outra unidade que entrega no endereço.</p>}
      {error && <p className="mb-4 rounded-xl bg-red-100 p-3 text-red-800" role="alert">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = active.filter((o) => col.statuses.includes(o.status));
          return (
            <section key={col.title} className="rounded-2xl bg-stone-200/60 p-3">
              <h2 className="mb-3 flex items-center justify-between font-bold">{col.title}<span className="chip bg-white">{list.length}</span></h2>
              <div className="grid gap-3">
                {list.map((o) => (
                  <OrderCard key={o.id} o={o} role={role} pending={pending} onAct={act}
                    transferTargets={canTransfer && canTransferStatus(o.status) ? otherStores : []}
                    onTransfer={(to) => { if (confirm(`Transferir o pedido ${o.number} para ${otherStores.find((s) => s.id === to)?.label}?`)) run(() => transfer(o.id, to)); }} />
                ))}
                {list.length === 0 && <p className="py-6 text-center text-sm text-stone-500">Nenhum pedido</p>}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-6">
        <button className="font-semibold text-stone-700" onClick={() => setShowDone(!showDone)}>{showDone ? "▾" : "▸"} Finalizados hoje ({done.length})</button>
        {showDone && (
          <ul className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {done.map((o) => (
              <li key={o.id} className="card flex items-center justify-between p-3 text-sm">
                <span><b>{o.number}</b> · {o.customerName} · {time(o.createdAt)}</span>
                <span className={o.status === "CANCELED" ? "text-red-700" : "text-green-700"}>{STATUS_LABEL[o.status]} · {formatBRL(o.totalCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function OrderCard({ o, role, pending, onAct, transferTargets, onTransfer }: {
  o: StaffOrder; role: Role; pending: boolean; onAct: (o: StaffOrder, to: OrderStatus) => void;
  transferTargets: { id: string; label: string }[]; onTransfer: (to: string) => void;
}) {
  const next = nextStatuses(o.status, role as Actor, o.fulfillment);
  const paid = o.payments.some((p) => p.status === "PAID");
  const addr = o.address as { street: string; number: string; neighborhood: string; complement?: string; reference?: string } | null;
  const late = o.promisedAt && new Date(o.promisedAt).getTime() < Date.now();
  const transferred = o.events.find((e) => e.type === "TRANSFERRED");
  return (
    <article className={`card p-4 ${o.status === "RECEIVED" ? "ring-2 ring-brand" : ""}`}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-extrabold">{o.number}</p>
          <p className="text-xs text-stone-500">{time(o.createdAt)} · há {minutesSince(o.createdAt)} min · {o.channel === "APP" ? "App" : o.channel}</p>
        </div>
        <div className="text-right">
          <span className={`chip ${o.fulfillment === "DELIVERY" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}`}>{o.fulfillment === "DELIVERY" ? "Entrega" : "Retirada"}</span>
          <p className="mt-1 text-xs font-semibold">{STATUS_LABEL[o.status]}</p>
          {late && <p className="text-xs font-bold text-red-700">Atrasado</p>}
        </div>
      </header>
      {transferred && <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">Transferido de outra loja</p>}
      <p className="text-sm font-semibold">{o.customerName} · <a className="text-blue-700" href={`https://wa.me/55${o.customerPhone}`} target="_blank" rel="noreferrer">{o.customerPhone}</a></p>
      {addr && <p className="text-sm text-stone-600">{addr.street}, {addr.number}{addr.complement ? ` - ${addr.complement}` : ""} · {addr.neighborhood}{addr.reference ? ` (${addr.reference})` : ""}</p>}
      <ul className="my-3 grid gap-1 border-y border-stone-100 py-2 text-sm">
        {o.items.map((i) => (
          <li key={i.id}>
            <p className="font-semibold">{i.qty}x {i.name}</p>
            {itemLines(i.details).map((l, k) => <p key={k} className={l.alert ? "font-bold text-red-700" : "text-stone-600"}>{l.text}</p>)}
            {i.notes && <p className="text-amber-800">Obs: {i.notes}</p>}
          </li>
        ))}
      </ul>
      {o.notes && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Obs: {o.notes}</p>}
      <p className="mb-3 flex justify-between text-sm">
        <span>{PAYMENT_LABEL[o.paymentMethod]}{paid ? " · pago" : ""}{o.changeForCents ? ` · troco p/ ${formatBRL(o.changeForCents)}` : ""}</span>
        <b>{formatBRL(o.totalCents)}</b>
      </p>
      <div className="flex flex-wrap gap-2">
        {next.filter((s) => s !== "CANCELED").map((s) => (
          <button key={s} className="btn-primary flex-1 py-3" disabled={pending} onClick={() => onAct(o, s)}>{ACTION_LABEL[s] ?? STATUS_LABEL[s]}</button>
        ))}
        <a className="btn-ghost py-3" href={`/comanda/${o.id}?print=1`} target="_blank" rel="noreferrer" aria-label="Imprimir comanda">🖨</a>
        {next.includes("CANCELED") && <button className="btn-ghost py-3 text-red-700" disabled={pending} onClick={() => onAct(o, "CANCELED")}>Cancelar</button>}
      </div>
      {transferTargets.length > 0 && (
        <label className="mt-2 flex items-center gap-2 text-sm text-stone-600">
          Transferir para
          <select className="rounded-lg border border-stone-300 px-2 py-1" value="" onChange={(e) => e.target.value && onTransfer(e.target.value)}>
            <option value="">escolha a loja</option>
            {transferTargets.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      )}
    </article>
  );
}
