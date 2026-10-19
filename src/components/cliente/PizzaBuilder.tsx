"use client";

import { useMemo, useState } from "react";
import type { ResolvedCatalog, ResolvedFlavor } from "@/domain/catalog";
import { pricePizza, pizzaTitle, PricingError, type MixedPricingRule, type PizzaPart } from "@/domain/pricing";
import { formatBRL } from "@/domain/money";

export interface PizzaChoice { sizeId: string; parts: PizzaPart[]; crustId: string | null; addonIds: string[] }

interface Props {
  catalog: ResolvedCatalog;
  rule: MixedPricingRule;
  /** fixed size for combos */
  fixedSizeId?: string;
  allowedTierIds?: string[];
  /** combos: flavor price is included, show only extras */
  includedInPrice?: boolean;
  initial?: Partial<PizzaChoice>;
  title?: string;
  confirmLabel?: string;
  onConfirm: (choice: PizzaChoice, info: { name: string; unitPriceCents: number; summary: string[] }) => void;
  onClose: () => void;
}

const RULE_TEXT: Record<MixedPricingRule, string> = {
  MAX: "Pizza com mais de um sabor é cobrada pelo sabor mais caro.",
  AVERAGE: "Pizza com mais de um sabor é cobrada pela média dos sabores.",
  PROPORTIONAL: "Pizza com mais de um sabor é cobrada proporcionalmente.",
};

