"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formFields, isUuid, validateCategory } from "@/lib/validation";

export type ActionState = { error?: string; ok?: string } | undefined;

async function checkParent(supabase: Awaited<ReturnType<typeof createClient>>, parentId: string | null, kind: string, selfId?: string) {
  if (!parentId) return null;
  if (parentId === selfId) return "Uma categoria não pode ser subcategoria dela mesma.";
  const { data: parent } = await supabase.from("categories").select("kind, parent_id").eq("id", parentId).maybeSingle();
  if (!parent) return "Categoria principal não encontrada.";
  if (parent.kind !== kind) return "A subcategoria precisa ser do mesmo tipo da principal.";
  if (parent.parent_id) return "Só existe um nível de subcategoria.";
  return null;
}

export async function createCategory(_: ActionState, form: FormData): Promise<ActionState> {
  const v = validateCategory(formFields(form));
  if (!v.ok) return { error: v.error };
  const supabase = await createClient();
  const parentError = await checkParent(supabase, v.data.parent_id, v.data.kind);
  if (parentError) return { error: parentError };
  const { error } = await supabase.from("categories").insert({ ...v.data, icon: "circle" });
  if (error) return { error: "Não foi possível criar a categoria." };
  revalidatePath("/categorias");
  return { ok: `Categoria "${v.data.name}" criada.` };
}

export async function updateCategory(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(id)) return { error: "Categoria inválida." };
  const v = validateCategory(formFields(form));
  if (!v.ok) return { error: v.error };
  const supabase = await createClient();
  const { data: current } = await supabase.from("categories").select("kind").eq("id", id).maybeSingle();
  if (!current) return { error: "Categoria não encontrada." };
  if (current.kind !== v.data.kind) return { error: "Não é possível trocar o tipo de uma categoria existente." };
  const { count: childCount } = await supabase.from("categories").select("id", { count: "exact", head: true }).eq("parent_id", id);
  if (v.data.parent_id && (childCount ?? 0) > 0) return { error: "Esta categoria tem subcategorias e não pode virar subcategoria." };
  const parentError = await checkParent(supabase, v.data.parent_id, v.data.kind, id);
  if (parentError) return { error: parentError };
  const { error } = await supabase.from("categories").update(v.data).eq("id", id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  redirect("/categorias");
}

export async function setCategoryArchived(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  const archived = form.get("archived") === "true";
  // arquivar a principal arquiva as subcategorias junto
  await supabase.from("categories").update({ archived }).or(`id.eq.${id},parent_id.eq.${id}`);
  revalidatePath("/", "layout");
  redirect("/categorias");
}

export async function deleteRule(form: FormData) {
  const id = String(form.get("id") ?? "");
  const categoryId = String(form.get("category_id") ?? "");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from("category_rules").delete().eq("id", id);
  revalidatePath(`/categorias/${categoryId}`);
}
