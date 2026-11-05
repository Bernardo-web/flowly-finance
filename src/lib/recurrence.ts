/**
 * Datas de lançamentos recorrentes (salário, aluguel, assinaturas...).
 * - Vários dias por mês (ex.: 15 e 30).
 * - Dia que não existe no mês cai no último dia (30 em fevereiro -> 28/29).
 * - Fim de semana: antecipa para sexta, adia para segunda, ou mantém.
 * Feriados não são considerados.
 */
import { clampDate } from "./cards.ts";

export type WeekendRule = "previous_business_day" | "next_business_day" | "keep";

export type Occurrence = { nominal: string; date: string };

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function adjustForWeekend(iso: string, rule: WeekendRule): string {
  if (rule === "keep") return iso;
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = domingo, 6 = sábado
  if (dow !== 0 && dow !== 6) return iso;
  if (rule === "previous_business_day") return addDays(iso, dow === 6 ? -1 : -2);
  return addDays(iso, dow === 6 ? 2 : 1);
}

/** Ocorrências com data nominal entre `from` e `to` (inclusive), em ordem. */
export function occurrencesBetween(days: number[], rule: WeekendRule, from: string, to: string): Occurrence[] {
  if (from > to) return [];
  const out: Occurrence[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const sortedDays = [...new Set(days)].sort((a, b) => a - b);
  while (y < ty || (y === ty && m <= tm)) {
    const seen = new Set<string>();
    for (const d of sortedDays) {
      const nominal = clampDate(y, m, d);
      if (seen.has(nominal)) continue; // 30 e 31 em fevereiro viram o mesmo dia
      seen.add(nominal);
      if (nominal >= from && nominal <= to) out.push({ nominal, date: adjustForWeekend(nominal, rule) });
    }
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export type RecurrenceState = {
  days_of_month: number[];
  weekend_rule: WeekendRule;
  starts_on: string;
  ends_on: string | null;
  last_generated: string | null; // última data NOMINAL já processada
};

const MAX_CATCH_UP = 120;

/**
 * O que precisa ser lançado até hoje. Olha alguns dias à frente porque uma ocorrência
 * nominal de domingo antecipada para sexta já vence antes da data nominal.
 * Devolve as ocorrências e a nova "última data processada".
 */
export function dueOccurrences(r: RecurrenceState, today: string): { due: Occurrence[]; lastGenerated: string | null } {
  const from = r.last_generated && r.last_generated >= r.starts_on ? addDays(r.last_generated, 1) : r.starts_on;
  let to = addDays(today, 3);
  if (r.ends_on && r.ends_on < to) to = r.ends_on;
  const due: Occurrence[] = [];
  let lastGenerated = r.last_generated;
  for (const o of occurrencesBetween(r.days_of_month, r.weekend_rule, from, to)) {
    if (o.date > today || due.length >= MAX_CATCH_UP) break;
    due.push(o);
    lastGenerated = o.nominal;
  }
  return { due, lastGenerated };
}

/** Próximas ocorrências ainda não lançadas, para o painel ("vem aí"). */
export function upcomingOccurrences(r: RecurrenceState, today: string, horizonDays = 30): Occurrence[] {
  const from = r.last_generated && r.last_generated >= r.starts_on ? addDays(r.last_generated, 1) : r.starts_on;
  let to = addDays(today, horizonDays);
  if (r.ends_on && r.ends_on < to) to = r.ends_on;
  return occurrencesBetween(r.days_of_month, r.weekend_rule, from, to).filter((o) => o.date > today);
}