export function PizzaBuilder({ catalog, rule, fixedSizeId, allowedTierIds, includedInPrice, initial, title, confirmLabel, onConfirm, onClose }: Props) {
  const [step, setStep] = useState<"size" | "flavors" | "extras">(fixedSizeId || initial?.sizeId ? "flavors" : "size");
  const [sizeId, setSizeId] = useState(fixedSizeId ?? initial?.sizeId ?? "");
  const [parts, setParts] = useState<PizzaPart[]>(initial?.parts ?? []);
  const [crustId, setCrustId] = useState<string | null>(initial?.crustId ?? null);
  const [addonIds, setAddonIds] = useState<string[]>(initial?.addonIds ?? []);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const size = catalog.sizes.find((s) => s.id === sizeId);
  const maxFlavors = size?.maxFlavors ?? 1;

  const flavorsByTier = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = catalog.flavors.filter(
      (f) => (!allowedTierIds?.length || allowedTierIds.includes(f.tierId)) && (!sizeId || f.prices[sizeId] != null) &&
        (!q || f.name.toLowerCase().includes(q) || f.ingredients.some((i) => i.includes(q)) || f.aliases.some((a) => a.includes(q))),
    );
    const groups = new Map<string, ResolvedFlavor[]>();
    for (const f of list) groups.set(f.tierName, [...(groups.get(f.tierName) ?? []), f]);
    return [...groups.entries()];
  }, [catalog.flavors, allowedTierIds, sizeId, query]);

  const priced = useMemo(() => {
    if (!sizeId || parts.length === 0) return null;
    try {
      return pricePizza(catalog, { sizeId, parts, crustId, addonIds }, rule, { allowedTierIds, ignoreFlavorPrice: includedInPrice });
    } catch (e) {
      return e instanceof PricingError ? e : null;
    }
  }, [catalog, sizeId, parts, crustId, addonIds, rule, allowedTierIds, includedInPrice]);

  const toggleFlavor = (f: ResolvedFlavor) => {
    if (!f.available) return;
    setParts((cur) => {
      if (cur.some((p) => p.flavorId === f.id)) return cur.filter((p) => p.flavorId !== f.id);
      if (cur.length >= maxFlavors) return maxFlavors === 1 ? [{ flavorId: f.id }] : cur;
      return [...cur, { flavorId: f.id }];
    });
  };

  const toggleRemoved = (flavorId: string, ingredient: string) =>
    setParts((cur) => cur.map((p) => (p.flavorId !== flavorId ? p : { ...p, removed: p.removed?.includes(ingredient) ? p.removed.filter((r) => r !== ingredient) : [...(p.removed ?? []), ingredient] })));

  const confirm = () => {
    if (!priced || priced instanceof Error) return;
    const summary = [
      ...priced.details.flavors.map((f) => `${f.fraction === "inteira" ? "" : f.fraction + " "}${f.name}${f.removed.length ? ` (sem ${f.removed.join(", ")})` : ""}`),
      ...(priced.details.crust ? [`Borda ${priced.details.crust}`] : []),
      ...priced.details.addons.map((a) => `+ ${a}`),
    ];
    onConfirm({ sizeId, parts, crustId, addonIds }, { name: pizzaTitle(priced.details), unitPriceCents: priced.unitPriceCents, summary });
  };

  const stepTitle = step === "size" ? "Escolha o tamanho" : step === "flavors" ? `Escolha até ${maxFlavors} sabor${maxFlavors > 1 ? "es" : ""}` : "Borda e adicionais";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={title ?? "Montar pizza"}>
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white sm:rounded-3xl">
        <header className="flex items-center gap-3 border-b border-stone-100 px-5 py-4">
          {step !== "size" && !(step === "flavors" && fixedSizeId) && (
            <button className="rounded-full p-2 hover:bg-stone-100" onClick={() => setStep(step === "extras" ? "flavors" : "size")} aria-label="Voltar">←</button>
          )}
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">{title ?? "Montar pizza"}{size ? ` · ${size.name}` : ""}</p>
            <h2 className="text-lg font-bold">{stepTitle}</h2>
          </div>
          <button className="rounded-full p-2 text-xl hover:bg-stone-100" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === "size" && (
            <ul className="grid gap-3">
              {catalog.sizes.map((s) => {
                const from = Math.min(...catalog.flavors.map((f) => f.prices[s.id] ?? Infinity));
                return (
                  <li key={s.id}>
                    <button
                      className={`card flex w-full items-center justify-between p-4 text-left hover:ring-brand ${sizeId === s.id ? "ring-2 ring-brand" : ""}`}
                      onClick={() => { setSizeId(s.id); setParts((p) => p.slice(0, s.maxFlavors)); setStep("flavors"); }}
                    >
                      <span>
                        <span className="block text-base font-bold">{s.name}</span>
                        <span className="text-sm text-stone-500">{s.slices ? `${s.slices} fatias · ` : ""}até {s.maxFlavors} sabor{s.maxFlavors > 1 ? "es" : ""}</span>
                      </span>
                      {Number.isFinite(from) && <span className="text-sm font-semibold text-stone-700">a partir de {formatBRL(from)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {step === "flavors" && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <div className="flex gap-1" aria-hidden>
                  {Array.from({ length: maxFlavors }).map((_, i) => (
                    <span key={i} className={`h-2 w-8 rounded-full ${i < parts.length ? "bg-brand" : "bg-stone-200"}`} />
                  ))}
                </div>
                <span className="text-sm text-stone-600">{parts.length} de {maxFlavors}</span>
              </div>
              {maxFlavors > 1 && !includedInPrice && <p className="mb-3 text-xs text-stone-500">{RULE_TEXT[rule]}</p>}
              <input className="input mb-4" placeholder="Buscar sabor ou ingrediente" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar sabor" />
              {flavorsByTier.map(([tier, list]) => (
                <section key={tier} className="mb-5">
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-stone-500">{tier}</h3>
                  <ul className="grid gap-2">
                    {list.map((f) => {
                      const selected = parts.find((p) => p.flavorId === f.id);
                      return (
                        <li key={f.id} className={`card p-3 ${selected ? "ring-2 ring-brand" : ""} ${!f.available ? "opacity-50" : ""}`}>
                          <button className="flex w-full items-start gap-3 text-left" onClick={() => toggleFlavor(f)} disabled={!f.available} aria-pressed={!!selected}>
                            <span className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${selected ? "border-brand bg-brand text-white" : "border-stone-300"}`}>{selected ? "✓" : ""}</span>
                            <span className="flex-1">
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="font-semibold">{f.name}</span>
                                {!includedInPrice && sizeId && <span className="text-sm text-stone-600">{formatBRL(f.prices[sizeId]!)}</span>}
                              </span>
                              <span className="block text-sm text-stone-500">{f.available ? f.ingredients.join(", ") : "Esgotado nesta loja"}</span>
                            </span>
                          </button>
                          {selected && f.ingredients.length > 0 && (
                            <div className="mt-2 pl-8">
                              <button className="text-sm font-medium text-brand underline" onClick={() => setEditing(editing === f.id ? null : f.id)}>
                                {selected.removed?.length ? `Sem ${selected.removed.join(", ")}` : "Tirar ingrediente"}
                              </button>
                              {editing === f.id && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {f.ingredients.map((ing) => (
                                    <button key={ing} onClick={() => toggleRemoved(f.id, ing)} className={`chip ring-1 ${selected.removed?.includes(ing) ? "bg-stone-800 text-white ring-stone-800 line-through" : "bg-white ring-stone-300"}`}>
                                      {ing}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </>
          )}

          {step === "extras" && size && (
            <>
              <h3 className="mb-2 font-bold">Borda recheada</h3>
              <div className="mb-5 grid gap-2">
                <label className="card flex items-center gap-3 p-3">
                  <input type="radio" name="crust" checked={crustId === null} onChange={() => setCrustId(null)} className="h-5 w-5 accent-[var(--color-brand)]" />
                  <span className="flex-1">Sem borda recheada</span>
                </label>
                {catalog.crusts.filter((c) => c.prices[size.id] != null).map((c) => (
                  <label key={c.id} className={`card flex items-center gap-3 p-3 ${!c.available ? "opacity-50" : ""}`}>
                    <input type="radio" name="crust" disabled={!c.available} checked={crustId === c.id} onChange={() => setCrustId(c.id)} className="h-5 w-5 accent-[var(--color-brand)]" />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-sm text-stone-600">+ {formatBRL(c.prices[size.id]!)}</span>
                  </label>
                ))}
              </div>
              <h3 className="mb-2 font-bold">Adicionais</h3>
              <div className="grid gap-2">
                {catalog.addons.filter((a) => a.prices[size.id] != null).map((a) => (
                  <label key={a.id} className={`card flex items-center gap-3 p-3 ${!a.available ? "opacity-50" : ""}`}>
                    <input type="checkbox" disabled={!a.available} checked={addonIds.includes(a.id)} onChange={() => setAddonIds((cur) => (cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id]))} className="h-5 w-5 accent-[var(--color-brand)]" />
                    <span className="flex-1">{a.name}</span>
                    <span className="text-sm text-stone-600">+ {formatBRL(a.prices[size.id]!)}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {step !== "size" && (
          <footer className="border-t border-stone-100 px-5 py-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            {priced instanceof Error && <p className="mb-2 text-sm text-red-700" role="alert">{priced.message}</p>}
            {step === "flavors" ? (
              <button className="btn-primary w-full" disabled={parts.length === 0 || priced instanceof Error} onClick={() => setStep("extras")}>
                Continuar {priced && !(priced instanceof Error) && !includedInPrice ? `· ${formatBRL(priced.unitPriceCents)}` : ""}
              </button>
            ) : (
              <button className="btn-primary w-full" disabled={!priced || priced instanceof Error} onClick={confirm}>
                {confirmLabel ?? "Adicionar ao carrinho"} {priced && !(priced instanceof Error) ? `· ${includedInPrice ? (priced.unitPriceCents ? "+ " + formatBRL(priced.unitPriceCents) : "incluso") : formatBRL(priced.unitPriceCents)}` : ""}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
