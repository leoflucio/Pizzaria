"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResolvedCombo, ResolvedProduct } from "@/domain/catalog";
import type { CartItemInput } from "@/domain/checkout";
import { priceLine, PricingError } from "@/domain/pricing";
import { formatBRL } from "@/domain/money";
import { PizzaBuilder, type PizzaChoice } from "./PizzaBuilder";
import { load, save } from "./storage";
import type { Address, Candidate, CartEntry, CatalogPayload, Destination, PublicStore } from "./types";

interface Network { name: string; tagline: string | null }

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function describe(line: ReturnType<typeof priceLine>): string[] {
  const d = line.details as Record<string, any>;
  const pizza = (p: any) => [
    ...(p?.flavors ?? []).map((f: any) => `${f.fraction === "inteira" ? "" : f.fraction + " "}${f.name}${f.removed?.length ? ` (sem ${f.removed.join(", ")})` : ""}`),
    ...(p?.crust ? [`Borda ${p.crust}`] : []),
    ...(p?.addons ?? []).map((a: string) => `+ ${a}`),
  ];
  if (line.kind === "PIZZA") return pizza(d);
  if (line.kind === "COMBO") return [...pizza(d.pizza), ...(d.extraPizza ? [`${d.extraPizza.size}:`, ...pizza(d.extraPizza)] : []), ...(d.drink ? [`Bebida: ${d.drink}`] : [])];
  return [];
}

