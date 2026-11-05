import type { Metadata } from "next";
import { getUser } from "@/lib/supabase/server";
import { getAccounts, getCards, getCategories } from "@/lib/data";
import { todayIso } from "@/lib/dates";
import { isUuid } from "@/lib/validation";
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "../transaction-form";
import { createTransaction } from "../actions";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
  const { conta } = await searchParams;
  const { supabase } = await getUser();
  const [accounts, cards, categories] = await Promise.all([getAccounts(supabase), getCards(supabase), getCategories(supabase)]);
  const preset = conta?.startsWith("card:") ? (isUuid(conta.slice(5)) ? conta : undefined) : isUuid(conta) ? conta : undefined;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Novo lançamento" back="/lancamentos" />
      <TransactionForm
        action={createTransaction}
        accounts={accounts.map(({ id, name }) => ({ id, name }))}
        cards={cards.map(({ id, name }) => ({ id, name }))}
        categories={categories}
        today={todayIso()}
        defaultAccountId={preset}
      />
    </div>
  );
}
