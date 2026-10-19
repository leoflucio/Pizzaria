import { redirect } from "next/navigation";
import { allowedStoreIds, requireSession } from "@/server/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function PainelHome({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const s = await requireSession();
  const { erro } = await searchParams;
  const allowed = allowedStoreIds(s);
  const first = await prisma.store.findFirst({ where: allowed === "ALL" ? { active: true } : { id: { in: allowed } }, orderBy: { sort: "asc" } });
  if (erro) return <p className="p-8 text-center text-red-700">Você não tem acesso a essa página.</p>;
  if (!first) return <p className="p-8 text-center">Nenhuma loja vinculada ao seu usuário.</p>;
  const kitchenOnly = s.assignments.every((a) => a.role === "KITCHEN");
  redirect(`/painel/${first.slug}/${kitchenOnly ? "cozinha" : "pedidos"}`);
}
