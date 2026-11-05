import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getAccounts, getCategories } from "@/lib/data";
import { dayLabel, monthOf, todayIso } from "@/lib/dates";
import { formatCents } from "@/lib/money/cents";
import { isUuid } from "@/lib/validation";
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "../transaction-form";
import { deleteTransaction, updateCardTransaction, updateTransaction } from "../actions";
import { CardTxForm } from "../card-tx-form";

export const metadata: Metadata = { title: "Lançamento" };

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await getUser();

  const { data: tx } = await supabase
    .from("transactions")
    .select("id, type, amount_cents, occurred_on, description, status, account_id, category_id, notes, transfer_group, bank_description, import_id, card_bill_id, installment_id")
    .eq("id", id)
    .maybeSingle();
  if (!tx) notFound();

  const [accounts, allCategories] = await Promise.all([getAccounts(supabase, true), getCategories(supabase, true)]);
  // categorias arquivadas somem das opções, exceto a que este lançamento já usa (e o pai dela)
  const current = allCategories.find((c) => c.id === tx.category_id);
  const categories = allCategories.filter((c) => !c.archived || c.id === current?.id || c.id === current?.parent_id);
  const back = `/lancamentos?mes=${monthOf(tx.occurred_on)}`;
  const cents = Number(tx.amount_cents);

  const deleteForm = (label: string) => (
    <form action={deleteTransaction} className="card p-5">
      <input type="hidden" name="id" value={tx.id} />
      <button className="btn-ghost w-full justify-center text-expense">{label}</button>
    </form>
  );

  if (tx.transfer_group) {
    const { data: legs } = await supabase
      .from("transactions")
      .select("type, account_id, card_bill_id")
      .eq("transfer_group", tx.transfer_group);
    const name = (type: string) => {
      const leg = legs?.find((l) => l.type === type);
      if (leg?.card_bill_id) return "fatura do cartão";
      return accounts.find((a) => a.id === leg?.account_id)?.name ?? "—";
    };
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <PageHeader title="Transferência" back={back} />
        <div className="card space-y-2 p-5">
          <p className="text-3xl font-bold tabular-nums">{formatCents(cents)}</p>
          <p>{tx.description}</p>
          <p className="muted text-sm">De <strong>{name("transfer_out")}</strong> para <strong>{name("transfer_in")}</strong> · {dayLabel(tx.occurred_on)}</p>
        </div>
        {deleteForm("Excluir transferência")}
      </div>
    );
  }

  if (tx.card_bill_id) {
    const { data: bill } = await supabase
      .from("card_bills")
      .select("card_id, reference_month, credit_cards(name)")
      .eq("id", tx.card_bill_id)
      .maybeSingle();
    const cardName = (bill?.credit_cards as unknown as { name: string } | null)?.name ?? "Cartão";
    const cardBack = bill ? `/cartoes/${bill.card_id}?fatura=${String(bill.reference_month).slice(0, 7)}` : back;
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <PageHeader title="Compra no cartão" back={cardBack} />
        <div className="card space-y-1 p-5">
          <p className="text-3xl font-bold tabular-nums">{formatCents(cents)}</p>
          <p className="muted text-sm">
            {cardName} · {dayLabel(tx.occurred_on)}
            {bill && ` · fatura de ${String(bill.reference_month).slice(5, 7)}/${String(bill.reference_month).slice(0, 4)}`}
          </p>
        </div>
        <CardTxForm
          action={updateCardTransaction.bind(null, tx.id)}
          categories={categories}
          defaults={{ description: tx.description, category_id: tx.category_id, notes: tx.notes ?? "" }}
        />
        {deleteForm(tx.installment_id ? "Excluir compra (todas as parcelas)" : "Excluir compra")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Editar lançamento" back={back} />
      {tx.status === "pending" && (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Pendente: confira o valor e desmarque &quot;Ainda não {tx.type === "income" ? "recebi" : "paguei"}&quot; para ele contar no saldo.
        </p>
      )}
      <TransactionForm
        action={updateTransaction.bind(null, tx.id)}
        accounts={accounts.filter((a) => !a.archived || a.id === tx.account_id).map(({ id, name }) => ({ id, name }))}
        categories={categories}
        today={todayIso()}
        defaults={{
          kind: tx.type as "income" | "expense",
          amount: tx.status === "pending" && cents <= 1 ? "" : (cents / 100).toFixed(2).replace(".", ","),
          occurred_on: tx.occurred_on,
          description: tx.description,
          account_id: tx.account_id!,
          category_id: tx.category_id,
          status: tx.status,
          notes: tx.notes ?? "",
        }}
      />
      {tx.bank_description && (
        <p className="muted px-1 text-xs">Importado do extrato: “{tx.bank_description}”</p>
      )}
      {deleteForm("Excluir lançamento")}
    </div>
  );
}
