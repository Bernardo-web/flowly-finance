import type { SupabaseClient } from "@supabase/supabase-js";
import { dueOccurrences, type WeekendRule } from "./recurrence.ts";
import { todayIso } from "./dates.ts";

/**
 * Lança as recorrências que já venceram (salário, aluguel...). Roda quando o usuário
 * abre o painel ou os lançamentos — sem precisar de tarefa agendada no servidor.
 * O banco impede duplicar a mesma data, então rodar duas vezes não causa problema.
 */
export async function syncRecurrences(supabase: SupabaseClient): Promise<void> {
  const today = todayIso();
  const { data: recs } = await supabase
    .from("recurrences")
    .select("id, days_of_month, weekend_rule, starts_on, ends_on, last_generated")
    .eq("active", true)
    .lte("starts_on", today);
  if (!recs?.length) return;

  await Promise.all(
    recs.map(async (r) => {
      const { due, lastGenerated } = dueOccurrences(
        {
          days_of_month: r.days_of_month as number[],
          weekend_rule: r.weekend_rule as WeekendRule,
          starts_on: r.starts_on as string,
          ends_on: (r.ends_on as string | null) ?? null,
          last_generated: (r.last_generated as string | null) ?? null,
        },
        today,
      );
      if (due.length === 0 || !lastGenerated) return;
      await supabase.rpc("generate_recurrence_rows", {
        p_recurrence_id: r.id,
        p_last_generated: lastGenerated,
        p_rows: due.map((o) => ({ occurred_on: o.date })),
      });
    }),
  );
}
