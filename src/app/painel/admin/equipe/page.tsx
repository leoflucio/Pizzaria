import { allowedStoreIds, isNetworkAdmin, requireSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { AdminPage, Check, Field, Flash, Save, Section } from "@/components/admin/ui";
import { saveUser } from "../actions";

export const dynamic = "force-dynamic";

const ROLE: Record<string, string> = { NETWORK_ADMIN: "Dono / gestor da rede", STORE_MANAGER: "Gerente da loja", ATTENDANT: "Atendente", KITCHEN: "Cozinha", COURIER: "Entregador" };

export default async function EquipePage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await requireSession();
  const admin = isNetworkAdmin(s);
  const allowed = allowedStoreIds(s, ["STORE_MANAGER"]);
  if (!admin && allowed !== "ALL" && allowed.length === 0) return <p className="p-8 text-center">Sem acesso.</p>;
  const stores = await prisma.store.findMany({ where: allowed === "ALL" ? {} : { id: { in: allowed } }, orderBy: { sort: "asc" } });
  const users = await prisma.user.findMany({
    where: admin ? {} : { assignments: { some: { storeId: { in: stores.map((x) => x.id) } } } },
    include: { assignments: { include: { store: true } } },
    orderBy: { name: "asc" },
  });
  const roles = admin ? Object.keys(ROLE) : ["ATTENDANT", "KITCHEN", "COURIER"];

  const RoleFields = ({ role, storeId }: { role?: string; storeId?: string | null }) => (
    <>
      <label className="block"><span className="label">Papel</span>
        <select name="role" defaultValue={role ?? "ATTENDANT"} className="input py-2">{roles.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</select>
      </label>
      <label className="block"><span className="label">Loja</span>
        <select name="storeId" defaultValue={storeId ?? stores[0]?.id} className="input py-2"><option value="">Todas (só dono)</option>{stores.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}</select>
      </label>
    </>
  );

  return (
    <AdminPage title="Equipe" back={{ href: "/painel/admin", label: "Configurações" }}>
      <Flash {...await searchParams} />
      <Section title="Novo usuário" desc="Cada pessoa só vê os pedidos da loja dela. A cozinha pode usar um login compartilhado no tablet.">
        <form action={saveUser} className="grid gap-3 sm:grid-cols-3">
          <Field label="Nome" name="name" required />
          <Field label="E-mail" name="email" type="email" required />
          <Field label="Senha inicial" name="password" type="password" required hint="Mínimo de 8 caracteres." />
          <RoleFields />
          <div className="flex items-end"><Save label="Criar usuário" /></div>
        </form>
      </Section>
      <div className="grid gap-2">
        {users.map((u) => {
          const a = u.assignments[0];
          return (
            <details key={u.id} className="card p-4">
              <summary className="cursor-pointer">
                <b>{u.name}</b> <span className="text-sm text-stone-500">· {u.email} · {u.assignments.map((x) => `${ROLE[x.role]}${x.store ? ` (${x.store.label})` : ""}`).join(", ")}{!u.active ? " · desativado" : ""}</span>
              </summary>
              <form action={saveUser} className="mt-3 grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="updateRole" value="1" />
                <Field label="Nome" name="name" defaultValue={u.name} required />
                <Field label="E-mail" name="email" type="email" defaultValue={u.email} required />
                <Field label="Nova senha" name="password" type="password" hint="Em branco mantém a atual." />
                <RoleFields role={a?.role} storeId={a?.storeId} />
                <div className="flex items-end gap-4"><Check label="Ativo" name="active" defaultChecked={u.active} /><Save /></div>
              </form>
            </details>
          );
        })}
      </div>
    </AdminPage>
  );
}
