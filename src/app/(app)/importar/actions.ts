"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidIsoDate, todayIso } from "@/lib/dates";
import { isUuid } from "@/lib/validation";
import { parseAmountToCents } from "@/lib/money/cents";
import { fetchAll } from "@/lib/data";

/**
 * O que já existe na conta no período do extrato, para marcar duplicados:
 * - fingerprints: lançamentos importados antes (data + valor + descrição)
 * - manual: lançamentos feitos à mão (só data + valor), que viram "parece já lançado"
 */
export async function getExisting(accountId: string, from: string, to: string) {
  if (!isUuid(accountId) || !isValidIsoDate(from) || !isValidIsoDate(to)) return { fingerprints: [], manual: [] };
  const supabase = await createClient();
  const data = await fetchAll<{ type: string; amount_cents: number; occurred_on: string; fingerprint: string | null }>((a, b) =>
    supabase
      .from("transactions")
      .select("type, amount_cents, occurred_on, fingerprint")
      .eq("account_id", accountId)
      .in("type", ["income", "expense"])
      .gte("occurred_on", from)
      .lte("occurred_on", to)
      .order("id")
      .range(a, b),
  );

  const fp = new Map<string, number>();
  const manual = new Map<string, number>();
  for (const t of data) {
    if (t.fingerprint) fp.set(t.fingerprint, (fp.get(t.fingerprint) ?? 0) + 1);
    else {
      const signed = t.type === "expense" ? -Number(t.amount_cents) : Number(t.amount_cents);
      const key = `${t.occurred_on}|${signed}`;
      manual.set(key, (manual.get(key) ?? 0) + 1);
    }
  }
  return { fingerprints: [...fp.entries()], manual: [...manual.entries()] };
}

export type ImportPayload = {
  accountId: string;
  bank: string;
  format: "csv" | "ofx";
  fileName: string;
  rowsTotal: number;
  rows: {
    type: "income" | "expense";
    amount_cents: number;
    occurred_on: string;
    description: string;
    category_id: string | null;
    fingerprint: string;
    bank_description: string;
  }[];
  rules: { pattern: string; category_id: string }[];
  bankBalance?: string | null; // saldo real informado pelo usuário, ex.: "1.234,56"
};

export type ImportResult = { ok: true; importId: string; count: number; adjusted: boolean } | { ok: false; error: string };

export async function confirmImport(payload: ImportPayload): Promise<ImportResult> {
  // revalida tudo no servidor: o navegador não é confiável
  if (!isUuid(payload.accountId)) return { ok: false, error: "Escolha a conta." };
  if (!Array.isArray(payload.rows) || payload.rows.length === 0) return { ok: false, error: "Nenhuma linha selecionada." };
  if (payload.rows.length > 5000) return { ok: false, error: "Importe no máximo 5000 linhas por vez." };
  for (const r of payload.rows) {
    const valid =
      (r.type === "income" || r.type === "expense") &&
      Number.isSafeInteger(r.amount_cents) &&
      r.amount_cents > 0 &&
      isValidIsoDate(r.occurred_on) &&
      typeof r.description === "string" &&
      (r.category_id === null || isUuid(r.category_id));
    if (!valid) return { ok: false, error: "Há linhas inválidas no extrato. Recarregue a página e tente de novo." };
  }
  const rules = (payload.rules ?? []).filter(
    (r) => typeof r.pattern === "string" && r.pattern.length >= 2 && r.pattern.length <= 80 && isUuid(r.category_id),
  );

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_import", {
    p_account_id: payload.accountId,
    p_bank: String(payload.bank ?? "csv").slice(0, 20),
    p_format: payload.format === "ofx" ? "ofx" : "csv",
    p_file_name: String(payload.fileName ?? "").slice(0, 200),
    p_rows_total: Math.max(0, Math.floor(Number(payload.rowsTotal) || 0)),
    p_rows: payload.rows.map((r) => ({
      ...r,
      description: r.description.slice(0, 200),
      fingerprint: String(r.fingerprint).slice(0, 300),
      bank_description: String(r.bank_description ?? "").slice(0, 200),
    })),
    p_rules: rules,
  });
  if (error || !data) return { ok: false, error: "Não foi possível importar. Nada foi salvo; tente de novo." };

  // acerta o saldo para o valor real do banco (lança só a diferença, como "Ajuste de saldo")
  let adjusted = false;
  const target = payload.bankBalance ? parseAmountToCents(payload.bankBalance) : null;
  if (target !== null) {
    const { error: adjError } = await supabase.rpc("set_account_balance", {
      p_account_id: payload.accountId,
      p_target_cents: target,
      p_on: todayIso(),
      p_import_id: data, // desfazer a importação desfaz o ajuste junto
    });
    adjusted = !adjError;
  }

  revalidatePath("/", "layout");
  return { ok: true, importId: data as string, count: payload.rows.length, adjusted };
}

export async function undoImport(form: FormData) {
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  // apaga a importação e, em cascata, só os lançamentos que vieram dela
  await supabase.from("imports").delete().eq("id", id);
  revalidatePath("/", "layout");
}
