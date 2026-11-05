/** Cálculos do painel: funções puras, testadas sem banco. */

export type SummaryTx = {
  type: string;
  amount_cents: number;
  status: string;
  category_id: string | null;
};

export type SummaryCategory = { id: string; parent_id: string | null; name: string; color: string };

export type CategorySpend = { id: string | null; name: string; color: string; cents: number; share: number };

/**
 * Gastos pagos do mês agrupados pela categoria principal, do maior para o menor.
 * Subcategorias somam no pai; acima de `top` itens, o resto vira "Outras".
 */
export function spendingByCategory(txs: SummaryTx[], categories: SummaryCategory[], top = 6): CategorySpend[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string | null, number>();
  for (const t of txs) {
    if (t.type !== "expense" || t.status !== "paid") continue;
    const cat = t.category_id ? byId.get(t.category_id) : undefined;
    const rootId = cat ? (cat.parent_id ?? cat.id) : null;
    totals.set(rootId, (totals.get(rootId) ?? 0) + t.amount_cents);
  }
  const total = [...totals.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return [];

  const items = [...totals.entries()]
    .map(([id, cents]) => {
      const c = id ? byId.get(id) : undefined;
      return { id, name: c?.name ?? "Sem categoria", color: c?.color ?? "#94a3b8", cents, share: cents / total };
    })
    .sort((a, b) => b.cents - a.cents);

  if (items.length <= top) return items;
  const head = items.slice(0, top - 1);
  const restCents = items.slice(top - 1).reduce((s, i) => s + i.cents, 0);
  return [...head, { id: null, name: "Outras", color: "#cbd5e1", cents: restCents, share: restCents / total }];
}
