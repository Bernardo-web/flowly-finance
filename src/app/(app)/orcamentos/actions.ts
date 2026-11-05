"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseAmountToCents } from "@/lib/money/cents";
import { isUuid } from "@/lib/validation";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function setBudget(form: FormData) {
  const categoryId = String(form.get("category_id") ?? "");
  const month = String(form.get("month") ?? "");
  const raw = String(form.get("limit") ?? "").trim();
  if (!isUuid(categoryId) || !MONTH_RE.test(month)) return;
  const supabase = await createClient();

  if (raw === "") {
    await supabase.from("budgets").delete().eq("category_id", categoryId).eq("month", `${month}-01`);
  } else {
    const cents = parseAmountToCents(raw);
    if (cents === null || cents <= 0) return;
    await supabase
      .from("budgets")
      .upsert({ category_id: categoryId, month: `${month}-01`, limit_cents: Math.abs(cents) }, { onConflict: "user_id,category_id,month" });
  }
  revalidatePath("/", "layout");
}

/** Repete os limites de um mês no outro (só onde ainda não há limite). */
export async function copyBudgets(form: FormData) {
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  if (!MONTH_RE.test(from) || !MONTH_RE.test(to)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("budgets").select("category_id, limit_cents").eq("month", `${from}-01`);
  if (data?.length) {
    await supabase.from("budgets").upsert(
      data.map((b) => ({ category_id: b.category_id, month: `${to}-01`, limit_cents: b.limit_cents })),
      { onConflict: "user_id,category_id,month", ignoreDuplicates: true },
    );
  }
  revalidatePath("/", "layout");
}
