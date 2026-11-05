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

export type Card = {
  id: string;
  name: string;
  limit_cents: number;
  closing_day: number;
  due_day: number;
  color: string;
  archived: boolean;
  open_cents: number; // tudo o que ainda não foi pago, em todas as faturas (limite usado)
};

export async function getCards(supabase: SupabaseClient, includeArchived = false): Promise<Card[]> {
  let q = supabase.from("credit_cards").select("id, name, limit_cents, closing_day, due_day, color, archived").order("created_at");
  if (!includeArchived) q = q.eq("archived", false);
  const [{ data: cards }, { data: bills }] = await Promise.all([
    q,
    supabase.from("card_bill_totals").select("card_id, balance_cents"),
  ]);
  const open = new Map<string, number>();
  for (const b of bills ?? []) open.set(b.card_id as string, (open.get(b.card_id as string) ?? 0) + Math.max(0, Number(b.balance_cents)));
  return (cards ?? []).map((c) => ({
    ...(c as Omit<Card, "open_cents" | "limit_cents">),
    limit_cents: Number(c.limit_cents),
    open_cents: open.get(c.id as string) ?? 0,
  }));
}

/**
 * Busca todas as linhas, de 1000 em 1000 (o Supabase limita cada resposta a 1000 linhas).
 * `build` recebe o intervalo e devolve a consulta já com filtros e ordenação estável.
 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  max = 50_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
