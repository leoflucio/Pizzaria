import { storeForPage } from "@/server/storeBySlug";
import { listStoreOrders } from "@/server/staffOrders";
import { roleInStore } from "@/server/auth";
import { Kds } from "@/components/painel/Kds";

export const dynamic = "force-dynamic";

export default async function CozinhaPage({ params }: { params: Promise<{ store: string }> }) {
  const { store, session } = await storeForPage((await params).store);
  const orders = await listStoreOrders(store.id);
  return <Kds store={{ id: store.id, label: store.label }} role={roleInStore(session, store.id)!} initialOrders={JSON.parse(JSON.stringify(orders))} />;
}
