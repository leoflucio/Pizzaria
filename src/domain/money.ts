const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number): string {
  // Intl uses a non-breaking space after "R$"; normalize so tickets and tests stay predictable.
  return brl.format(cents / 100).replace(/ /g, " ");
}

export function parseBRL(input: string): number {
  const clean = input.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(clean);
  if (!Number.isFinite(value)) throw new Error(`Valor inválido: ${input}`);
  return Math.round(value * 100);
}