export function OrderApp() {
  const router = useRouter();
  const [network, setNetwork] = useState<Network | null>(null);
  const [stores, setStores] = useState<PublicStore[]>([]);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [view, setView] = useState<"menu" | "checkout">("menu");
  const [builder, setBuilder] = useState<null | { kind: "pizza" } | { kind: "combo"; combo: ResolvedCombo } | { kind: "product"; product: ResolvedProduct }>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/stores").then((r) => r.json()).then((d) => { setNetwork(d.network); setStores(d.stores); });
    setDestination(load<Destination | null>("dnp.destination", null));
    setCart(load<CartEntry[]>("dnp.cart", []));
    setReady(true);
  }, []);
  useEffect(() => { if (ready) save("dnp.cart", cart); }, [cart, ready]);
  useEffect(() => { if (ready) save("dnp.destination", destination); }, [destination, ready]);

  const store = stores.find((s) => s.id === destination?.storeId);

  // Load the chosen store's menu and reprice the cart with it (prices and availability vary per store).
  useEffect(() => {
    if (!destination) return;
    let alive = true;
    fetch(`/api/catalog?storeId=${destination.storeId}`).then((r) => r.json()).then((d: CatalogPayload) => {
      if (!alive) return;
      setCatalog(d);
      setCart((cur) => {
        const kept: CartEntry[] = [];
        const dropped: string[] = [];
        for (const e of cur) {
          try {
            const line = priceLine(d.catalog, e.item as never, d.mixedPricingRule);
            kept.push({ ...e, name: line.name, unitPriceCents: line.unitPriceCents, summary: describe(line) });
          } catch {
            dropped.push(e.name);
          }
        }
        if (dropped.length) setNotice(`Removemos do carrinho itens indisponíveis nesta loja: ${dropped.join(", ")}.`);
        return kept;
      });
    });
    return () => { alive = false; };
  }, [destination?.storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addEntry = useCallback((item: CartItemInput) => {
    if (!catalog) return;
    try {
      const line = priceLine(catalog.catalog, item as never, catalog.mixedPricingRule);
      setCart((c) => [...c, { key: uid(), item, name: line.name, unitPriceCents: line.unitPriceCents, summary: describe(line) }]);
      setBuilder(null);
      setNotice(`${line.name} adicionado ao carrinho.`);
    } catch (e) {
      setNotice(e instanceof PricingError ? e.message : "Não foi possível adicionar.");
    }
  }, [catalog]);

  const subtotal = cart.reduce((a, e) => a + e.unitPriceCents * e.item.qty, 0);
  const count = cart.reduce((a, e) => a + e.item.qty, 0);

  if (!ready) return null;

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-32">
      <header className="sticky top-0 z-30 border-b-4 border-brand bg-ink text-white shadow-md">
        <div className="flex items-center gap-3 px-4 py-3">
          <img src="/logo.png" alt="" className="h-14 w-auto" />
          <div className="flex-1">
            <h1 className="text-xl font-extrabold leading-tight text-gold">{network?.name ?? "D'Napoles"}</h1>
            <p className="text-xs text-white/80">{network?.tagline ?? "Pizzaria"}</p>
          </div>
          {destination && store && (
            <button className="rounded-xl bg-white/15 px-3 py-2 text-left text-xs hover:bg-white/25" onClick={() => { setDestination(null); setView("menu"); }}>
              <span className="block font-semibold">{destination.fulfillment === "DELIVERY" ? `Entrega · ${destination.address?.neighborhood}` : "Retirada"}</span>
              <span className="text-white/80">Loja {store.label} · trocar</span>
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm text-white" role="status">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {!destination ? (
        <DestinationPicker stores={stores} onPick={(d) => { setDestination(d); setView("menu"); }} />
      ) : view === "checkout" && store ? (
        <Checkout
          store={store} destination={destination} cart={cart} setCart={setCart} subtotal={subtotal}
          onBack={() => setView("menu")}
          onPlaced={(token) => { setCart([]); router.push(`/pedido/${token}`); }}
        />
      ) : (
        <>
          {store && (
            <StoreBanner
              store={store}
              destination={destination}
              onSwitch={(c) => {
                const current: Candidate = { storeId: destination.storeId, storeName: store.name, zoneId: "", zoneName: "", feeCents: destination.feeCents, minOrderCents: destination.minOrderCents, etaMinutes: destination.etaMinutes, available: true };
                setDestination({ ...destination, storeId: c.storeId, feeCents: c.feeCents, minOrderCents: c.minOrderCents, etaMinutes: c.etaMinutes, alternatives: [...destination.alternatives.filter((a) => a.storeId !== c.storeId), current] });
              }}
            />
          )}
          {catalog ? (
            <Menu payload={catalog} onPizza={() => setBuilder({ kind: "pizza" })} onCombo={(combo) => setBuilder({ kind: "combo", combo })} onProduct={(product) => setBuilder({ kind: "product", product })} />
          ) : (
            <p className="p-8 text-center text-stone-500">Carregando cardápio…</p>
          )}
        </>
      )}

      {builder?.kind === "pizza" && catalog && (
        <PizzaBuilder catalog={catalog.catalog} rule={catalog.mixedPricingRule} onClose={() => setBuilder(null)}
          onConfirm={(c) => addEntry({ kind: "PIZZA", sizeId: c.sizeId, parts: c.parts, crustId: c.crustId, addonIds: c.addonIds, qty: 1 })} />
      )}
      {builder?.kind === "combo" && catalog && <ComboFlow payload={catalog} combo={builder.combo} onClose={() => setBuilder(null)} onDone={addEntry} />}
      {builder?.kind === "product" && <ProductSheet product={builder.product} onClose={() => setBuilder(null)} onAdd={addEntry} />}

      {destination && view === "menu" && count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl px-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <button className="btn-primary w-full justify-between py-4 text-base shadow-xl" onClick={() => setView("checkout")}>
            <span className="rounded-lg bg-white/20 px-2 py-0.5 text-sm">{count}</span>
            <span>Ver carrinho</span>
            <span>{formatBRL(subtotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function DestinationPicker({ stores, onPick }: { stores: PublicStore[]; onPick: (d: Destination) => void }) {
  const [mode, setMode] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [addr, setAddr] = useState<Address>(() => load<Address>("dnp.address", { street: "", number: "", neighborhood: "" }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/neighborhoods").then((r) => r.json()).then((d) => setNeighborhoods(d.neighborhoods)); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/routing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addr) });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      save("dnp.address", addr);
      if (r.ok) {
        onPick({ fulfillment: "DELIVERY", storeId: r.chosen.storeId, address: addr, feeCents: r.chosen.feeCents, minOrderCents: r.chosen.minOrderCents, etaMinutes: r.chosen.etaMinutes, alternatives: r.alternatives });
      } else if (r.reason === "OUT_OF_AREA") {
        setError("Ainda não entregamos nesse bairro. Você pode retirar numa das nossas lojas.");
      } else {
        const names = (r.candidates as Candidate[]).map((c) => `${c.storeName} (${c.reason === "PAUSED" ? "pausada agora" : "fechada"})`).join(", ");
        setError(`As lojas que entregam aí não estão recebendo pedidos agora: ${names}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar a loja.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="px-4 py-6">
      <h2 className="mb-1 text-2xl font-extrabold">Como você quer receber?</h2>
      <p className="mb-5 text-stone-600">Escolhemos automaticamente a loja mais rápida para o seu endereço.</p>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-1" role="tablist">
        {(["DELIVERY", "PICKUP"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-xl py-3 font-semibold ${mode === m ? "bg-white shadow" : "text-stone-600"}`}>
            {m === "DELIVERY" ? "Entrega" : "Retirar na loja"}
          </button>
        ))}
      </div>

      {mode === "DELIVERY" ? (
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <label className="label" htmlFor="bairro">Bairro</label>
            <input id="bairro" className="input" list="bairros" required value={addr.neighborhood} onChange={(e) => setAddr({ ...addr, neighborhood: e.target.value })} placeholder="Ex.: Manaíra" autoComplete="address-level3" />
            <datalist id="bairros">{neighborhoods.map((n) => <option key={n} value={n} />)}</datalist>
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div>
              <label className="label" htmlFor="rua">Rua</label>
              <input id="rua" className="input" required value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} autoComplete="address-line1" />
            </div>
            <div>
              <label className="label" htmlFor="numero">Número</label>
              <input id="numero" className="input" required value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} inputMode="numeric" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="compl">Complemento</label>
            <input id="compl" className="input" value={addr.complement ?? ""} onChange={(e) => setAddr({ ...addr, complement: e.target.value })} placeholder="Apto, bloco" />
          </div>
          <div>
            <label className="label" htmlFor="ref">Ponto de referência</label>
            <input id="ref" className="input" value={addr.reference ?? ""} onChange={(e) => setAddr({ ...addr, reference: e.target.value })} />
          </div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
          <button className="btn-primary mt-2 py-4 text-base" disabled={busy}>{busy ? "Buscando a loja…" : "Ver cardápio"}</button>
        </form>
      ) : (
        <ul className="grid gap-3">
          {stores.map((s) => {
            const available = s.isOpen && !s.isPaused;
            return (
              <li key={s.id}>
                <button disabled={!available} onClick={() => onPick({ fulfillment: "PICKUP", storeId: s.id, feeCents: 0, minOrderCents: 0, etaMinutes: s.pickupMinutes, alternatives: [] })} className="card flex w-full items-center gap-3 p-4 text-left hover:ring-brand disabled:opacity-60">
                  <span className="flex-1">
                    <span className="block font-bold">{s.name}</span>
                    <span className="block text-sm text-stone-500">{s.address}</span>
                  </span>
                  <span className={`chip ${available ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-700"}`}>
                    {available ? `~${s.pickupMinutes} min` : s.isPaused ? "Pausada" : `Abre ${s.nextOpening ?? ""}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function StoreBanner({ store, destination, onSwitch }: { store: PublicStore; destination: Destination; onSwitch: (c: Candidate) => void }) {
  return (
    <div className="mx-4 mt-4 card p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-lg" aria-hidden>🍕</span>
        <div className="flex-1 text-sm">
          <p className="font-bold">{store.name}</p>
          <p className="text-stone-600">
            {destination.fulfillment === "DELIVERY" ? `Entrega em ~${destination.etaMinutes} min · taxa ${formatBRL(destination.feeCents)}` : `Retirada em ~${destination.etaMinutes} min · ${store.address}`}
          </p>
        </div>
      </div>
      {destination.alternatives.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-brand">Outra loja também entrega aqui</summary>
          <ul className="mt-2 grid gap-2">
            {destination.alternatives.map((a) => (
              <li key={a.storeId} className="flex items-center justify-between rounded-xl bg-stone-50 p-2">
                <span>{a.storeName} · ~{a.etaMinutes} min · {formatBRL(a.feeCents)}</span>
                <button className="font-semibold text-brand" onClick={() => onSwitch(a)}>Usar</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Menu({ payload, onPizza, onCombo, onProduct }: { payload: CatalogPayload; onPizza: () => void; onCombo: (c: ResolvedCombo) => void; onProduct: (p: ResolvedProduct) => void }) {
  const { catalog } = payload;
  const fromPrice = (sizeId: string) => Math.min(...catalog.flavors.map((f) => f.prices[sizeId] ?? Infinity));
  return (
    <main className="px-4">
      <nav className="sticky top-[64px] z-20 -mx-4 mt-4 flex gap-2 overflow-x-auto bg-cream px-4 py-2" aria-label="Categorias">
        {catalog.categories.map((c) => (
          <a key={c.id} href={`#cat-${c.id}`} className="chip whitespace-nowrap bg-white px-4 py-2 text-sm ring-1 ring-stone-200">{c.name}</a>
        ))}
      </nav>
      {catalog.categories.map((cat) => (
        <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-32 pt-4">
          <h2 className="mb-3 text-xl font-extrabold">{cat.name}</h2>
          {cat.kind === "PIZZA" && (
            <>
              <button className="btn-primary mb-3 w-full py-4 text-base" onClick={onPizza}>Montar minha pizza (meio a meio)</button>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {catalog.sizes.map((s) => (
                  <li key={s.id}>
                    <button className="card w-full p-3 text-left hover:ring-brand" onClick={onPizza}>
                      <span className="block font-bold">{s.name}</span>
                      <span className="block text-xs text-stone-500">{s.slices ? `${s.slices} fatias · ` : ""}{s.maxFlavors} sabor{s.maxFlavors > 1 ? "es" : ""}</span>
                      {Number.isFinite(fromPrice(s.id)) && <span className="mt-1 block text-sm font-semibold">a partir de {formatBRL(fromPrice(s.id))}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {cat.kind === "COMBO" && (
            <ul className="grid gap-3">
              {catalog.combos.filter((c) => c.categoryId === cat.id).map((c) => (
                <li key={c.id}>
                  <button className="card flex w-full items-center gap-3 p-4 text-left hover:ring-brand disabled:opacity-50" disabled={!c.available} onClick={() => onCombo(c)}>
                    <span className="flex-1">
                      <span className="block font-bold">{c.name}</span>
                      <span className="block text-sm text-stone-500">{c.available ? c.description : "Indisponível agora"}</span>
                    </span>
                    <span className="font-bold text-brand">{formatBRL(c.priceCents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cat.kind === "PRODUCT" && (
            <ul className="grid gap-2">
              {catalog.products.filter((p) => p.categoryId === cat.id).map((p) => (
                <li key={p.id}>
                  <button className="card flex w-full items-center gap-3 p-3 text-left hover:ring-brand disabled:opacity-50" disabled={!p.available} onClick={() => onProduct(p)}>
                    <span className="flex-1">
                      <span className="block font-semibold">{p.name}</span>
                      {p.description && <span className="block text-sm text-stone-500">{p.description}</span>}
                      {!p.available && <span className="text-sm text-stone-500">Esgotado</span>}
                    </span>
                    <span className="font-semibold">{formatBRL(p.priceCents)}</span>
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-white" aria-hidden>+</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}

function ProductSheet({ product, onClose, onAdd }: { product: ResolvedProduct; onClose: () => void; onAdd: (i: CartItemInput) => void }) {
  const [option, setOption] = useState<string | null>(product.options[0] ?? null);
  const [qty, setQty] = useState(1);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={product.name}>
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 sm:rounded-3xl" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{product.name}</h2>
            {product.description && <p className="text-sm text-stone-500">{product.description}</p>}
          </div>
          <button className="text-2xl" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        {product.options.length > 0 && (
          <div className="mb-4 grid gap-2">
            {product.options.map((o) => (
              <label key={o} className="card flex items-center gap-3 p-3">
                <input type="radio" name="opt" checked={option === o} onChange={() => setOption(o)} className="h-5 w-5 accent-[var(--color-brand)]" />
                {o}
              </label>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Qty value={qty} onChange={setQty} />
          <button className="btn-primary flex-1" onClick={() => onAdd({ kind: "PRODUCT", productId: product.id, option, qty })}>Adicionar · {formatBRL(product.priceCents * qty)}</button>
        </div>
      </div>
    </div>
  );
}

function ComboFlow({ payload, combo, onClose, onDone }: { payload: CatalogPayload; combo: ResolvedCombo; onClose: () => void; onDone: (i: CartItemInput) => void }) {
  const [pizza, setPizza] = useState<PizzaChoice | null>(null);
  const [extra, setExtra] = useState<PizzaChoice | null>(null);
  const needsExtra = !!combo.extraPizzaSizeId;
  const [drink, setDrink] = useState<string | null>(combo.drinkOptions[0] ?? null);

  const finish = (p: PizzaChoice, x: PizzaChoice | null, d: string | null) =>
    onDone({
      kind: "COMBO", comboId: combo.id, qty: 1, drink: d,
      pizza: { parts: p.parts, crustId: p.crustId, addonIds: p.addonIds },
      ...(x ? { extraPizza: { parts: x.parts, crustId: x.crustId, addonIds: x.addonIds } } : {}),
    });

  if (!pizza) {
    return <PizzaBuilder catalog={payload.catalog} rule={payload.mixedPricingRule} fixedSizeId={combo.pizzaSizeId ?? undefined} allowedTierIds={combo.allowedTierIds} includedInPrice title={combo.name} confirmLabel="Continuar" onClose={onClose}
      onConfirm={(c) => { setPizza(c); if (!needsExtra && combo.drinkOptions.length === 0) finish(c, null, null); }} />;
  }
  if (needsExtra && !extra) {
    return <PizzaBuilder catalog={payload.catalog} rule={payload.mixedPricingRule} fixedSizeId={combo.extraPizzaSizeId!} allowedTierIds={combo.extraTierIds} includedInPrice title={`${combo.name} · 2ª pizza`} confirmLabel="Continuar" onClose={onClose}
      onConfirm={(c) => { setExtra(c); if (combo.drinkOptions.length === 0) finish(pizza, c, null); }} />;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Bebida do combo">
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <h2 className="mb-3 text-lg font-bold">Escolha a bebida</h2>
        <div className="mb-4 grid gap-2">
          {combo.drinkOptions.map((o) => (
            <label key={o} className="card flex items-center gap-3 p-3">
              <input type="radio" name="drink" checked={drink === o} onChange={() => setDrink(o)} className="h-5 w-5 accent-[var(--color-brand)]" />
              {o}
            </label>
          ))}
        </div>
        <button className="btn-primary w-full" onClick={() => finish(pizza, extra, drink)}>Adicionar combo</button>
      </div>
    </div>
  );
}

function Qty({ value, onChange, min = 1 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <div className="flex items-center rounded-xl ring-1 ring-stone-300">
      <button className="h-11 w-11 text-xl" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Diminuir">−</button>
      <span className="w-8 text-center font-semibold" aria-live="polite">{value}</span>
      <button className="h-11 w-11 text-xl" onClick={() => onChange(Math.min(50, value + 1))} aria-label="Aumentar">+</button>
    </div>
  );
}

function Checkout({ store, destination, cart, setCart, subtotal, onBack, onPlaced }: {
  store: PublicStore; destination: Destination; cart: CartEntry[]; setCart: (f: (c: CartEntry[]) => CartEntry[]) => void;
  subtotal: number; onBack: () => void; onPlaced: (token: string) => void;
}) {
  const [customer, setCustomer] = useState(() => load("dnp.customer", { name: "", phone: "", marketingOptIn: false }));
  const methods = useMemo(() => [
    ...(store.accepts.pix ? [{ id: "PIX", label: "PIX (pague agora)" }] : []),
    ...(store.accepts.card ? [{ id: "CARD_ON_DELIVERY", label: destination.fulfillment === "DELIVERY" ? "Cartão na entrega" : "Cartão na retirada" }] : []),
    ...(store.accepts.cash ? [{ id: "CASH", label: "Dinheiro" }] : []),
  ] as const, [store, destination.fulfillment]);
  const [payment, setPayment] = useState<string>(methods[0]?.id ?? "CASH");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idem] = useState(() => crypto.randomUUID());

  const fee = destination.fulfillment === "DELIVERY" ? destination.feeCents : 0;
  const total = subtotal + fee;
  const belowMin = destination.fulfillment === "DELIVERY" && subtotal < destination.minOrderCents;

  const place = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    save("dnp.customer", customer);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: store.id, fulfillment: destination.fulfillment, address: destination.address ?? null,
          items: cart.map((c) => c.item), customer, paymentMethod: payment,
          changeForCents: payment === "CASH" && changeFor ? Math.round(Number(changeFor.replace(",", ".")) * 100) : null,
          notes: notes || null, idempotencyKey: idem,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onPlaced(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o pedido.");
      setBusy(false);
    }
  };

  return (
    <main className="px-4 py-4">
      <button className="mb-3 text-sm font-semibold text-brand" onClick={onBack}>← Continuar comprando</button>
      <h2 className="mb-3 text-2xl font-extrabold">Seu pedido</h2>
      {cart.length === 0 ? (
        <p className="card p-6 text-center text-stone-500">Seu carrinho está vazio.</p>
      ) : (
        <form onSubmit={place} className="grid gap-5">
          <ul className="card divide-y divide-stone-100">
            {cart.map((e) => (
              <li key={e.key} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-semibold">{e.name}</p>
                    {e.summary.length > 0 && <p className="text-sm text-stone-500">{e.summary.join(" · ")}</p>}
                  </div>
                  <p className="font-semibold">{formatBRL(e.unitPriceCents * e.item.qty)}</p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <Qty value={e.item.qty} onChange={(n) => setCart((c) => c.map((x) => (x.key === e.key ? { ...x, item: { ...x.item, qty: n } } : x)))} />
                  <button type="button" className="text-sm font-medium text-red-700" onClick={() => setCart((c) => c.filter((x) => x.key !== e.key))}>Remover</button>
                </div>
              </li>
            ))}
          </ul>

          <section className="card grid gap-3 p-4">
            <h3 className="font-bold">Seus dados</h3>
            <div>
              <label className="label" htmlFor="nome">Nome</label>
              <input id="nome" className="input" required minLength={2} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="fone">WhatsApp</label>
              <input id="fone" className="input" required value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="(83) 9 9999-9999" />
            </div>
            <label className="flex items-start gap-3 text-sm text-stone-600">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]" checked={customer.marketingOptIn} onChange={(e) => setCustomer({ ...customer, marketingOptIn: e.target.checked })} />
              Quero receber promoções da D&apos;Napoles pelo WhatsApp. Posso cancelar quando quiser.
            </label>
          </section>

          {destination.fulfillment === "DELIVERY" && destination.address && (
            <section className="card p-4 text-sm">
              <h3 className="mb-1 font-bold">Entrega</h3>
              <p>{destination.address.street}, {destination.address.number}{destination.address.complement ? ` - ${destination.address.complement}` : ""}</p>
              <p className="text-stone-500">{destination.address.neighborhood} · loja {store.label} · ~{destination.etaMinutes} min</p>
            </section>
          )}

          <section className="card grid gap-2 p-4">
            <h3 className="font-bold">Pagamento</h3>
            {methods.map((m) => (
              <label key={m.id} className={`flex items-center gap-3 rounded-xl p-3 ring-1 ${payment === m.id ? "ring-2 ring-brand" : "ring-stone-200"}`}>
                <input type="radio" name="pay" value={m.id} checked={payment === m.id} onChange={() => setPayment(m.id)} className="h-5 w-5 accent-[var(--color-brand)]" />
                {m.label}
              </label>
            ))}
            {payment === "CASH" && (
              <div>
                <label className="label" htmlFor="troco">Troco para quanto? (opcional)</label>
                <input id="troco" className="input" inputMode="decimal" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} placeholder="Ex.: 100" />
              </div>
            )}
          </section>

          <section className="card p-4">
            <label className="label" htmlFor="obs">Observações</label>
            <textarea id="obs" className="input" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: interfone quebrado, ligar ao chegar" />
          </section>

          <section className="card grid gap-1 p-4 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
            {destination.fulfillment === "DELIVERY" && <div className="flex justify-between"><span>Taxa de entrega</span><span>{formatBRL(fee)}</span></div>}
            <div className="mt-1 flex justify-between text-lg font-extrabold"><span>Total</span><span>{formatBRL(total)}</span></div>
            {belowMin && <p className="text-red-700">Pedido mínimo para este bairro: {formatBRL(destination.minOrderCents)}.</p>}
          </section>

          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
          <button className="btn-primary py-4 text-base" disabled={busy || belowMin || cart.length === 0}>{busy ? "Enviando…" : `Fazer pedido · ${formatBRL(total)}`}</button>
        </form>
      )}
    </main>
  );
}
