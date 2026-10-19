import { notFound } from "next/navigation";
import { getPublicOrder } from "@/server/publicOrder";
import { OrderTracker } from "@/components/cliente/OrderTracker";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const order = await getPublicOrder((await params).token);
  if (!order) notFound();
  return <OrderTracker initial={JSON.parse(JSON.stringify(order))} />;
}
