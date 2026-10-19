"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import { formatBRL } from "@/domain/money";
import type { PublicOrder } from "@/server/publicOrder";

type Order = PublicOrder;

const STEPS_DELIVERY = ["RECEIVED", "CONFIRMED", "IN_OVEN", "OUT_FOR_DELIVERY", "DELIVERED"];
const STEPS_PICKUP = ["RECEIVED", "CONFIRMED", "IN_OVEN", "READY", "DELIVERED"];
const STEP_LABEL: Record<string, string> = { RECEIVED: "Recebido", CONFIRMED: "Confirmado", IN_OVEN: "No forno", READY: "Pronto", OUT_FOR_DELIVERY: "Saiu para entrega", DELIVERED: "Entregue" };

export function OrderTracker({ initial }: { initial: Order }) {
  const [order, setOrder] = useState(initial);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = () => fetch(`/api/orders/${order.token}`).then((r) => r.json()).then(setOrder).catch(() => {});

  useEffect(() => {
    const es = new EventSource(`/api/orders/${order.token}/stream`);
    es.onmessage = () => refresh();
    const t = setInterval(refresh, 30_000); // fallback if the stream drops
    return () => { es.close(); clearInterval(t); };
  }, [order.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (order.payment?.pixCopyPaste && order.status === "AWAITING_PAYMENT") QRCode.toDataURL(order.payment.pixCopyPaste, { margin: 1, width: 240 }).then(setQr);
  }, [order.payment?.pixCopyPaste, order.status]);

  const steps = order.fulfillment === "DELIVERY" ? STEPS_DELIVERY : STEPS_PICKUP;
  const current = steps.indexOf(order.status === "READY" && order.fulfillment === "DELIVERY" ? "IN_OVEN" : order.status);
  const canceled = order.status === "CANCELED";
  const label = order.fulfillment === "PICKUP" ? { ...STEP_LABEL, DELIVERED: "Retirado", READY: "Pronto para retirada" } : STEP_LABEL;

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <Link href="/" className="text-sm font-semibold text-brand">← Fazer outro pedido</Link>
      <div className="mt-3 card p-5">
        <p className="text-sm text-stone-500">Pedido {order.number} · {order.store.name}</p>
        <h1 className="mt-1 text-2xl font-extrabold" aria-live="polite">{order.statusLabel}</h1>
        {order.promisedAt && !canceled && order.status !== "DELIVERED" && order.status !== "AWAITING_PAYMENT" && (
          <p className="text-stone-600">Previsão: {new Date(order.promisedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
        )}

        {order.status === "AWAITING_PAYMENT" && order.payment?.pixCopyPaste && (
          <div className="mt-4 rounded-2xl bg-brand-soft p-4 text-center">
            <p className="mb-3 font-semibold">Pague com PIX para enviarmos à cozinha</p>
            {qr && <img src={qr} alt="QR Code PIX" className="mx-auto mb-3 h-56 w-56 rounded-xl bg-white p-2" />}
            <button className="btn-ghost w-full" onClick={() => { navigator.clipboard.writeText(order.payment!.pixCopyPaste!).then(() => setCopied(true)); }}>
              {copied ? "Código copiado" : "Copiar código PIX"}
            </button>
            {order.payment.expiresAt && <p className="mt-2 text-xs text-stone-500">Expira às {new Date(order.payment.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
            {order.canSimulatePayment && (
              <button className="btn-primary mt-3 w-full" onClick={() => fetch(`/api/dev/pay/${order.token}`, { method: "POST" }).then(refresh)}>Simular pagamento (teste)</button>
            )}
          </div>
        )}

        {!canceled && order.status !== "AWAITING_PAYMENT" && (
          <ol className="mt-5 grid gap-3">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${i <= current ? "bg-brand text-white" : "bg-stone-200 text-stone-500"}`}>{i < current ? "✓" : i + 1}</span>
                <span className={i <= current ? "font-semibold" : "text-stone-500"}>{label[s]}</span>
              </li>
            ))}
          </ol>
        )}
        {canceled && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">Este pedido foi cancelado. Se tiver dúvidas, fale com a loja{order.store.phone ? ` pelo ${order.store.phone}` : ""}.</p>}
      </div>

      <section className="mt-4 card p-5 text-sm">
        <h2 className="mb-2 font-bold">Itens</h2>
        <ul className="grid gap-2">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-3"><span>{i.qty}x {i.name}</span><span className="whitespace-nowrap">{formatBRL(i.unitPriceCents * i.qty)}</span></li>
          ))}
        </ul>
        <div className="mt-3 border-t border-stone-100 pt-3">
          {order.deliveryFeeCents > 0 && <div className="flex justify-between"><span>Entrega</span><span>{formatBRL(order.deliveryFeeCents)}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatBRL(order.totalCents)}</span></div>
        </div>
        <p className="mt-3 text-stone-500">{order.fulfillment === "PICKUP" ? `Retirada em ${order.store.address}` : "Entrega no endereço informado"}</p>
      </section>
    </main>
  );
}
