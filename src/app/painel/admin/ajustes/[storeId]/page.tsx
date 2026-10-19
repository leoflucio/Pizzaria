import Link from "next/link";
import { notFound } from "next/navigation";
import type { OverrideTarget } from "@prisma/client";
import { isNetworkAdmin, requireStoreAccess } from "@/server/auth";
import { prisma } from "@/server/db";
import { AdminPage, Flash, formatBRL, reais } from "@/components/admin/ui";
import { saveOverrides } from "../../actions";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "sabores", label: "Sabores" },
  { id: "precos", label: "Preço das pizzas" },
  { id: "produtos", label: "Produtos" },
  { id: "combos", label: "Combos" },
  { id: "extras", label: "Bordas e adicionais" },
] as const;

export default async function AjustesPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ ok?: string; erro?: string; tab?: string }> }) {
  const { storeId } = await params;
  const sp = await searchParams;
  const s = await requireStoreAccess(storeId, ["STORE_MANAGER"]);
  const admin = isNetworkAdmin(s);
  const tab = (TABS.find((t) => t.id === sp.tab)?.id ?? "sabores") as (typeof TABS)[number]["id"];
  const [store, overrides, sizes, tiers, flavors, products, combos, crusts, addons] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    prisma.storeCatalogOverride.findMany({ where: { storeId } }),
    prisma.pizzaSize.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    prisma.flavorTier.findMany({ orderBy: { sort: "asc" }, include: { prices: true } }),
    prisma.flavor.findMany({ where: { active: true }, orderBy: [{ sort: "asc" }, { name: "asc" }] }),
    prisma.product.findMany({ where: { active: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }], include: { category: true } }),
    prisma.combo.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    prisma.crust.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    prisma.addon.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
  ]);
  if (!store) notFound();
  const others = await prisma.store.findMany({ where: { id: { not: storeId } }, select: { id: true, label: true } });
  const exclusiveElsewhere = new Set((await prisma.storeCatalogOverride.findMany({ where: { storeId: { not: storeId }, exclusive: true } })).map((o) => `${o.targetType}:${o.targetId}`));
  const ov = (t: OverrideTarget, id: string, sizeId = "") => overrides.find((o) => o.targetType === t && o.targetId === id && o.sizeId === sizeId);

  /** One editable row: availability, price override and (owner only) exclusivity. */
  const Row = ({ t, id, name, base, sizeId = "", showPrice = true, showAvail = true }: { t: OverrideTarget; id: string; name: string; base?: number | null; sizeId?: string; showPrice?: boolean; showAvail?: boolean }) => {
    const o = ov(t, id, sizeId);
    const k = `o_${t}_${id}_${sizeId || "all"}`;
    const hiddenHere = exclusiveElsewhere.has(`${t}:${id}`) && !o?.exclusive;
    return (
      <tr className={`border-t border-stone-100 ${hiddenHere ? "opacity-60" : ""}`}>
        <td className="p-2">
          <input type="hidden" name={`${k}_present`} value="1" />
          <span className="font-medium">{name}</span>
          {hiddenHere && <span className="block text-xs text-stone-500">Exclusivo de outra loja; marque "exclusivo" para vender aqui também.</span>}
        </td>
        {showPrice && <td className="p-2 text-sm text-stone-500">{base != null ? formatBRL(base) : "—"}</td>}
        {showPrice && <td className="p-1"><input className="input w-28 py-2" name={`${k}_price`} defaultValue={reais(o?.priceCents)} placeholder="igual à rede" aria-label={`Preço nesta loja: ${name}`} /></td>}
        {showAvail && <td className="p-2 text-center"><input type="checkbox" name={`${k}_available`} defaultChecked={o?.available ?? true} className="h-5 w-5" aria-label={`${name} disponível`} /></td>}
        <td className="p-2 text-center">{admin ? <input type="checkbox" name={`${k}_exclusive`} defaultChecked={o?.exclusive} className="h-5 w-5" aria-label={`${name} exclusivo`} /> : o?.exclusive ? "sim" : ""}</td>
      </tr>
    );
  };
  const Head = ({ price = true, avail = true }: { price?: boolean; avail?: boolean }) => (
    <thead className="text-left text-xs uppercase text-stone-500">
      <tr><th className="p-2">Item</th>{price && <th className="p-2">Rede</th>}{price && <th className="p-2">Preço nesta loja</th>}{avail && <th className="p-2 text-center">Disponível</th>}<th className="p-2 text-center">Exclusivo</th></tr>
    </thead>
  );

  return (
    <AdminPage title={`Ajustes da loja ${store.label}`} back={{ href: "/painel/admin", label: "Configurações" }}
      actions={others.length > 0 && <span className="flex gap-2 text-sm">{others.map((o) => <Link key={o.id} className="btn-ghost py-2" href={`/painel/admin/ajustes/${o.id}?tab=${tab}`}>{o.label}</Link>)}</span>}>
      <Flash ok={sp.ok} erro={sp.erro} />
      <p className="mb-4 text-sm text-stone-600">Deixe o preço em branco para usar o da rede. Desmarque &quot;Disponível&quot; quando acabar só nesta loja. &quot;Exclusivo&quot; faz o item aparecer só nas lojas marcadas.</p>
      <nav className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => <Link key={t.id} href={`?tab=${t.id}`} className={`chip px-4 py-2 text-sm ${tab === t.id ? "bg-brand text-white" : "bg-white ring-1 ring-stone-200"}`}>{t.label}</Link>)}
      </nav>
      <form action={saveOverrides} className="card overflow-x-auto p-4">
        <input type="hidden" name="storeId" value={storeId} />
        <input type="hidden" name="tab" value={tab} />
        {tab === "sabores" && (
          <table className="w-full"><Head price={false} /><tbody>{flavors.map((f) => <Row key={f.id} t="FLAVOR" id={f.id} name={f.name} showPrice={false} />)}</tbody></table>
        )}
        {tab === "precos" && (
          <table className="w-full"><Head avail={false} />
            <tbody>
              {tiers.flatMap((t) => sizes.map((sz) => <Row key={`${t.id}${sz.id}`} t="TIER_PRICE" id={t.id} sizeId={sz.id} name={`${t.name} · ${sz.name}`} base={t.prices.find((p) => p.sizeId === sz.id)?.priceCents} showAvail={false} />))}
            </tbody>
          </table>
        )}
        {tab === "produtos" && (
          <table className="w-full"><Head /><tbody>{products.map((p) => <Row key={p.id} t="PRODUCT" id={p.id} name={`${p.name} (${p.category.name})`} base={p.priceCents} />)}</tbody></table>
        )}
        {tab === "combos" && (
          <table className="w-full"><Head /><tbody>{combos.map((c) => <Row key={c.id} t="COMBO" id={c.id} name={c.name} base={c.priceCents} />)}</tbody></table>
        )}
        {tab === "extras" && (
          <table className="w-full"><Head price={false} />
            <tbody>
              {crusts.map((c) => <Row key={c.id} t="CRUST" id={c.id} name={`Borda ${c.name}`} showPrice={false} />)}
              {addons.map((a) => <Row key={a.id} t="ADDON" id={a.id} name={`Adicional ${a.name}`} showPrice={false} />)}
            </tbody>
          </table>
        )}
        <div className="mt-4"><button className="btn-primary py-2">Salvar ajustes</button></div>
      </form>
    </AdminPage>
  );
}
