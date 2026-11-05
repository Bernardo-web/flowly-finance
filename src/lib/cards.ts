/**
 * Regras de cartão de crédito.
 * Convenção dos bancos brasileiros: compras ATÉ a véspera do fechamento entram na fatura
 * que fecha naquele mês; compras NO dia do fechamento ou depois vão para a fatura seguinte.
 */

const pad = (n: number) => String(n).padStart(2, "0");

function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Data com o dia limitado ao último dia do mês (dia 31 em fevereiro vira 28/29). */
export function clampDate(y: number, m: number, day: number): string {
  // normaliza mês fora de 1..12
  const d0 = new Date(Date.UTC(y, m - 1, 1));
  const yy = d0.getUTCFullYear();
  const mm = d0.getUTCMonth() + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(day, lastDay(yy, mm)))}`;
}

function ym(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

export type Bill = { reference_month: string; closing_date: string; due_date: string };

/** Fatura cujo fechamento cai no mês (y, m). */
export function billOfMonth(y: number, m: number, closingDay: number, dueDay: number): Bill {
  const closing = clampDate(y, m, closingDay);
  const [cy, cm] = ym(closing);
  // vencimento depois do fechamento no mesmo mês, senão no mês seguinte
  const due = dueDay > closingDay ? clampDate(cy, cm, dueDay) : clampDate(cy, cm + 1, dueDay);
  return { reference_month: `${cy}-${pad(cm)}-01`, closing_date: closing, due_date: due };
}

/** Em qual fatura cai uma compra feita em `purchase`. */
export function billFor(purchase: string, closingDay: number, dueDay: number): Bill {
  const [y, m] = ym(purchase);
  const thisMonth = billOfMonth(y, m, closingDay, dueDay);
  return purchase < thisMonth.closing_date ? thisMonth : billOfMonth(y, m + 1, closingDay, dueDay);
}

/** Divide o total em n parcelas que somam exatamente o total (centavos de sobra na 1ª). */
export function splitInstallments(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? rest : 0));
}

export type Parcel = { number: number; amount_cents: number; occurred_on: string; bill: Bill };

/** Parcelas de uma compra: cada uma na fatura do mês seguinte à anterior. */
export function buildParcels(purchase: string, totalCents: number, n: number, closingDay: number, dueDay: number): Parcel[] {
  const first = billFor(purchase, closingDay, dueDay);
  const [by, bm] = ym(first.reference_month);
  const [py, pm, pd] = ym(purchase);
  return splitInstallments(totalCents, n).map((amount, i) => ({
    number: i + 1,
    amount_cents: amount,
    occurred_on: i === 0 ? purchase : clampDate(py, pm + i, pd),
    bill: billOfMonth(by, bm + i, closingDay, dueDay),
  }));
}

/** Fatura "atual" (a próxima a fechar) para mostrar no resumo do cartão. */
export function currentBill(today: string, closingDay: number, dueDay: number): Bill {
  return billFor(today, closingDay, dueDay);
}
