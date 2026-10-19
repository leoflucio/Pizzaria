import Link from "next/link";
import { allowedStoreIds, isNetworkAdmin, requireSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { AdminPage } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const s = await requireSession();
  const admin = isNetworkAdmin(s);
  const allowed = allowedStoreIds(s, ["STORE_MANAGER"]);
  const stores = await prisma.store.findMany({ where: allowed === "ALL" ? {} : { id: { in: allowed } }, orderBy: { sort: "asc" } });
  const Card = ({ href, title, desc }: { href: string; title: string; desc: string }) => (
    <Link href={href} className="card block p-5 hover:ring-brand">
      <h2 className="font-bold">{title}</h2>
      <p className="text-sm text-stone-500">{desc}</p>
    </Link>
  );
  return (
    <AdminPage title="Configurações">
      <div className="grid gap-4 sm:grid-cols-2">
        {admin && <Card href="/painel/admin/cardapio" title="Cardápio da rede" desc="Tamanhos, faixas de preço, sabores, bordas, adicionais, bebidas, combos e regra da meio a meio." />}
        <Card href="/painel/admin/lojas" title="Lojas" desc="Endereço, horários, conta de recebimento, impressoras e áreas de entrega." />
        <Card href="/painel/admin/equipe" title="Equipe" desc="Usuários, papéis e acesso por loja." />
        {stores.map((st) => (
          <Card key={st.id} href={`/painel/admin/ajustes/${st.id}`} title={`Ajustes da loja ${st.label}`} desc="Preço diferente, esgotado ou item exclusivo nesta loja." />
        ))}
      </div>
    </AdminPage>
  );
}
