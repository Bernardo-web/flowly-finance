import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CreditCard, Plus } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { getCards } from "@/lib/data";
import { currentBill } from "@/lib/cards";
import { dayLabel, todayIso } from "@/lib/dates";
import { formatCents } from "@/lib/money/cents";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Cartões" };

export default async function CardsPage() {
  const { supabase } = await getUser();
  const cards = await getCards(supabase, true);
  const today = todayIso();

  // total da fatura atual de cada cartão
  const { data: bills } = await supabase.from("card_bill_totals").select("card_id, reference_month, balance_cents");
  const billTotal = (cardId: string, ref: string) =>
    Number(bills?.find((b) => b.card_id === cardId && b.reference_month === ref)?.balance_cents ?? 0);

  const active = cards.filter((c) => !c.archived);
  const archived = cards.filter((c) => c.archived);

  const item = (c: (typeof cards)[number]) => {
    const bill = currentBill(today, c.closing_day, c.due_day);
    const used = c.limit_cents > 0 ? Math.min(c.open_cents / c.limit_cents, 1) : 0;
    return (
      <li key={c.id}>
        <Link href={`/cartoes/${c.id}`} className="block space-y-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg text-white" style={{ background: c.color }}>
              <CreditCard className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{c.name}</p>
              <p className="muted text-xs">Fatura atual · vence {dayLabel(bill.due_date)}</p>
            </div>
            <span className="font-semibold tabular-nums">{formatCents(billTotal(c.id, bill.reference_month))}</span>
            <ChevronRight className="muted size-4" />
          </div>
          {c.limit_cents > 0 && (
            <div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${used * 100}%`, background: c.color }} />
              </div>
              <p className="muted mt-1 text-xs">
                Limite disponível: {formatCents(Math.max(c.limit_cents - c.open_cents, 0))} de {formatCents(c.limit_cents)}
              </p>
            </div>
          )}
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartões"
        action={<Link href="/cartoes/novo" className="btn-primary"><Plus className="size-4" /> <span className="hidden sm:inline">Novo cartão</span></Link>}
      />
      {active.length === 0 ? (
        <section className="card flex flex-col items-center gap-3 p-8 text-center">
          <div className="rounded-full bg-brand-50 p-3 text-brand-700"><CreditCard className="size-6" /></div>
          <h2 className="font-semibold">Nenhum cartão cadastrado</h2>
          <p className="muted max-w-sm text-sm">Cadastre seu cartão de crédito para acompanhar a fatura e as compras parceladas.</p>
          <Link href="/cartoes/novo" className="btn-primary">Cadastrar cartão</Link>
        </section>
      ) : (
        <ul className="card divide-y divide-[var(--border)]">{active.map(item)}</ul>
      )}
      {archived.length > 0 && (
        <details>
          <summary className="muted cursor-pointer text-sm">Arquivados ({archived.length})</summary>
          <ul className="card mt-2 divide-y divide-[var(--border)] opacity-70">{archived.map(item)}</ul>
        </details>
      )}
    </div>
  );
}
