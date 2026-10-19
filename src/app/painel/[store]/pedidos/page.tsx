import { storeForPage } from "@/server/storeBySlug";
import { listStoreOrders } from "@/server/staffOrders";
import { isNetworkAdmin, roleInStore } from "@/server/auth";
import { prisma } from "@/server/db";
import { OrdersBoard } from "@/components/painel/OrdersBoard";

export const dynamic = "force-dynamic";

export default async function PedidosPage({ params }: { params: Promise<{ store: string }> }) {
  const { store, session } = await storeForPage((await params).store, ["NETWORK_ADMIN", "STORE_MANAGER", "ATTENDANT"]);
  const [orders, stores] = await Promise.all([listStoreOrders(store.id), prisma.store.findMany({ where: { active: true }, orderBy: { sort: "asc" }, select: { id: true, label: true } })]);
  return (
    <OrdersBoard
      store={{ id: store.id, label: store.label, slug: store.slug, isPaused: store.isPaused, pausedReason: store.pausedReason }}
      role={roleInStore(session, store.id)!}
      canTransfer={isNetworkAdmin(session)}
      otherStores={stores.filter((s) => s.id !== store.id)}
      initialOrders={JSON.parse(JSON.stringify(orders))}
    />
  );
}
