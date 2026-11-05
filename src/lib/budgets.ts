import type { SupabaseClient } from "@supabase/supabase-js";
import { monthBounds } from "./dates.ts";
import { budgetStatus, type BudgetLevel } from "./summary.ts";
import type { Category } from "./data.ts";

export type BudgetRow = {
  category: Category;
  spentCents: number;
  limitCents: number | null;
  level: BudgetLevel | null;
  share: number;
};

/** Gasto do mês por categoria principal (contas e cartões) com o limite, se houver. */
export async function getBudgetRows(supabase: SupabaseClient, month: string, categories: Category[]): Promise<BudgetRow[]> {
  const { from, to } = monthBounds(month);
  const [{ data: txs }, { data: budgets }] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount_cents, category_id")
      .eq("type", "expense")
      .eq("status", "paid")
      .gte("occurred_on", from)
      .lte("occurred_on", to),
    supabase.from("budgets").select("category_id, limit_cents").eq("month", `${month}-01`),
  ]);

  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id ?? c.id]));
  const spent = new Map<string, number>();
  for (const t of txs ?? []) {
    if (!t.category_id) continue;
    const root = parentOf.get(t.category_id as string);
    if (root) spent.set(root, (spent.get(root) ?? 0) + Number(t.amount_cents));
  }
  const limits = new Map((budgets ?? []).map((b) => [b.category_id as string, Number(b.limit_cents)]));

  return categories
    .filter((c) => c.kind === "expense" && !c.parent_id && (!c.archived || limits.has(c.id)))
    .map((c) => {
      const spentCents = spent.get(c.id) ?? 0;
      const limitCents = limits.get(c.id) ?? null;
      const st = limitCents ? budgetStatus(spentCents, limitCents) : null;
      return { category: c, spentCents, limitCents, level: st?.level ?? null, share: st?.share ?? 0 };
    })
    .sort((a, b) => (b.limitCents !== null ? 1 : 0) - (a.limitCents !== null ? 1 : 0) || b.spentCents - a.spentCents);
}
