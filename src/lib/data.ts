import type { SupabaseClient } from "@supabase/supabase-js";

export type Category = {
  id: string;
  parent_id: string | null;
  kind: "income" | "expense";
  name: string;
  slug: string | null;
  color: string;
  archived: boolean;
};

export type Account = {
  id: string;
  name: string;
  kind: string;
  initial_balance_cents: number;
  color: string;
  archived: boolean;
  balance_cents: number;
};

export async function getCategories(supabase: SupabaseClient, includeArchived = false): Promise<Category[]> {
  let q = supabase.from("categories").select("id, parent_id, kind, name, slug, color, archived").order("name");
  if (!includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data ?? []) as Category[];
}

export async function getAccounts(supabase: SupabaseClient, includeArchived = false): Promise<Account[]> {
  let q = supabase.from("accounts").select("id, name, kind, initial_balance_cents, color, archived").order("created_at");
  if (!includeArchived) q = q.eq("archived", false);
  const [{ data: accounts }, { data: balances }] = await Promise.all([
    q,
    supabase.from("account_balances").select("account_id, balance_cents"),
  ]);
  const byId = new Map((balances ?? []).map((b) => [b.account_id as string, Number(b.balance_cents)]));
  return (accounts ?? []).map((a) => ({
    ...(a as Omit<Account, "balance_cents">),
    initial_balance_cents: Number(a.initial_balance_cents),
    balance_cents: byId.get(a.id as string) ?? Number(a.initial_balance_cents),
  }));
}

/** Categorias em ordem de árvore: pai, depois os filhos (para selects e listas). */
export function categoryTree(categories: Category[], kind?: "income" | "expense") {
  const list = kind ? categories.filter((c) => c.kind === kind) : categories;
  const parents = list.filter((c) => !c.parent_id || !list.some((p) => p.id === c.parent_id));
  return parents.map((p) => ({ ...p, children: list.filter((c) => c.parent_id === p.id) }));
}

/** Nome completo: "Alimentação › Mercado". */
export function categoryPath(categories: Category[], id: string | null): string | null {
  if (!id) return null;
  const c = categories.find((x) => x.id === id);
  if (!c) return null;
  const parent = c.parent_id ? categories.find((x) => x.id === c.parent_id) : null;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}
