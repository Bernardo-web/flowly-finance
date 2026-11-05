"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; ok?: string } | undefined;

export async function updateProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const fullName = String(form.get("full_name") ?? "").trim().slice(0, 120);
  if (!fullName) return { error: "Informe seu nome." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Sessão expirada." };
  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", data.user.id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return { ok: "Nome atualizado." };
}

export async function setTheme(form: FormData) {
  const value = String(form.get("theme") ?? "system");
  const store = await cookies();
  if (value === "light" || value === "dark") {
    store.set("theme", value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  } else {
    store.delete("theme");
  }
  revalidatePath("/", "layout");
}

export async function deleteAccount(_: ActionState, form: FormData): Promise<ActionState> {
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "EXCLUIR") {
    return { error: 'Digite EXCLUIR para confirmar.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error: "Não foi possível excluir a conta. Tente de novo." };
  await supabase.auth.signOut();
  redirect("/entrar?conta=excluida");
}
