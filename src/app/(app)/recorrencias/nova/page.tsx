import type { Metadata } from "next";
import { getUser } from "@/lib/supabase/server";
import { getAccounts, getCategories } from "@/lib/data";
import { todayIso } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { RecurrenceForm } from "../recurrence-form";
import { createRecurrence } from "../actions";

export const metadata: Metadata = { title: "Nova recorrência" };

export default async function NewRecurrencePage() {
  const { supabase } = await getUser();
  const [accounts, categories] = await Promise.all([getAccounts(supabase), getCategories(supabase)]);
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Nova recorrência" back="/recorrencias" />
      <RecurrenceForm
        action={createRecurrence}
        accounts={accounts.map(({ id, name }) => ({ id, name }))}
        categories={categories}
        today={todayIso()}
      />
    </div>
  );
}
