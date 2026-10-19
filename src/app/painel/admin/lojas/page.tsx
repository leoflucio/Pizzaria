import Link from "next/link";
import { allowedStoreIds, isNetworkAdmin, requireSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { AdminPage, Field, Flash, Save, Section } from "@/components/admin/ui";
import { saveStore } from "../actions";

export const dynamic = "force-dynamic";

export default async function LojasPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await requireSession();
  const allowed = allowedStoreIds(s, ["STORE_MANAGER"]);
  const stores = await prisma.store.findMany({ where: allowed === "ALL" ? {} : { id: { in: allowed } }, orderBy: { sort: "asc" }, include: { _count: { select: { zones: true } }, paymentAccount: true } });
  return (
    <AdminPage title="Lojas" back={{ href: "/painel/admin", label: "Configurações" }}>
      <Flash {...await searchParams} />
      <ul className="mb-6 grid gap-3">
        {stores.map((st) => (
          <li key={st.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="flex-1">
              <p className="font-bold">{st.name} {!st.active && <span className="chip bg-stone-200">inativa</span>} {st.isPaused && <span className="chip bg-amber-100 text-amber-800">pausada</span>}</p>
              <p className="text-sm text-stone-500">{st.street}, {st.number} - {st.neighborhood} · {st._count.zones} áreas de entrega · recebe em {st.paymentAccount?.holderName ?? "—"}</p>
            </div>
            <Link className="btn-ghost py-2" href={`/painel/admin/lojas/${st.id}`}>Editar loja</Link>
            <Link className="btn-ghost py-2" href={`/painel/admin/lojas/${st.id}/areas`}>Áreas de entrega</Link>
          </li>
        ))}
      </ul>
      {isNetworkAdmin(s) && (
        <Section title="Abrir nova loja" desc="A nova unidade já nasce aberta todos os dias de 17:30 às 23:30; depois ajuste horários, áreas e conta.">
          <form action={saveStore} className="grid gap-3 sm:grid-cols-3">
            <Field label="Nome (bairro)" name="label" required placeholder="Ex.: Tambaú" />
            <Field label="Código" name="code" required placeholder="TAMBAU" />
            <Field label="Link" name="slug" required placeholder="tambau" />
            <Field label="Rua" name="street" required className="sm:col-span-2" />
            <Field label="Número" name="number" required />
            <Field label="Bairro" name="neighborhood" required />
            <Field label="Cidade" name="city" defaultValue="João Pessoa" />
            <Field label="UF" name="state" defaultValue="PB" />
            <Field label="Latitude" name="lat" required step="any" type="number" hint="Clique com o botão direito no Google Maps e copie." />
            <Field label="Longitude" name="lng" required step="any" type="number" />
            <Field label="Telefone" name="phone" />
            <input type="hidden" name="active" value="on" />
            <div className="sm:col-span-3"><Save label="Criar loja" /></div>
          </form>
        </Section>
      )}
    </AdminPage>
  );
}
