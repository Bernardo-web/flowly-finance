import type { Metadata } from "next";
import { ArrowDownCircle, ArrowUpCircle, Landmark, Wallet } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money/cents";

export const metadata: Metadata = { title: "Painel" };

function monthBounds(now = new Date()) {
  // datas no fuso de São Paulo, para o "mês atual" bater com o do usuário
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(last)}`,
    label: new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, 1)),
    ),
  };
}

export default async function DashboardPage() {
  const { supabase, user } = await getUser();
  const month = monthBounds();

  const [{ data: profile }, { data: balances }, { data: monthTx }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user!.id).single(),
    supabase.from("account_balances").select("balance_cents"),
    supabase
      .from("transactions")
      .select("type, amount_cents")
      .eq("status", "paid")
      .in("type", ["income", "expense"])
      .gte("occurred_on", month.from)
      .lte("occurred_on", month.to),
  ]);

  const total = (balances ?? []).reduce((s, b) => s + Number(b.balance_cents), 0);
  const income = (monthTx ?? []).filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount_cents), 0);
  const expense = (monthTx ?? []).filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount_cents), 0);
  const firstName = (profile?.full_name ?? "").split(" ")[0];
  const hasAccounts = (balances ?? []).length > 0;

  const tiles = [
    { label: "Saldo em contas", value: total, icon: Wallet, tone: "" },
    { label: "Receitas do mês", value: income, icon: ArrowUpCircle, tone: "text-income" },
    { label: "Despesas do mês", value: expense, icon: ArrowDownCircle, tone: "text-expense" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="muted text-sm capitalize">{month.label}</p>
        <h1 className="text-2xl font-bold tracking-tight">Olá{firstName ? `, ${firstName}` : ""}!</h1>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {tiles.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="card p-4">
            <div className="muted flex items-center gap-2 text-sm">
              <Icon className={`size-4 ${tone}`} /> {label}
            </div>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{formatCents(value)}</p>
          </div>
        ))}
      </section>

      {!hasAccounts && (
        <section className="card flex flex-col items-center gap-3 p-8 text-center">
          <div className="rounded-full bg-brand-50 p-3 text-brand-700">
            <Landmark className="size-6" />
          </div>
          <h2 className="font-semibold">Comece cadastrando suas contas</h2>
          <p className="muted max-w-sm text-sm">
            Em breve você vai poder criar suas contas, lançar gastos e importar o extrato do banco por aqui.
          </p>
        </section>
      )}
    </div>
  );
}
