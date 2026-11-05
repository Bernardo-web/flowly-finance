"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formFields, isUuid, validateCard } from "@/lib/validation";
import { parseAmountToCents } from "@/lib/money/cents";
import { isValidIsoDate } from "@/lib/dates";

export type ActionState = { error?: string; ok?: string } | undefined;

export async function createCard(_: ActionState, form: FormData): Promise<ActionState> {
  const v = validateCard(formFields(form));
  if (!v.ok) return { error: v.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("credit_cards").insert(v.data).select("id").single();
  if (error || !data) return { error: "Não foi possível salvar o cartão." };
  revalidatePath("/", "layout");
  redirect(`/cartoes/${data.id}`);
}

export async function updateCard(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(id)) return { error: "Cartão inválido." };
  const v = validateCard(formFields(form));
  if (!v.ok) return { error: v.error };
  const supabase = await createClient();
  const { error } = await supabase.from("credit_cards").update(v.data).eq("id", id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  redirect(`/cartoes/${id}`);
}

export async function setCardArchived(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from("credit_cards").update({ archived: form.get("archived") === "true" }).eq("id", id);
  revalidatePath("/", "layout");
  redirect("/cartoes");
}

export async function payBill(billId: string, back: string, _: ActionState, form: FormData): Promise<ActionState> {
  const accountId = String(form.get("account_id") ?? "");
  const amount = parseAmountToCents(String(form.get("amount") ?? ""));
  const paidOn = String(form.get("paid_on") ?? "");
  if (!isUuid(billId)) return { error: "Fatura inválida." };
  if (!isUuid(accountId)) return { error: "Escolha a conta de onde sai o pagamento." };
  if (amount === null || amount <= 0) return { error: "Informe o valor pago." };
  if (!isValidIsoDate(paidOn)) return { error: "Data inválida." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_card_bill", {
    p_bill_id: billId,
    p_account_id: accountId,
    p_amount_cents: Math.abs(amount),
    p_paid_on: paidOn,
  });
  if (error) return { error: "Não foi possível registrar o pagamento." };
  revalidatePath("/", "layout");
  redirect(back.startsWith("/cartoes/") ? back : "/cartoes");
}
