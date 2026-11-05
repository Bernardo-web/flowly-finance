import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { categoryPath, fetchAll, getCategories, type Category } from "@/lib/data";
import { centsToBr, toCsv } from "@/lib/export";
import { todayIso } from "@/lib/dates";

type Tx = {
  id: string;
  type: string;
  amount_cents: number;
  occurred_on: string;
  description: string;
  status: string;
  notes: string | null;
  account_id: string | null;
  card_bill_id: string | null;
  category_id: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer_in: "Transferência (entrada)",
  transfer_out: "Transferência (saída)",
  adjustment_in: "Ajuste de saldo",
  adjustment_out: "Ajuste de saldo",
};

/** Exporta os dados do usuário logado (portabilidade, LGPD). O RLS garante que só vêm os dele. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const format = request.nextUrl.searchParams.get("formato") === "json" ? "json" : "csv";

  const txs = await fetchAll<Tx>((a, b) =>
    supabase
      .from("transactions")
      .select("id, type, amount_cents, occurred_on, description, status, notes, account_id, card_bill_id, category_id")
      .order("occurred_on")
      .order("id")
      .range(a, b),
  );
  const [categories, { data: accounts }, { data: cards }, { data: bills }] = await Promise.all([
    getCategories(supabase, true),
    supabase.from("accounts").select("*"),
    supabase.from("credit_cards").select("*"),
    supabase.from("card_bills").select("id, card_id, reference_month, due_date, status"),
  ]);
  const stamp = todayIso();

  if (format === "json") {
    const [{ data: profile }, { data: recurrences }, { data: budgets }, { data: rules }, { data: installments }] = await Promise.all([
      supabase.from("profiles").select("full_name, created_at").eq("id", auth.user.id).single(),
      supabase.from("recurrences").select("*"),
      supabase.from("budgets").select("*"),
      supabase.from("category_rules").select("pattern, category_id, hits"),
      supabase.from("installments").select("*"),
    ]);
    const body = JSON.stringify(
      { exported_at: new Date().toISOString(), email: auth.user.email, profile, accounts, credit_cards: cards, card_bills: bills, categories, transactions: txs, installments, recurrences, budgets, category_rules: rules },
      null,
      2,
    );
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="flowly-dados-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const cardOfBill = new Map((bills ?? []).map((b) => [b.id as string, b.card_id as string]));
  const place = (t: Tx) =>
    t.card_bill_id
      ? (cards ?? []).find((c) => c.id === cardOfBill.get(t.card_bill_id!))?.name ?? "Cartão"
      : (accounts ?? []).find((a) => a.id === t.account_id)?.name ?? "";
  const signed = (t: Tx) => (["income", "transfer_in", "adjustment_in"].includes(t.type) ? 1 : -1) * Number(t.amount_cents);

  const csv = toCsv(
    ["Data", "Tipo", "Descrição", "Valor (R$)", "Categoria", "Conta ou cartão", "Situação", "Observação"],
    txs.map((t) => [
      t.occurred_on.split("-").reverse().join("/"),
      TYPE_LABEL[t.type] ?? t.type,
      t.description,
      centsToBr(signed(t)),
      categoryPath(categories as Category[], t.category_id) ?? "",
      place(t),
      t.status === "pending" ? "Pendente" : "Pago",
      t.notes ?? "",
    ]),
    [3],
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flowly-lancamentos-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
