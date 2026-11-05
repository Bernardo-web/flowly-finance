import type { Metadata } from "next";
import Link from "next/link";
import { Pause, Play, Plus, Repeat } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { getAccounts } from "@/lib/data";
import { upcomingOccurrences, type WeekendRule } from "@/lib/recurrence";
import { syncRecurrences } from "@/lib/sync";
import { dayLabel, todayIso } from "@/lib/dates";
import { formatCents } from "@/lib/money/cents";
import { PageHeader } from "@/components/page-header";
import { setRecurrenceActive } from "./actions";

export const metadata: Metadata = { title: "Recorrências" };

const RULE_LABEL: Record<string, string> = {
  previous_business_day: "antecipa no fim de semana",
  next_business_day: "adia no fim de semana",
  keep: "mesmo no fim de semana",
};

export default async function RecurrencesPage() {
  const { supabase } = await getUser();
  await syncRecurrences(supabase);
  const today = todayIso();
  const [accounts, { data }] = await Promise.all([
    getAccounts(supabase, true),
    supabase
      .from("recurrences")
      .select("id, type, description, amount_cents, is_variable, days_of_month, weekend_rule, account_id, starts_on, ends_on, last_generated, active")
      .order("active", { ascending: false })
      .order("description"),
  ]);
  const recs = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recorrências"
        subtitle="Lançamentos que se repetem todo mês e entram sozinhos na data certa."
        action={<Link href="/recorrencias/nova" className="btn-primary"><Plus className="size-4" /> <span className="hidden sm:inline">Nova</span></Link>}
      />

      {recs.length === 0 ? (
        <section className="card flex flex-col items-center gap-3 p-8 text-center">
          <div className="rounded-full bg-brand-50 p-3 text-brand-700"><Repeat className="size-6" /></div>
          <h2 className="font-semibold">Nada recorrente ainda</h2>
          <p className="muted max-w-sm text-sm">Cadastre salário, aluguel, assinaturas. Valores que mudam todo mês entram como pendentes para você confirmar.</p>
          <Link href="/recorrencias/nova" className="btn-primary">Criar recorrência</Link>
        </section>
      ) : (
        <ul className="card divide-y divide-[var(--border)]">
          {recs.map((r) => {
            const next = r.active
              ? upcomingOccurrences(
                  {
                    days_of_month: r.days_of_month as number[],
                    weekend_rule: r.weekend_rule as WeekendRule,
                    starts_on: r.starts_on,
                    ends_on: r.ends_on,
                    last_generated: r.last_generated,
                  },
                  today,
                  62,
                )[0]
              : undefined;
            return (
              <li key={r.id} className={`flex items-center gap-3 px-4 py-3.5 ${r.active ? "" : "opacity-60"}`}>
                <Link href={`/recorrencias/${r.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.description}</p>
                  <p className="muted truncate text-xs">
                    Dia {(r.days_of_month as number[]).join(" e ")} · {RULE_LABEL[r.weekend_rule]} ·{" "}
                    {accounts.find((a) => a.id === r.account_id)?.name}
                  </p>
                  <p className="muted text-xs">
                    {r.active ? (next ? `Próximo: ${dayLabel(next.date)}` : "Sem próximas datas") : "Pausada"}
                  </p>
                </Link>
                <span className={`whitespace-nowrap text-sm font-semibold tabular-nums ${r.type === "income" ? "text-income" : "text-expense"}`}>
                  {r.is_variable ? (r.amount_cents ? `~${formatCents(Number(r.amount_cents))}` : "varia") : formatCents(Number(r.amount_cents))}
                </span>
                <form action={setRecurrenceActive}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="active" value={String(!r.active)} />
                  <button className="muted rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/5" aria-label={r.active ? "Pausar" : "Retomar"}>
                    {r.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
