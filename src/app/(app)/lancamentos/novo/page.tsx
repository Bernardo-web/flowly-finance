import type { Metadata } from "next";
import { getUser } from "@/lib/supabase/server";
import { getAccounts, getCategories } from "@/lib/data";
import { todayIso } from "@/lib/dates";
import { isUuid } from "@/lib/validation";
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "../transaction-form";
import { createTransaction } from "../actions";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
  const { conta } = await searchParams;
  const { supabase } = await getUser();
  const [accounts, categories] = await Promise.all([getAccounts(supabase), getCategories(supabase)]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Novo lançamento" back="/lancamentos" />
      <TransactionForm
        action={createTransaction}
        accounts={accounts.map(({ id, name }) => ({ id, name }))}
        categories={categories}
        today={todayIso()}
        defaultAccountId={isUuid(conta) ? conta : undefined}
      />
    </div>
  );
}
