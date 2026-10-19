import Link from "next/link";
import { requireSession, allowedStoreIds, isNetworkAdmin } from "@/server/auth";
import { prisma } from "@/server/db";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const allowed = allowedStoreIds(s);
  const stores = await prisma.store.findMany({ where: allowed === "ALL" ? { active: true } : { id: { in: allowed } }, orderBy: { sort: "asc" } });
  const admin = isNetworkAdmin(s);
  const manager = s.assignments.some((a) => a.role === "STORE_MANAGER");
  const kitchenOnly = s.assignments.every((a) => a.role === "KITCHEN");
  return (
    <div className="min-h-dvh bg-stone-100">
      <header className="bg-stone-900 text-white">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/painel" className="flex items-center gap-2 font-extrabold"><img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />D&apos;Napoles</Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {stores.map((st) => (
              <span key={st.id} className="flex items-center rounded-lg bg-white/10">
                {!kitchenOnly && <Link className="rounded-l-lg px-3 py-1.5 hover:bg-white/20" href={`/painel/${st.slug}/pedidos`}>{st.label}{st.isPaused ? " ⏸" : ""}</Link>}
                <Link className={`${kitchenOnly ? "rounded-lg" : "rounded-r-lg border-l border-white/10"} px-3 py-1.5 hover:bg-white/20`} href={`/painel/${st.slug}/cozinha`}>{kitchenOnly ? `Cozinha ${st.label}` : "KDS"}</Link>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {(admin || manager) && <Link className="rounded-lg px-3 py-1.5 hover:bg-white/10" href="/painel/admin">Configurações</Link>}
            <span className="hidden text-white/60 sm:inline">{s.name}</span>
            <form action={signOut}><button className="rounded-lg px-3 py-1.5 hover:bg-white/10">Sair</button></form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
