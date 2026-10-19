import { requireNetworkAdmin } from "@/server/auth";
import { prisma } from "@/server/db";
import { WEEKDAYS } from "@/domain/hours";
import { AdminPage, Check, Field, Flash, Save, Section, formatBRL, reais } from "@/components/admin/ui";
import { saveCategory, saveCombo, saveFlavor, saveNetwork, saveOption, saveProduct, saveSize, saveTier, saveTierPrices } from "../actions";

export const dynamic = "force-dynamic";

export default async function CardapioPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireNetworkAdmin();
  const [network, sizes, tiers, flavors, crusts, addons, categories, products, combos] = await Promise.all([
    prisma.network.findFirstOrThrow(),
    prisma.pizzaSize.findMany({ orderBy: { sort: "asc" } }),
    prisma.flavorTier.findMany({ orderBy: { sort: "asc" }, include: { prices: true } }),
    prisma.flavor.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }], include: { sizePrices: true } }),
    prisma.crust.findMany({ orderBy: { sort: "asc" }, include: { prices: true } }),
    prisma.addon.findMany({ orderBy: { sort: "asc" }, include: { prices: true } }),
    prisma.category.findMany({ orderBy: { sort: "asc" } }),
    prisma.product.findMany({ orderBy: [{ categoryId: "asc" }, { sort: "asc" }] }),
    prisma.combo.findMany({ orderBy: { sort: "asc" } }),
  ]);
  const activeSizes = sizes.filter((s) => s.active);
  const productCats = categories.filter((c) => c.kind === "PRODUCT");
  const comboCats = categories.filter((c) => c.kind === "COMBO");

  const OptionRows = ({ kind, rows }: { kind: "crust" | "addon"; rows: { id: string; name: string; active: boolean; sort: number; prices: { sizeId: string; priceCents: number }[] }[] }) => (
    <div className="grid gap-3">
      {[...rows, null].map((r, i) => (
        <form key={r?.id ?? `new${i}`} action={saveOption} className="grid items-end gap-2 sm:grid-cols-[1fr_repeat(var(--n),6rem)_auto]" style={{ ["--n" as string]: activeSizes.length }}>
          <input type="hidden" name="kind" value={kind} />
          {r && <input type="hidden" name="id" value={r.id} />}
          <Field label={r ? "Nome" : kind === "crust" ? "Nova borda" : "Novo adicional"} name="name" defaultValue={r?.name} />
          {activeSizes.map((s) => (
            <Field key={s.id} label={s.name} name={r ? `p_${r.id}_${s.id}` : `pnew_${s.id}`} defaultValue={reais(r?.prices.find((p) => p.sizeId === s.id)?.priceCents)} />
          ))}
          <div className="flex items-center gap-2 pb-1">
            <Check label="Ativo" name="active" defaultChecked={r?.active ?? true} />
            <input type="hidden" name="sort" value={r?.sort ?? rows.length} />
            <Save label={r ? "Salvar" : "Criar"} />
          </div>
        </form>
      ))}
    </div>
  );

  return (
    <AdminPage title="Cardápio da rede" back={{ href: "/painel/admin", label: "Configurações" }}>
      <Flash {...await searchParams} />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {[["rede", "Rede"], ["tamanhos", "Tamanhos"], ["faixas", "Preços por faixa"], ["sabores", "Sabores"], ["bordas", "Bordas"], ["adicionais", "Adicionais"], ["categorias", "Categorias"], ["produtos", "Produtos"], ["combos", "Combos"]].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="chip bg-white px-3 py-1.5 ring-1 ring-stone-200">{l}</a>
        ))}
      </nav>

      <Section id="rede" title="Rede">
        <form action={saveNetwork} className="grid gap-3 sm:grid-cols-3">
          <Field label="Nome da marca" name="name" defaultValue={network.name} required />
          <Field label="Frase" name="tagline" defaultValue={network.tagline} />
          <Field label="Cor principal" name="primaryColor" defaultValue={network.primaryColor} type="color" />
          <label className="block sm:col-span-2">
            <span className="label">Preço da pizza com mais de um sabor</span>
            <select name="mixedPricingRule" defaultValue={network.mixedPricingRule} className="input py-2">
              <option value="MAX">Pelo sabor mais caro</option>
              <option value="AVERAGE">Pela média dos sabores</option>
              <option value="PROPORTIONAL">Proporcional à fração de cada sabor</option>
            </select>
          </label>
          <Field label="Fuso horário" name="timezone" defaultValue={network.timezone} />
          <div className="sm:col-span-3"><Save /></div>
        </form>
      </Section>

      <Section id="tamanhos" title="Tamanhos" desc="Máximo de 1 a 4 sabores por tamanho.">
        <div className="grid gap-2">
          {[...sizes, null].map((s, i) => (
            <form key={s?.id ?? `new${i}`} action={saveSize} className="grid items-end gap-2 sm:grid-cols-6">
              {s && <input type="hidden" name="id" value={s.id} />}
              <Field label={s ? "Nome" : "Novo tamanho"} name="name" defaultValue={s?.name} className="sm:col-span-2" />
              <Field label="Fatias" name="slices" type="number" defaultValue={s?.slices} />
              <Field label="Máx. sabores" name="maxFlavors" type="number" defaultValue={s?.maxFlavors ?? 2} />
              <Field label="Ordem" name="sort" type="number" defaultValue={s?.sort ?? sizes.length} />
              <div className="flex items-center gap-2 pb-1"><Check label="Ativo" name="active" defaultChecked={s?.active ?? true} /><Save label={s ? "Salvar" : "Criar"} /></div>
            </form>
          ))}
        </div>
      </Section>

      <Section id="faixas" title="Preços por faixa e tamanho" desc="Cada sabor pertence a uma faixa. Mudar um preço aqui muda todos os sabores da faixa (exceto os que têm preço próprio). Em branco = não vende nesse tamanho.">
        <form action={saveTierPrices} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className="p-2 text-left">Faixa</th>{activeSizes.map((s) => <th key={s.id} className="p-2 text-left">{s.name}</th>)}</tr></thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.id}>
                  <td className="p-2 font-semibold">{t.name}</td>
                  {activeSizes.map((s) => (
                    <td key={s.id} className="p-1"><input className="input w-24 py-2" name={`p_${t.id}_${s.id}`} defaultValue={reais(t.prices.find((p) => p.sizeId === s.id)?.priceCents)} aria-label={`${t.name} ${s.name}`} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3"><Save label="Salvar preços" /></div>
        </form>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold">Renomear ou criar faixa</summary>
          <div className="mt-2 grid gap-2">
            {[...tiers, null].map((t, i) => (
              <form key={t?.id ?? `n${i}`} action={saveTier} className="flex items-end gap-2">
                {t && <input type="hidden" name="id" value={t.id} />}
                <Field label={t ? "Nome" : "Nova faixa"} name="name" defaultValue={t?.name} />
                <Field label="Ordem" name="sort" type="number" defaultValue={t?.sort ?? tiers.length} />
                <Save label={t ? "Salvar" : "Criar"} />
              </form>
            ))}
          </div>
        </details>
      </Section>

      <Section id="sabores" title={`Sabores (${flavors.length})`} desc="Ingredientes listados aqui podem ser removidos pelo cliente. Apelidos ajudam a busca e o atendimento pelo WhatsApp.">
        {[...flavors, null].map((f) => (
          <details key={f?.id ?? "new"} className="mb-2 rounded-xl ring-1 ring-stone-200" open={!f ? false : undefined}>
            <summary className="cursor-pointer p-3">
              {f ? <><b>{f.name}</b> <span className="text-sm text-stone-500">· {tiers.find((t) => t.id === f.tierId)?.name}{f.sizePrices.length ? " · preço próprio" : ""}{!f.active ? " · inativo" : ""}</span></> : <b className="text-brand">+ Novo sabor</b>}
            </summary>
            <form action={saveFlavor} className="grid gap-3 p-3 pt-0 sm:grid-cols-3">
              {f && <input type="hidden" name="id" value={f.id} />}
              <Field label="Nome" name="name" defaultValue={f?.name} required />
              <label className="block"><span className="label">Faixa</span>
                <select name="tierId" defaultValue={f?.tierId ?? tiers[0]?.id} className="input py-2">{tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              </label>
              <Field label="Ordem" name="sort" type="number" defaultValue={f?.sort ?? flavors.length} />
              <Field label="Ingredientes (separados por vírgula)" name="ingredients" defaultValue={f?.ingredients.join(", ")} className="sm:col-span-2" />
              <Field label="Apelidos" name="aliases" defaultValue={f?.aliases.join(", ")} />
              <Field label="Descrição" name="description" defaultValue={f?.description} className="sm:col-span-3" />
              <div className="sm:col-span-3">
                <span className="label">Preço próprio por tamanho (opcional, substitui a faixa)</span>
                <div className="flex flex-wrap gap-2">
                  {activeSizes.map((s) => <Field key={s.id} label={s.name} name={`fp_${s.id}`} defaultValue={reais(f?.sizePrices.find((p) => p.sizeId === s.id)?.priceCents)} className="w-28" />)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
                <Check label="Doce" name="isSweet" defaultChecked={f?.isSweet} />
                <Check label="Ativo" name="active" defaultChecked={f?.active ?? true} />
                <Save label={f ? "Salvar sabor" : "Criar sabor"} />
              </div>
            </form>
          </details>
        ))}
      </Section>

      <Section id="bordas" title="Bordas recheadas" desc="Preço por tamanho. Em branco = não oferece nesse tamanho."><OptionRows kind="crust" rows={crusts} /></Section>
      <Section id="adicionais" title="Adicionais"><OptionRows kind="addon" rows={addons} /></Section>

      <Section id="categorias" title="Categorias" desc="A categoria de pizza mostra o montador; as de produto e combo listam itens.">
        <div className="grid gap-2">
          {[...categories, null].map((c, i) => (
            <form key={c?.id ?? `n${i}`} action={saveCategory} className="grid items-end gap-2 sm:grid-cols-5">
              {c && <input type="hidden" name="id" value={c.id} />}
              <Field label={c ? "Nome" : "Nova categoria"} name="name" defaultValue={c?.name} className="sm:col-span-2" />
              <label className="block"><span className="label">Tipo</span>
                <select name="kind" defaultValue={c?.kind ?? "PRODUCT"} className="input py-2"><option value="PIZZA">Pizza</option><option value="PRODUCT">Produtos</option><option value="COMBO">Combos</option></select>
              </label>
              <Field label="Ordem" name="sort" type="number" defaultValue={c?.sort ?? categories.length} />
              <div className="flex items-center gap-2 pb-1"><Check label="Ativa" name="active" defaultChecked={c?.active ?? true} /><Save label={c ? "Salvar" : "Criar"} /></div>
            </form>
          ))}
        </div>
      </Section>

      <Section id="produtos" title={`Produtos (${products.length})`} desc="Bebidas, pratos e vinhos. Opções viram uma escolha obrigatória (ex.: Coca-Cola, Guaraná).">
        {[...products, null].map((p) => (
          <details key={p?.id ?? "new"} className="mb-2 rounded-xl ring-1 ring-stone-200">
            <summary className="cursor-pointer p-3">{p ? <><b>{p.name}</b> <span className="text-sm text-stone-500">· {categories.find((c) => c.id === p.categoryId)?.name} · {formatBRL(p.priceCents)}{!p.active ? " · inativo" : ""}</span></> : <b className="text-brand">+ Novo produto</b>}</summary>
            <form action={saveProduct} className="grid gap-3 p-3 pt-0 sm:grid-cols-4">
              {p && <input type="hidden" name="id" value={p.id} />}
              <Field label="Nome" name="name" defaultValue={p?.name} required className="sm:col-span-2" />
              <label className="block"><span className="label">Categoria</span>
                <select name="categoryId" defaultValue={p?.categoryId ?? productCats[0]?.id} className="input py-2">{productCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </label>
              <Field label="Preço (R$)" name="price" defaultValue={reais(p?.priceCents)} required />
              <Field label="Descrição" name="description" defaultValue={p?.description} className="sm:col-span-2" />
              <Field label="Opções (vírgula)" name="options" defaultValue={p?.options.join(", ")} />
              <Field label="Ordem" name="sort" type="number" defaultValue={p?.sort ?? 0} />
              <div className="flex items-center gap-4 sm:col-span-4"><Check label="Ativo" name="active" defaultChecked={p?.active ?? true} /><Save label={p ? "Salvar" : "Criar"} /></div>
            </form>
          </details>
        ))}
      </Section>

      <Section id="combos" title="Combos e promoções" desc="O preço do combo já inclui o sabor; borda e adicionais são cobrados à parte. Para valer só numa loja, marque como exclusivo nos ajustes da loja.">
        {[...combos, null].map((c) => (
          <details key={c?.id ?? "new"} className="mb-2 rounded-xl ring-1 ring-stone-200">
            <summary className="cursor-pointer p-3">{c ? <><b>{c.name}</b> <span className="text-sm text-stone-500">· {formatBRL(c.priceCents)}{c.weekdays.length ? ` · ${c.weekdays.map((d) => WEEKDAYS[d]).join(", ")}` : ""}{!c.active ? " · inativo" : ""}</span></> : <b className="text-brand">+ Novo combo</b>}</summary>
            <form action={saveCombo} className="grid gap-3 p-3 pt-0 sm:grid-cols-4">
              {c && <input type="hidden" name="id" value={c.id} />}
              <Field label="Nome" name="name" defaultValue={c?.name} required className="sm:col-span-2" />
              <Field label="Preço (R$)" name="price" defaultValue={reais(c?.priceCents)} required />
              <label className="block"><span className="label">Categoria</span>
                <select name="categoryId" defaultValue={c?.categoryId ?? comboCats[0]?.id} className="input py-2">{comboCats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              </label>
              <Field label="Descrição" name="description" defaultValue={c?.description} className="sm:col-span-4" />
              <label className="block"><span className="label">Pizza do combo</span>
                <select name="pizzaSizeId" defaultValue={c?.pizzaSizeId ?? ""} className="input py-2"><option value="">Nenhuma</option>{sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </label>
              <fieldset className="sm:col-span-3"><legend className="label">Faixas aceitas na pizza</legend>
                <div className="flex flex-wrap gap-3">{tiers.map((t) => <Check key={t.id} label={t.name} name="allowedTierIds" defaultChecked={c?.allowedTierIds.includes(t.id)} />)}</div>
              </fieldset>
              <label className="block"><span className="label">Segunda pizza</span>
                <select name="extraPizzaSizeId" defaultValue={c?.extraPizzaSizeId ?? ""} className="input py-2"><option value="">Nenhuma</option>{sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </label>
              <fieldset className="sm:col-span-3"><legend className="label">Faixas aceitas na segunda pizza</legend>
                <div className="flex flex-wrap gap-3">{tiers.map((t) => <Check key={t.id} label={t.name} name="extraTierIds" defaultChecked={c?.extraTierIds.includes(t.id)} />)}</div>
              </fieldset>
              <Field label="Bebidas para escolher (vírgula)" name="drinkOptions" defaultValue={c?.drinkOptions.join(", ")} className="sm:col-span-2" />
              <Field label="Ordem" name="sort" type="number" defaultValue={c?.sort ?? combos.length} />
              <fieldset className="sm:col-span-4"><legend className="label">Dias da semana (nenhum marcado = todos)</legend>
                <div className="flex flex-wrap gap-3">{WEEKDAYS.map((d, i) => <label key={d} className="flex items-center gap-1 text-sm capitalize"><input type="checkbox" name="weekdays" value={i} defaultChecked={c?.weekdays.includes(i)} className="h-5 w-5" />{d}</label>)}</div>
              </fieldset>
              <div className="flex items-center gap-4 sm:col-span-4"><Check label="Ativo" name="active" defaultChecked={c?.active ?? true} /><Save label={c ? "Salvar" : "Criar"} /></div>
            </form>
          </details>
        ))}
      </Section>
    </AdminPage>
  );
}
