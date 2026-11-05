"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formFields, isUuid, validateAccount } from "@/lib/validation";
import { parseAmountToCents } from "@/lib/money/cents";
import { todayIso } from "@/lib/dates";

export type ActionState = { error?: string; ok?: string } | undefined;

export async function createAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const v = validateAccount(formFields(form));
  if (!v.ok) return { error: v.error };
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").insert(v.data);
  if (error) return { error: "Não foi possível salvar a conta." };
  revalidatePath("/", "layout");
  redirect("/contas");
}

export async function updateAccount(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(id)) return { error: "Conta inválida." };
  const v = validateAccount(formFields(form));
  if (!v.ok) return { error: v.error };
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update(v.data).eq("id", id);
  if (error) return { error: "Não foi possível salvar a conta." };
  revalidatePath("/", "layout");
  redirect("/contas");
}

export async function setAccountArchived(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from("accounts").update({ archived: form.get("archived") === "true" }).eq("id", id);
  revalidatePath("/", "layout");
  redirect("/contas");
}

/** Só apaga conta sem lançamentos; com histórico, o caminho é arquivar. */
export async function deleteAccount(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("account_id", id);
  if ((count ?? 0) > 0) return;
  await supabase.from("accounts").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/contas");
}

/** Informa o saldo real de hoje; o app lança a diferença como "Ajuste de saldo". */
export async function adjustBalance(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(id)) return { error: "Conta inválida." };
  const target = parseAmountToCents(String(form.get("balance") ?? ""));
  if (target === null) return { error: "Informe o saldo atual, ex.: 1.234,56 (use - se estiver negativo)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_account_balance", { p_account_id: id, p_target_cents: target, p_on: todayIso() });
  if (error) return { error: "Não foi possível ajustar o saldo." };
  revalidatePath("/", "layout");
  return { ok: Number(data) === 0 ? "O saldo já estava certo." : "Saldo ajustado." };
}
