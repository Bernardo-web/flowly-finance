import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarClock,
  ChevronRight,
  CreditCard,
  FileUp,
  Landmark,
  Repeat,
  Wallet,
} from "lucide-react";
import { getProfile, getUser } from "@/lib/supabase/server";
import { getAccounts, getCards, getCategories } from "@/lib/data";
import { getBudgetRows } from "@/lib/budgets";
import { syncRecurrences } from "@/lib/sync";
import { upcomingOccurrences, type WeekendRule } from "@/lib/recurrence";
import { shortDay, monthBounds, monthTitle, monthOf, todayIso } from "@/lib/dates";
import { formatCents } from "@/lib/money/cents";
import { spendingByCategory } from "@/lib/summary";

export const metadata: Metadata = { title: "Painel" };

type Upcoming = {
  key: string;
  date: string;
  label: string;
  cents: number | null;
  tone: "income" | "expense";
  href: string;
  icon: "pending" | "recurrence" | "bill";
  overdue?: boolean;
};

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const { supabase } = await getUser();
  await syncRecurrences(supabase);

  const today = todayIso();
  const in30 = addDays(today, 30);
  const month = monthOf(today);
  const { from, to } = monthBounds(month);

  const [{ data: profile }, accounts, cards, categories, { data: monthTx }, { data: recent }, { data: pending }, { data: recs }, { data: bills }] =
    await Promise.all([
      getProfile().then((data) => ({ data })),
      getAccounts(supabase),
      getCards(supabase),
      getCategories(supabase, true),
      supabase.from("transactions").select("type, amount_cents, status, category_id").gte("occurred_on", from).lte("occurred_on", to),
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
        .lte("occurred_on", in30)
        .order("occurred_on")
        .limit(20),
      supabase
        .from("recurrences")
        .select("id, type, description, amount_cents, is_variable, days_of_month, weekend_rule, starts_on, ends_on, last_generated")
        .eq("active", true),
      supabase
        .from("card_bill_totals")
        .select("bill_id, card_id, reference_month, due_date, status, balance_cents")
        .neq("status", "paid")
        .gt("balance_cents", 0)
        .lte("due_date", in30)
        .order("due_date"),
    ]);
  const budgets = await getBudgetRows(supabase, month, categories);

  const txs = (monthTx ?? []).map((t) => ({ ...t, amount_cents: Number(t.amount_cents) }));
  const total = accounts.reduce((s, a) => s + a.balance_cents, 0);
  const income = txs.filter((t) => t.type === "income" && t.status === "paid").reduce((s, t) => s + t.amount_cents, 0);
  const expense = txs.filter((t) => t.type === "expense" && t.status === "paid").reduce((s, t) => s + t.amount_cents, 0);
  const spending = spendingByCategory(txs, categories);
  const alerts = budgets.filter((b) => b.level === "warning" || b.level === "over");
  const firstName = (profile?.full_name ?? "").split(" ")[0];

  // "Vem aí": pendentes, recorrências dos próximos 30 dias e faturas a vencer
  const upcoming: Upcoming[] = [
    ...(pending ?? []).map((t) => ({
      key: `p-${t.id}`,
      date: t.occurred_on,
      label: t.description,
      cents: Number(t.amount_cents) > 1 ? Number(t.amount_cents) : null,
      tone: (t.type === "income" ? "income" : "expense") as Upcoming["tone"],
      href: `/lancamentos/${t.id}`,
      icon: "pending" as const,
      overdue: t.occurred_on < today,
    })),
    ...(recs ?? []).flatMap((r) =>
      upcomingOccurrences(
        {
          days_of_month: r.days_of_month as number[],
          weekend_rule: r.weekend_rule as WeekendRule,
          starts_on: r.starts_on,
          ends_on: r.ends_on,
          last_generated: r.last_generated,
        },
        today,
        30,
      ).map((o) => ({
        key: `r-${r.id}-${o.nominal}`,
        date: o.date,
        label: r.description,
        cents: r.amount_cents ? Number(r.amount_cents) : null,
        tone: (r.type === "income" ? "income" : "expense") as Upcoming["tone"],
        href: `/recorrencias/${r.id}`,
        icon: "recurrence" as const,
      })),
    ),
    ...(bills ?? []).map((b) => ({
      key: `b-${b.bill_id}`,
      date: b.due_date,
      label: `Fatura ${cards.find((c) => c.id === b.card_id)?.name ?? "do cartão"}`,
      cents: Number(b.balance_cents),
      tone: "expense" as const,
      href: `/cartoes/${b.card_id}?fatura=${String(b.reference_month).slice(0, 7)}`,
      icon: "bill" as const,
      overdue: b.due_date < today,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 8);

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Olá{firstName ? `, ${firstName}` : ""}!</h1>
        <section className="card flex flex-col items-center gap-3 p-8 text-center">
          <div className="rounded-full bg-brand-50 p-3 text-brand-700"><Landmark className="size-6" /></div>
          <h2 className="font-semibold">Vamos começar</h2>
          <p className="muted max-w-sm text-sm">
            Cadastre a conta do seu banco. Depois é só lançar os gastos, importar o extrato e cadastrar seu salário em Recorrências.
          </p>
          <Link href="/contas/nova" className="btn-primary">Criar primeira conta</Link>
        </section>
      </div>
    );
  }

  const tiles = [
    { label: "Saldo em contas", value: total, icon: Wallet, tone: total < 0 ? "text-expense" : "", href: "/contas" },
    { label: "Receitas do mês", value: income, icon: ArrowUpCircle, tone: "text-income", href: `/lancamentos?mes=${month}` },
    { label: "Despesas do mês", value: expense, icon: ArrowDownCircle, tone: "text-expense", href: `/lancamentos?mes=${month}` },
  ];
  const ICONS = { pending: CalendarClock, recurrence: Repeat, bill: CreditCard };

  return (
    <div className="space-y-6">
      <header>
        <p className="muted text-sm">{monthTitle(month)}</p>
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

      {alerts.length > 0 && (
        <section className="card space-y-2 border-amber-300 p-4 dark:border-amber-800">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4 text-amber-600" /> Orçamentos
          </h2>
          <ul className="space-y-1.5 text-sm">
            {alerts.map((b) => (
              <li key={b.category.id}>
                <Link href={`/orcamentos?mes=${month}`} className="flex justify-between gap-2">
                  <span>{b.category.name}</span>
                  <span className={b.level === "over" ? "font-medium text-expense" : "text-amber-700 dark:text-amber-400"}>
                    {b.level === "over"
                      ? `estourou ${formatCents(b.spentCents - (b.limitCents ?? 0))}`
                      : `${Math.round(b.share * 100)}% usado`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Para onde foi o dinheiro</h2>
          {spending.length === 0 ? (
            <p className="muted text-sm">Nenhuma despesa paga neste mês ainda.</p>
          ) : (
            <ul className="space-y-3">
              {spending.map((s) => (
                <li key={s.id ?? s.name}>
                  <Link href={s.id ? `/lancamentos?mes=${month}&categoria=${s.id}` : `/lancamentos?mes=${month}`} className="block">
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
          {upcoming.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Próximos 30 dias</h2>
              <ul className="space-y-2.5">
                {upcoming.map((u) => {
                  const Icon = ICONS[u.icon];
                  return (
                    <li key={u.key}>
                      <Link href={u.href} className="flex items-center gap-3 text-sm">
                        <Icon className={`size-4 shrink-0 ${u.overdue ? "text-expense" : "muted"}`} />
                        <span className={`w-16 shrink-0 text-xs tabular-nums ${u.overdue ? "font-medium text-expense" : "muted"}`}>
                          {u.overdue ? "atrasado" : shortDay(u.date)}
                        </span>
                        <span className="flex-1 truncate">{u.label}</span>
                        <span className={`tabular-nums ${u.tone === "income" ? "text-income" : "text-expense"}`}>
                          {u.cents === null ? "a confirmar" : formatCents(u.cents)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
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
                <Link href="/importar" className="btn-ghost"><FileUp className="size-4" /> Importar extrato</Link>
              </div>
            ) : (
              <ul className="space-y-2">
                {(recent ?? []).map((t) => (
                  <li key={t.id}>
                    <Link href={`/lancamentos/${t.id}`} className="flex items-center gap-3 text-sm">
                      <span className="muted w-16 shrink-0 text-xs tabular-nums">{shortDay(t.occurred_on)}</span>
                      <span className="flex-1 truncate">{t.description}</span>
                      <span className={`tabular-nums ${t.status === "pending" ? "muted" : t.type === "income" ? "text-income" : "text-expense"}`}>
                        {t.status === "pending" && Number(t.amount_cents) <= 1
                          ? "a confirmar"
                          : `${t.type === "income" ? "+" : "−"} ${formatCents(Number(t.amount_cents))}`}
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
