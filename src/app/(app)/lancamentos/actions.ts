"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formFields, isUuid, validateTransaction } from "@/lib/validation";
import { monthOf } from "@/lib/dates";
import { buildParcels } from "@/lib/cards";

export type ActionState = { error?: string; ok?: string } | undefined;

function done(occurredOn: string, accountId?: string): never {
  revalidatePath("/", "layout");
  const qs = new URLSearchParams({ mes: monthOf(occurredOn) });
  if (accountId) qs.set("conta", accountId);
  redirect(`/lancamentos?${qs}`);
}

export async function createTransaction(_: ActionState, form: FormData): Promise<ActionState> {
  const v = validateTransaction(formFields(form));
  if (!v.ok) return { error: v.error };
  const d = v.data;
  const supabase = await createClient();

  if (d.kind === "card_expense") {
    const { data: card } = await supabase.from("credit_cards").select("closing_day, due_day").eq("id", d.card_id).maybeSingle();
    if (!card) return { error: "Cartão não encontrado." };
    const parcels = buildParcels(d.occurred_on, d.amount_cents, d.installments, card.closing_day, card.due_day);
    const { error } = await supabase.rpc("create_card_purchase", {
      p_card_id: d.card_id,
      p_description: d.description,
      p_category_id: d.category_id,
      p_notes: d.notes,
      p_parcels: parcels.map((p) => ({
        number: p.number,
        amount_cents: p.amount_cents,
        occurred_on: p.occurred_on,
        reference_month: p.bill.reference_month,
        due_date: p.bill.due_date,
      })),
    });
    if (error) return { error: "Não foi possível salvar a compra." };
  } else if (d.kind === "transfer") {
    const group = crypto.randomUUID();
    const base = { amount_cents: d.amount_cents, occurred_on: d.occurred_on, description: d.description, notes: d.notes, status: "paid", transfer_group: group };
    // um único insert com as duas pernas: ou entram as duas, ou nenhuma
    const { error } = await supabase.from("transactions").insert([
      { ...base, type: "transfer_out", account_id: d.from_account_id },
      { ...base, type: "transfer_in", account_id: d.to_account_id },
    ]);
    if (error) return { error: "Não foi possível salvar a transferência." };
  } else {
    const { error } = await supabase.from("transactions").insert({
      type: d.kind,
      amount_cents: d.amount_cents,
      occurred_on: d.occurred_on,
      description: d.description,
      account_id: d.account_id,
      category_id: d.category_id,
      status: d.status,
      notes: d.notes,
    });
    if (error) return { error: "Não foi possível salvar o lançamento." };
  }

  if (form.get("again") === "1") {
    revalidatePath("/", "layout");
    return { ok: "Salvo! Pode lançar o próximo." };
  }
  done(d.occurred_on);
}

export async function updateTransaction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(id)) return { error: "Lançamento inválido." };
  const v = validateTransaction(formFields(form));
  if (!v.ok) return { error: v.error };
  if (v.data.kind === "transfer" || v.data.kind === "card_expense") {
    return { error: "Este lançamento não pode mudar de tipo; exclua e lance de novo." };
  }
  const d = v.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({
      type: d.kind,
      amount_cents: d.amount_cents,
      occurred_on: d.occurred_on,
      description: d.description,
      account_id: d.account_id,
      category_id: d.category_id,
      status: d.status,
      notes: d.notes,
    })
    .eq("id", id)
    .in("type", ["income", "expense"]);
  if (error) return { error: "Não foi possível salvar." };
  done(d.occurred_on);
}

export async function deleteTransaction(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from("transactions")
    .select("occurred_on, transfer_group, installment_id")
    .eq("id", id)
    .maybeSingle();
  if (!tx) return;
  // transferência e pagamento de fatura: as duas pernas; compra parcelada: todas as parcelas
  if (tx.transfer_group) await supabase.from("transactions").delete().eq("transfer_group", tx.transfer_group);
  else if (tx.installment_id) await supabase.from("installments").delete().eq("id", tx.installment_id);
  else await supabase.from("transactions").delete().eq("id", id);
  done(tx.occurred_on);
}

/** Confirma um lançamento pendente direto da lista. */
export async function markPaid(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from("transactions").update({ status: "paid" }).eq("id", id);
  revalidatePath("/", "layout");
}

/** Compra no cartão: valor e data definem a fatura, então só descrição, categoria e observação mudam. */
export async function updateCardTransaction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(id)) return { error: "Lançamento inválido." };
  const description = String(form.get("description") ?? "").trim().slice(0, 200);
  const categoryRaw = String(form.get("category_id") ?? "");
  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000) || null;
  if (!description) return { error: "Informe a descrição." };
  const category_id = isUuid(categoryRaw) ? categoryRaw : null;

  const supabase = await createClient();
  const { data: tx } = await supabase.from("transactions").select("occurred_on, installment_id").eq("id", id).maybeSingle();
  if (!tx) return { error: "Lançamento não encontrado." };
  const { error } = await supabase.from("transactions").update({ description, notes, category_id }).eq("id", id);
  if (error) return { error: "Não foi possível salvar." };
  // a categoria vale para todas as parcelas da mesma compra
  if (tx.installment_id) await supabase.from("transactions").update({ category_id }).eq("installment_id", tx.installment_id);
  done(tx.occurred_on);
}
