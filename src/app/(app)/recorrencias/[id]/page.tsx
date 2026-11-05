import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getAccounts, getCategories } from "@/lib/data";
import { todayIso } from "@/lib/dates";
import { isUuid } from "@/lib/validation";
import { PageHeader } from "@/components/page-header";
import { RecurrenceForm } from "../recurrence-form";
import { deleteRecurrence, updateRecurrence } from "../actions";

export const metadata: Metadata = { title: "Editar recorrência" };

export default async function EditRecurrencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await getUser();
  const { data: r } = await supabase
    .from("recurrences")
    .select("id, type, description, amount_cents, is_variable, days_of_month, weekend_rule, account_id, category_id, starts_on, ends_on")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();
  const [accounts, categories] = await Promise.all([getAccounts(supabase, true), getCategories(supabase)]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={r.description} back="/recorrencias" />
      <RecurrenceForm
        action={updateRecurrence.bind(null, id)}
        accounts={accounts.filter((a) => !a.archived || a.id === r.account_id).map(({ id, name }) => ({ id, name }))}
        categories={categories}
        today={todayIso()}
        defaults={{
          type: r.type,
          description: r.description,
          amount: r.amount_cents ? (Number(r.amount_cents) / 100).toFixed(2).replace(".", ",") : "",
          is_variable: r.is_variable,
          days: (r.days_of_month as number[]).join(", "),
          weekend_rule: r.weekend_rule,
          account_id: r.account_id,
          category_id: r.category_id,
          starts_on: r.starts_on,
          ends_on: r.ends_on ?? "",
        }}
      />
      <form action={deleteRecurrence} className="card p-5">
        <input type="hidden" name="id" value={id} />
        <button className="btn-ghost w-full justify-center text-expense">Excluir recorrência</button>
        <p className="muted mt-2 text-xs">Os lançamentos que ela já criou continuam no histórico.</p>
      </form>
    </div>
  );
}
