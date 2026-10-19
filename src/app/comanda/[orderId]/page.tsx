import { notFound } from "next/navigation";
import { canAccessStore, requireSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { getNetwork } from "@/server/catalog";
import { renderTicket } from "@/domain/ticket";
import { PrintOnLoad } from "@/components/painel/PrintOnLoad";

export const dynamic = "force-dynamic";

const PAY: Record<string, string> = { PIX: "PIX", CARD_ON_DELIVERY: "Cartao", CASH: "Dinheiro" };

export default async function ComandaPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ print?: string }> }) {
  const s = await requireSession();
  const order = await prisma.order.findUnique({ where: { id: (await params).orderId }, include: { items: true, store: true, payments: true } });
  if (!order || !canAccessStore(s, order.storeId)) notFound();
  const network = await getNetwork();
  const text = renderTicket({
    brand: network.name, storeLabel: order.store.label, number: order.number, createdAt: order.createdAt, timeZone: network.timezone,
    fulfillment: order.fulfillment, customerName: order.customerName, customerPhone: order.customerPhone,
    address: order.address as never, items: order.items.map((i) => ({ qty: i.qty, name: i.name, totalCents: i.unitPriceCents * i.qty, details: i.details as Record<string, unknown>, notes: i.notes })),
    subtotalCents: order.subtotalCents, deliveryFeeCents: order.deliveryFeeCents, discountCents: order.discountCents, totalCents: order.totalCents,
    paymentLabel: PAY[order.paymentMethod]!, paid: order.payments.some((p) => p.status === "PAID"), changeForCents: order.changeForCents, notes: order.notes,
  });
  await prisma.orderEvent.create({ data: { orderId: order.id, type: "PRINTED", actorUserId: s.userId } });
  return (
    <>
      <style>{`@page { size: 80mm auto; margin: 0 } body { background: #fff } @media print { .noprint { display: none } }`}</style>
      <div className="noprint flex gap-2 p-3">
        <PrintOnLoad auto={(await searchParams).print === "1"} />
      </div>
      <pre style={{ width: "80mm", padding: "2mm 3mm", fontFamily: "'Courier New', monospace", fontSize: "11.5px", lineHeight: 1.25, whiteSpace: "pre", margin: 0, color: "#000" }}>{text}</pre>
    </>
  );
}
