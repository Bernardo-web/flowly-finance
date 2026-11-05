/** Datas sempre tratadas como "dia no calendário" (yyyy-mm-dd), no fuso de São Paulo. */

const TZ = "America/Sao_Paulo";

/** Hoje em São Paulo, "2026-11-05". */
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** "2026-11" a partir de uma data ISO. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Valida "yyyy-mm"; se inválido, devolve o mês atual. */
export function parseMonth(raw: string | null | undefined, now = new Date()): string {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return monthOf(todayIso(now));
}

/** Primeiro e último dia do mês "yyyy-mm". */
export function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

/** Soma meses: shiftMonth("2026-01", -1) === "2025-12". */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "novembro de 2026" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** "qui, 5 de nov." — para cabeçalhos de dia na lista de lançamentos. */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Data ISO válida e real (rejeita 31/02). */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** "Novembro de 2026" — para títulos (só a primeira letra maiúscula). */
export function monthTitle(ym: string): string {
  const s = monthLabel(ym);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "sex 13/11" — data curta para listas compactas. */
export function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(".", "");
  return `${wd} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
