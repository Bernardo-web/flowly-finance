"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formFields, isUuid, validateAccount } from "@/lib/validation";

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
