import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { categoryPath, getAccounts, getCategories } from "@/lib/data";
import { billOfMonth, currentBill } from "@/lib/cards";
import { dayLabel, monthLabel, shiftMonth, todayIso } from "@/lib/dates";
import { formatCents } from "@/lib/money/cents";
import { isUuid } from "@/lib/validation";
import { PageHeader } from "@/components/page-header";
import { payBill } from "../actions";
import { PayBillForm } from "./pay-form";

export const metadata: Metadata = { title: "Fatura" };

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fatura?: string }>;
}) {
  const { id } = await params;
  const { fatura } = await searchParams;
  if (!isUuid(id)) notFound();
  const { supabase } = await getUser();

  const { data: card } = await supabase
    .from("credit_cards")
    .select("id, name, limit_cents, closing_day, due_day, color")
    .eq("id", id)
    .maybeSingle();
  if (!card) notFound();

  const today = todayIso();
  const current = currentBill(today, card.closing_day, card.due_day);
  const month = fatura && /^\d{4}-(0[1-9]|1[0-2])$/.test(fatura) ? fatura : current.reference_month.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const expected = billOfMonth(y, m, card.closing_day, card.due_day);

  const { data: bill } = await supabase
    .from("card_bill_totals")
    .select("bill_id, due_date, status, charges_cents, credits_cents, payments_cents, balance_cents")
    .eq("card_id", id)
    .eq("reference_month", `${month}-01`)
    .maybeSingle();

  const [accounts, categories, { data: txs }] = await Promise.all([
    getAccounts(supabase),
    getCategories(supabase, true),
    bill
      ? supabase
          .from("transactions")
          .select("id, type, amount_cents, occurred_on, description, category_id")
          .eq("card_bill_id", bill.bill_id)
          .order("occurred_on", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; type: string; amount_cents: number; occurred_on: string; description: string; category_id: string | null }[] }),
  ]);

  const balance = Number(bill?.balance_cents ?? 0);
  const dueDate = bill?.due_date ?? expected.due_date;
  const closed = today >= expected.closing_date;
  const status = bill?.status === "paid" || (bill && balance <= 0 && Number(bill.charges_cents) > 0)
    ? "Paga"
    : closed ? (today > dueDate ? "Vencida" : "Fechada") : "Aberta";
  const statusTone = status === "Paga" ? "text-income" : status === "Vencida" ? "text-expense" : "muted";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title={card.name}
        back="/cartoes"
        action={<Link href={`/cartoes/${id}/editar`} className="btn-ghost px-2.5" aria-label="Editar cartão"><Pencil className="size-4" /></Link>}
      />

      <div className="card flex items-center justify-between p-2">
        <Link href={`/cartoes/${id}?fatura=${shiftMonth(month, -1)}`} className="btn-ghost border-0 p-2" aria-label="Fatura anterior">
          <ChevronLeft className="size-5" />
        </Link>
        <span className="font-semibold">Fatura de {monthLabel(month)}</span>
        <Link href={`/cartoes/${id}?fatura=${shiftMonth(month, 1)}`} className="btn-ghost border-0 p-2" aria-label="Próxima fatura">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <section className="card space-y-1 p-5">
        <p className={`text-sm font-medium ${statusTone}`}>{status}</p>
        <p className="text-3xl font-bold tabular-nums">{formatCents(Math.max(balance, 0))}</p>
        <p className="muted text-sm">
          Fecha {dayLabel(expected.closing_date)} · vence {dayLabel(dueDate)}
        </p>
        {bill && Number(bill.payments_cents) > 0 && (
          <p className="muted text-sm">
            Compras {formatCents(Number(bill.charges_cents))} · pago {formatCents(Number(bill.payments_cents))}
          </p>
        )}
      </section>

      {bill && balance > 0 && (
        <details className="card p-5" open={status !== "Aberta"}>
          <summary className="cursor-pointer font-semibold">
            Pagar fatura{status === "Aberta" && <span className="muted text-sm font-normal"> · ainda aberta</span>}
          </summary>
          <div className="mt-4">
          <PayBillForm
            action={payBill.bind(null, bill.bill_id, `/cartoes/${id}?fatura=${month}`)}
            accounts={accounts.map(({ id, name }) => ({ id, name }))}
            amount={(balance / 100).toFixed(2).replace(".", ",")}
            today={today}
          />
          </div>
        </details>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Compras</h2>
          <Link href={`/lancamentos/novo?conta=card:${id}`} className="text-sm text-brand-700">+ Nova compra</Link>
        </div>
        {(txs ?? []).length === 0 ? (
          <p className="card muted p-6 text-center text-sm">Nenhuma compra nesta fatura.</p>
        ) : (
          <ul className="card divide-y divide-[var(--border)]">
            {(txs ?? []).map((t) => (
              <li key={t.id}>
                <Link href={`/lancamentos/${t.id}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.description}</p>
                    <p className="muted truncate text-xs">
                      {dayLabel(t.occurred_on)} · {t.type === "transfer_in" ? "Pagamento" : categoryPath(categories, t.category_id) ?? "Sem categoria"}
                    </p>
                  </div>
                  <span className={`tabular-nums ${t.type === "expense" ? "" : "text-income"}`}>
                    {t.type === "expense" ? "" : "− "}{formatCents(Number(t.amount_cents))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
