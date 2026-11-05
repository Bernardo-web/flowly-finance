"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formFields, isUuid, validateRecurrence } from "@/lib/validation";

export type ActionState = { error?: string; ok?: string } | undefined;

export async function createRecurrence(_: ActionState, form: FormData): Promise<ActionState> {
  const v = validateRecurrence(formFields(form));
  if (!v.ok) return { error: v.error };
  const supabase = await createClient();
  const { error } = await supabase.from("recurrences").insert(v.data);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  redirect("/recorrencias");
}

export async function updateRecurrence(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(id)) return { error: "Recorrência inválida." };
  const v = validateRecurrence(formFields(form));
  if (!v.ok) return { error: v.error };
  const supabase = await createClient();
  const { error } = await supabase.from("recurrences").update(v.data).eq("id", id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  redirect("/recorrencias");
}

export async function setRecurrenceActive(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from("recurrences").update({ active: form.get("active") === "true" }).eq("id", id);
  revalidatePath("/", "layout");
}

/** Apaga a regra; os lançamentos já criados por ela continuam no histórico. */
export async function deleteRecurrence(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from("recurrences").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/recorrencias");
}
