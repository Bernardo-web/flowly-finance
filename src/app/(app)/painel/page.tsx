import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, ChevronRight, Clock, FileUp, Landmark, Wallet } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { getAccounts, getCategories } from "@/lib/data";
import { dayLabel, monthBounds, monthLabel, monthOf, todayIso } from "@/lib/dates";
import { formatCents } from "@/lib/money/cents";
import { spendingByCategory } from "@/lib/summary";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage() {
  const { supabase, user } = await getUser();
  const today = todayIso();
  const month = monthOf(today);
  const { from, to } = monthBounds(month);

  const [{ data: profile }, accounts, categories, { data: monthTx }, { data: recent }, { data: upcoming }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user!.id).single(),
    getAccounts(supabase),
    getCategories(supabase, true),
    supabase
      .from("transactions")
      .select("type, amount_cents, status, category_id")
      .gte("occurred_on", from)
      .lte("occurred_on", to),
    supabase
      .from("transactions")
      .select("id, type, amount_cents, occurred_on, description, status")
      .in("type", ["income", "expense"])
      .lte("occurred_on", today)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("transactions")
      .select("id, type, amount_cents, occurred_on, description")
      .eq("status", "pending")
      .order("occurred_on")
      .limit(5),
  ]);

  const txs = (monthTx ?? []).map((t) => ({ ...t, amount_cents: Number(t.amount_cents) }));
  const total = accounts.reduce((s, a) => s + a.balance_cents, 0);
  const income = txs.filter((t) => t.type === "income" && t.status === "paid").reduce((s, t) => s + t.amount_cents, 0);
  const expense = txs.filter((t) => t.type === "expense" && t.status === "paid").reduce((s, t) => s + t.amount_cents, 0);
  const spending = spendingByCategory(txs, categories);
  const firstName = (profile?.full_name ?? "").split(" ")[0];

  const tiles = [
    { label: "Saldo em contas", value: total, icon: Wallet, tone: total < 0 ? "text-expense" : "", href: "/contas" },
    { label: "Receitas do mês", value: income, icon: ArrowUpCircle, tone: "text-income", href: `/lancamentos?mes=${month}` },
    { label: "Despesas do mês", value: expense, icon: ArrowDownCircle, tone: "text-expense", href: `/lancamentos?mes=${month}` },
  ];

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Olá{firstName ? `, ${firstName}` : ""}!</h1>
        <section className="card flex flex-col items-center gap-3 p-8 text-center">
          <div className="rounded-full bg-brand-50 p-3 text-brand-700"><Landmark className="size-6" /></div>
          <h2 className="font-semibold">Vamos começar</h2>
          <p className="muted max-w-sm text-sm">
            Cadastre a conta do seu banco. Depois é só lançar os gastos ou importar o extrato.
          </p>
          <Link href="/contas/nova" className="btn-primary">Criar primeira conta</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="muted text-sm capitalize">{monthLabel(month)}</p>
        <h1 className="text-2xl font-bold tracking-tight">Olá{firstName ? `, ${firstName}` : ""}!</h1>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {tiles.map(({ label, value, icon: Icon, tone, href }) => (
          <Link key={label} href={href} className="card p-4 transition hover:border-brand-500">
            <div className="muted flex items-center gap-2 text-sm">
              <Icon className={`size-4 ${tone}`} /> {label}
            </div>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{formatCents(value)}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Para onde foi o dinheiro</h2>
          {spending.length === 0 ? (
            <p className="muted text-sm">Nenhuma despesa paga neste mês ainda.</p>
          ) : (
            <ul className="space-y-3">
              {spending.map((s) => (
                <li key={s.id ?? s.name}>
                  <Link
                    href={s.id ? `/lancamentos?mes=${month}&categoria=${s.id}` : `/lancamentos?mes=${month}`}
                    className="block"
                  >
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{s.name}</span>
                      <span className="tabular-nums">
                        {formatCents(s.cents)} <span className="muted text-xs">{Math.round(s.share * 100)}%</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(s.share * 100, 2)}%`, background: s.color }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          {(upcoming ?? []).length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                <Clock className="size-4 text-amber-600" /> Pendentes
              </h2>
              <ul className="space-y-2">
                {(upcoming ?? []).map((t) => (
                  <li key={t.id}>
                    <Link href={`/lancamentos/${t.id}`} className="flex items-center gap-3 text-sm">
                      <span className="muted w-20 shrink-0 text-xs">{dayLabel(t.occurred_on)}</span>
                      <span className="flex-1 truncate">{t.description}</span>
                      <span className={`tabular-nums ${t.type === "income" ? "text-income" : "text-expense"}`}>
                        {formatCents(Number(t.amount_cents))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Últimos lançamentos</h2>
              <Link href="/lancamentos" className="flex items-center text-sm text-brand-700">
                Ver todos <ChevronRight className="size-4" />
              </Link>
            </div>
            {(recent ?? []).length === 0 ? (
              <div className="space-y-3 text-sm">
                <p className="muted">Nenhum lançamento ainda.</p>
                <Link href="/importar" className="btn-ghost"><FileUp className="size-4" /> Importar extrato do BB</Link>
              </div>
            ) : (
              <ul className="space-y-2">
                {(recent ?? []).map((t) => (
                  <li key={t.id}>
                    <Link href={`/lancamentos/${t.id}`} className="flex items-center gap-3 text-sm">
                      <span className="muted w-20 shrink-0 text-xs">{dayLabel(t.occurred_on)}</span>
                      <span className="flex-1 truncate">{t.description}</span>
                      <span className={`tabular-nums ${t.status === "pending" ? "muted" : t.type === "income" ? "text-income" : "text-expense"}`}>
                        {t.type === "income" ? "+" : "−"} {formatCents(Number(t.amount_cents))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
