"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type InviteState = { error?: string; ok?: string } | undefined;

export async function createInvite(_: InviteState, form: FormData): Promise<InviteState> {
  const note = String(form.get("note") ?? "").trim().slice(0, 120) || null;
  const maxUses = Math.min(Math.max(Number(form.get("max_uses") ?? 1) || 1, 1), 50);

  const supabase = await createClient();
  // a função no banco confere se quem chama é administrador
  const { error } = await supabase.rpc("create_invite", { p_max_uses: maxUses, p_days: 14, p_note: note });
  if (error) return { error: "Não foi possível criar o convite." };

  revalidatePath("/convites");
  return { ok: "Convite criado. Copie o link e envie para a pessoa." };
}

export async function deleteInvite(form: FormData) {
  const code = String(form.get("code") ?? "");
  const supabase = await createClient();
  await supabase.from("invites").delete().eq("code", code);
  revalidatePath("/convites");
}
