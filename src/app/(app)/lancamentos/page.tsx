import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Clock, Plus, Search } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { categoryPath, getAccounts, getCards, getCategories } from "@/lib/data";
import { dayLabel, monthBounds, monthTitle, parseMonth, shiftMonth } from "@/lib/dates";
import { formatCents } from "@/lib/money/cents";
import { isUuid } from "@/lib/validation";
import { PageHeader } from "@/components/page-header";
import { markPaid } from "./actions";
import { syncRecurrences } from "@/lib/sync";

export const metadata: Metadata = { title: "Lançamentos" };

type Search = Promise<{ mes?: string; conta?: string; categoria?: string; q?: string; status?: string }>;

type Tx = {
  id: string;
  type: "income" | "expense" | "transfer_in" | "transfer_out" | "adjustment_in" | "adjustment_out";
  amount_cents: number;
  occurred_on: string;
  description: string;
  status: "paid" | "pending";
  account_id: string | null;
  card_bill_id: string | null;
  category_id: string | null;
};

export default async function TransactionsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const month = parseMonth(sp.mes);
  const { from, to } = monthBounds(month);
  const accountId = isUuid(sp.conta) ? sp.conta : undefined;
  const categoryId = isUuid(sp.categoria) ? sp.categoria : undefined;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const status = sp.status === "pending" ? "pending" : undefined;

  const { supabase } = await getUser();
  await syncRecurrences(supabase);
  const [accounts, cards, categories] = await Promise.all([getAccounts(supabase, true), getCards(supabase, true), getCategories(supabase, true)]);

  let query = supabase
    .from("transactions")
    .select("id, type, amount_cents, occurred_on, description, status, account_id, card_bill_id, category_id")
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (accountId) query = query.eq("account_id", accountId);
  if (categoryId) {
    const childIds = categories.filter((c) => c.parent_id === categoryId).map((c) => c.id);
    query = query.in("category_id", [categoryId, ...childIds]);
  }
  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("description", `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  const { data } = await query;
  const txs = (data ?? []).map((t) => ({ ...t, amount_cents: Number(t.amount_cents) })) as Tx[];

  const income = txs.filter((t) => t.type === "income" && t.status === "paid").reduce((s, t) => s + t.amount_cents, 0);
  const expense = txs.filter((t) => t.type === "expense" && t.status === "paid").reduce((s, t) => s + t.amount_cents, 0);
  const pendingCount = txs.filter((t) => t.status === "pending").length;

  const byDay = new Map<string, Tx[]>();
  for (const t of txs) byDay.set(t.occurred_on, [...(byDay.get(t.occurred_on) ?? []), t]);

  // compras no cartão: descobre o cartão pela fatura
  const billIds = [...new Set(txs.map((t) => t.card_bill_id).filter(Boolean))] as string[];
  const { data: bills } = billIds.length
    ? await supabase.from("card_bills").select("id, card_id").in("id", billIds)
    : { data: [] as { id: string; card_id: string }[] };
  const placeName = (t: Tx) => {
    if (t.card_bill_id) {
      const cardId = bills?.find((b) => b.id === t.card_bill_id)?.card_id;
      return cards.find((c) => c.id === cardId)?.name ?? "Cartão";
    }
    return accounts.find((a) => a.id === t.account_id)?.name ?? "";
  };
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const all = { mes: month, conta: accountId, categoria: categoryId, q: q || undefined, status, ...extra };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    return `/lancamentos?${p}`;
  };
  const filtered = Boolean(accountId || categoryId || q || status);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lançamentos"
        action={
          <Link href={`/lancamentos/novo${accountId ? `?conta=${accountId}` : ""}`} className="btn-primary hidden md:inline-flex">
            <Plus className="size-4" /> Novo
          </Link>
        }
      />

      {/* mês */}
      <div className="card flex items-center justify-between p-2">
        <Link href={keep({ mes: shiftMonth(month, -1) })} className="btn-ghost border-0 p-2" aria-label="Mês anterior">
          <ChevronLeft className="size-5" />
        </Link>
        <span className="font-semibold">{monthTitle(month)}</span>
        <Link href={keep({ mes: shiftMonth(month, 1) })} className="btn-ghost border-0 p-2" aria-label="Próximo mês">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      {/* resumo */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card p-3">
          <p className="muted text-xs">Receitas</p>
          <p className="font-semibold tabular-nums text-income">{formatCents(income)}</p>
        </div>
        <div className="card p-3">
          <p className="muted text-xs">Despesas</p>
          <p className="font-semibold tabular-nums text-expense">{formatCents(expense)}</p>
        </div>
        <div className="card p-3">
          <p className="muted text-xs">Resultado</p>
          <p className={`font-semibold tabular-nums ${income - expense < 0 ? "text-expense" : ""}`}>{formatCents(income - expense)}</p>
        </div>
      </div>

      {/* filtros */}
      <details className="card p-4" open={filtered}>
        <summary className="cursor-pointer text-sm font-medium">
          Filtros {filtered && <span className="muted">(ativos)</span>}
          {pendingCount > 0 && !status && <span className="muted"> · {pendingCount} pendente(s)</span>}
        </summary>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" action="/lancamentos">
          <input type="hidden" name="mes" value={month} />
          <div className="relative sm:col-span-2">
            <Search className="muted pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <input className="input pl-9" name="q" defaultValue={q} placeholder="Buscar pela descrição" />
          </div>
          <select className="input" name="conta" defaultValue={accountId ?? ""}>
            <option value="">Todas as contas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="input" name="categoria" defaultValue={categoryId ?? ""}>
            <option value="">Todas as categorias</option>
            {categories.filter((c) => !c.parent_id).map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.kind === "income" ? " (receita)" : ""}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="status" value="pending" defaultChecked={Boolean(status)} className="size-4" />
            Só pendentes
          </label>
          <div className="flex gap-2 sm:justify-end">
            {filtered && <Link href={`/lancamentos?mes=${month}`} className="btn-ghost">Limpar</Link>}
            <button className="btn-primary">Aplicar</button>
          </div>
        </form>
      </details>

      {/* lista */}
      {txs.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-medium">Nada por aqui{filtered ? " com esses filtros" : " neste mês"}.</p>
          <p className="muted mt-1 text-sm">
            Use o botão <strong>+</strong> para lançar ou <Link href="/importar" className="text-brand-700 underline">importe o extrato</Link>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="muted mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide">{dayLabel(day)}</h2>
              <ul className="card divide-y divide-[var(--border)]">
                {list.map((t) => {
                  // transferências e ajustes de saldo mexem no saldo, mas não são receita nem despesa
                  const isTransfer = t.type.startsWith("transfer") || t.type.startsWith("adjustment");
                  const isAdjust = t.type.startsWith("adjustment");
                  const positive = t.type === "income" || t.type === "transfer_in" || t.type === "adjustment_in";
                  const cat = categoryPath(categories, t.category_id);
                  const color = categories.find((c) => c.id === t.category_id)?.color ?? "#94a3b8";
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <Link href={`/lancamentos/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        {isTransfer ? (
                          <ArrowLeftRight className="muted size-4 shrink-0" />
                        ) : (
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{t.description}</p>
                          <p className="muted truncate text-xs">
                            {isAdjust ? "Correção do saldo" : isTransfer ? (positive ? "Entrada de transferência" : "Saída de transferência") : cat ?? "Sem categoria"}
                            {" · "}
                            {placeName(t)}
                          </p>
                        </div>
                        <span
                          className={`whitespace-nowrap font-semibold tabular-nums ${
                            t.status === "pending" ? "muted" : isTransfer ? "" : positive ? "text-income" : "text-expense"
                          }`}
                        >
                          {t.status === "pending" && t.amount_cents <= 1 ? "a confirmar" : `${positive ? "+" : "−"} ${formatCents(t.amount_cents)}`}
                        </span>
                      </Link>
                      {t.status === "pending" && t.amount_cents <= 1 && (
                        <Link href={`/lancamentos/${t.id}`} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium">
                          Informar valor
                        </Link>
                      )}
                      {t.status === "pending" && t.amount_cents > 1 && (
                        <form action={markPaid}>
                          <input type="hidden" name="id" value={t.id} />
                          <button
                            className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium"
                            title="Marcar como pago"
                          >
                            <Clock className="size-3.5 text-amber-600" />
                            <Check className="size-3.5" />
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {txs.length === 1000 && <p className="muted text-center text-xs">Mostrando os 1000 mais recentes do mês.</p>}
        </div>
      )}
    </div>
  );
}
