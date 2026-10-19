import Link from "next/link";
import { notFound } from "next/navigation";
import { isNetworkAdmin, requireStoreAccess } from "@/server/auth";
import { prisma } from "@/server/db";
import { listProviders } from "@/server/payments";
import { WEEKDAYS } from "@/domain/hours";
import { AdminPage, Check, Field, Flash, Save, Section } from "@/components/admin/ui";
import { saveHours, savePaymentAccount, savePrinter, saveStore } from "../../actions";

export const dynamic = "force-dynamic";

export default async function LojaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { id } = await params;
  const s = await requireStoreAccess(id, ["STORE_MANAGER"]);
  const admin = isNetworkAdmin(s);
  const store = await prisma.store.findUnique({ where: { id }, include: { hours: true, paymentAccount: true, printers: true } });
  if (!store) notFound();
  const acc = store.paymentAccount;
  return (
    <AdminPage title={store.name} back={{ href: "/painel/admin/lojas", label: "Lojas" }} actions={<Link className="btn-ghost py-2" href={`/painel/admin/lojas/${id}/areas`}>Áreas de entrega</Link>}>
      <Flash {...await searchParams} />

      <Section title="Dados da loja">
        <form action={saveStore} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="id" value={store.id} />
          <Field label="Nome (aparece como D'Napoles + nome)" name="label" defaultValue={store.label} required />
          <Field label="Telefone" name="phone" defaultValue={store.phone} />
          <Field label="Pizzas no forno ao mesmo tempo" name="kitchenCapacity" type="number" defaultValue={store.kitchenCapacity} hint="Usado no tempo estimado e no roteamento." />
          <Field label="Preparo base (min)" name="prepBaseMinutes" type="number" defaultValue={store.prepBaseMinutes} />
          <Field label="Retirada (min)" name="pickupMinutes" type="number" defaultValue={store.pickupMinutes} />
          {admin ? (
            <>
              <Field label="Código" name="code" defaultValue={store.code} required />
              <Field label="Link" name="slug" defaultValue={store.slug} required />
              <Field label="Ordem" name="sort" type="number" defaultValue={store.sort} />
              <Field label="Rua" name="street" defaultValue={store.street} required className="sm:col-span-2" />
              <Field label="Número" name="number" defaultValue={store.number} required />
              <Field label="Bairro" name="neighborhood" defaultValue={store.neighborhood} required />
              <Field label="Cidade" name="city" defaultValue={store.city} />
              <Field label="UF" name="state" defaultValue={store.state} />
              <Field label="Latitude" name="lat" type="number" step="any" defaultValue={store.lat} required />
              <Field label="Longitude" name="lng" type="number" step="any" defaultValue={store.lng} required hint={`Conferir no mapa: openstreetmap.org/?mlat=${store.lat}&mlon=${store.lng}`} />
              <div className="flex items-end"><Check label="Loja ativa" name="active" defaultChecked={store.active} /></div>
            </>
          ) : null}
          <div className="sm:col-span-3"><Save /></div>
        </form>
      </Section>

      <Section title="Horário de funcionamento" desc="Até três janelas por dia. Se fechar depois da meia-noite, use por exemplo 18:00 até 00:30. Deixe em branco para fechado.">
        <form action={saveHours} className="grid gap-2">
          <input type="hidden" name="storeId" value={store.id} />
          {WEEKDAYS.map((name, d) => {
            const rows = store.hours.filter((h) => h.weekday === d).sort((a, b) => a.opensAt.localeCompare(b.opensAt));
            return (
              <div key={d} className="flex flex-wrap items-center gap-2">
                <span className="w-20 font-medium capitalize">{name}</span>
                {[0, 1, 2].map((w) => (
                  <span key={w} className={`flex items-center gap-1 ${w > 0 && !rows[w] ? "opacity-60" : ""}`}>
                    <input className="input w-24 py-2" name={`o_${d}_${w}`} defaultValue={rows[w]?.opensAt ?? ""} placeholder="--:--" aria-label={`${name} abre`} />
                    <span>às</span>
                    <input className="input w-24 py-2" name={`c_${d}_${w}`} defaultValue={rows[w]?.closesAt ?? ""} placeholder="--:--" aria-label={`${name} fecha`} />
                  </span>
                ))}
              </div>
            );
          })}
          <div><Save label="Salvar horários" /></div>
        </form>
      </Section>

      <Section title="Conta de recebimento" desc="Cada loja recebe na sua própria conta. As credenciais ficam cifradas e nunca aparecem de volta aqui.">
        {admin ? (
          <form action={savePaymentAccount} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="storeId" value={store.id} />
            <label className="block">
              <span className="label">Gateway</span>
              <select name="provider" defaultValue={acc?.provider ?? "fake"} className="input py-2">
                {listProviders().map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <Field label="Titular" name="holderName" defaultValue={acc?.holderName ?? store.name} required />
            <Field label="CNPJ/CPF" name="document" defaultValue={acc?.document} />
            <Field label="Chave PIX" name="pixKey" defaultValue={acc?.pixKey} />
            <label className="block sm:col-span-2">
              <span className="label">Credenciais do gateway (JSON) {acc?.credentialsEnc ? "· já configuradas" : ""}</span>
              <textarea name="credentials" rows={2} className="input py-2 font-mono text-sm" placeholder={acc?.credentialsEnc ? "Deixe em branco para manter as atuais" : '{"accessToken": "..."}'} />
            </label>
            <div className="flex flex-wrap gap-4 sm:col-span-3">
              <Check label="Aceita PIX" name="acceptsPix" defaultChecked={acc?.acceptsPix ?? true} />
              <Check label="Aceita cartão na entrega" name="acceptsCard" defaultChecked={acc?.acceptsCard ?? true} />
              <Check label="Aceita dinheiro" name="acceptsCash" defaultChecked={acc?.acceptsCash ?? true} />
              {acc?.credentialsEnc && <Check label="Apagar credenciais" name="clearCredentials" />}
            </div>
            <div className="sm:col-span-3"><Save label="Salvar conta" /></div>
          </form>
        ) : (
          <p className="text-sm">Recebe em: <b>{acc?.holderName ?? "—"}</b> ({acc?.provider}). Só o dono da rede altera a conta.</p>
        )}
      </Section>

      <Section title="Impressoras" desc="Hoje a comanda sai pelo navegador (impressora térmica 80 mm instalada no computador do caixa). Impressão direta por rede fica para a próxima fase.">
        <div className="grid gap-3">
          {[...store.printers, null].map((p, i) => (
            <form key={p?.id ?? `new-${i}`} action={savePrinter} className="grid items-end gap-3 sm:grid-cols-6">
              <input type="hidden" name="storeId" value={store.id} />
              {p && <input type="hidden" name="id" value={p.id} />}
              <Field label={p ? "Nome" : "Nova impressora"} name="name" defaultValue={p?.name} className="sm:col-span-2" />
              <label className="block"><span className="label">Tipo</span>
                <select name="kind" defaultValue={p?.kind ?? "BROWSER"} className="input py-2"><option value="BROWSER">Navegador</option><option value="ESC_POS_NETWORK">Rede (ESC/POS)</option></select>
              </label>
              <Field label="IP" name="host" defaultValue={p?.host} />
              <Field label="Vias" name="copies" type="number" defaultValue={p?.copies ?? 1} />
              <div className="flex items-center gap-3"><Check label="Ativa" name="active" defaultChecked={p?.active ?? true} /><Save label={p ? "Salvar" : "Adicionar"} /></div>
            </form>
          ))}
        </div>
      </Section>
    </AdminPage>
  );
}
