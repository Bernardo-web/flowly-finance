/**
 * Validação dos formulários, feita no servidor (nunca confiar só no navegador).
 * Funções puras: recebem um objeto simples e devolvem dados limpos ou uma mensagem de erro.
 */
import { parseAmountToCents } from "./money/cents.ts";
import { isValidIsoDate } from "./dates.ts";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

type Fields = Record<string, string | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_CENTS = 100_000_000_00; // R$ 100 milhões por lançamento é mais que suficiente

export const ACCOUNT_KINDS = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  wallet: "Carteira digital",
  investment: "Investimento",
} as const;
export type AccountKind = keyof typeof ACCOUNT_KINDS;

export function isUuid(v: string | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

/** Converte FormData em objeto de strings (ignora arquivos). */
export function formFields(form: FormData): Fields {
  const out: Fields = {};
  form.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

function positiveCents(raw: string | undefined): number | null {
  const c = parseAmountToCents(raw ?? "");
  if (c === null) return null;
  const abs = Math.abs(c);
  return abs > 0 && abs <= MAX_CENTS ? abs : null;
}

// ---------------------------------------------------------------------------

export type AccountInput = {
  name: string;
  kind: AccountKind;
  initial_balance_cents: number;
  color: string;
};

export function validateAccount(f: Fields): Result<AccountInput> {
  const name = (f.name ?? "").trim();
  if (name.length < 1 || name.length > 60) return { ok: false, error: "Dê um nome à conta (até 60 caracteres)." };
  const kind = f.kind as AccountKind;
  if (!(kind in ACCOUNT_KINDS)) return { ok: false, error: "Escolha o tipo da conta." };
  const rawBalance = (f.initial_balance ?? "").trim();
  const balance = rawBalance === "" ? 0 : parseAmountToCents(rawBalance);
  if (balance === null || Math.abs(balance) > MAX_CENTS) return { ok: false, error: "Saldo inicial inválido." };
  const color = COLOR_RE.test(f.color ?? "") ? f.color! : "#0f766e";
  return { ok: true, data: { name, kind, initial_balance_cents: balance, color } };
}

// ---------------------------------------------------------------------------

export type CategoryInput = {
  name: string;
  kind: "income" | "expense";
  parent_id: string | null;
  color: string;
};

export function validateCategory(f: Fields): Result<CategoryInput> {
  const name = (f.name ?? "").trim();
  if (name.length < 1 || name.length > 40) return { ok: false, error: "Dê um nome à categoria (até 40 caracteres)." };
  const kind = f.kind === "income" ? "income" : f.kind === "expense" ? "expense" : null;
  if (!kind) return { ok: false, error: "Escolha se é de receita ou despesa." };
  const parent_id = isUuid(f.parent_id) ? f.parent_id : null;
  const color = COLOR_RE.test(f.color ?? "") ? f.color! : "#64748b";
  return { ok: true, data: { name, kind, parent_id, color } };
}

// ---------------------------------------------------------------------------

export type TransactionInput =
  | {
      kind: "income" | "expense";
      amount_cents: number;
      occurred_on: string;
      description: string;
      account_id: string;
      category_id: string | null;
      status: "paid" | "pending";
      notes: string | null;
    }
  | {
      kind: "transfer";
      amount_cents: number;
      occurred_on: string;
      description: string;
      from_account_id: string;
      to_account_id: string;
      notes: string | null;
    }
  | {
      kind: "card_expense";
      amount_cents: number;       // valor total da compra
      occurred_on: string;
      description: string;
      card_id: string;
      installments: number;
      category_id: string | null;
      notes: string | null;
    };

export function validateTransaction(f: Fields): Result<TransactionInput> {
  const kind = f.kind;
  if (kind !== "income" && kind !== "expense" && kind !== "transfer") {
    return { ok: false, error: "Escolha receita, despesa ou transferência." };
  }
  const amount = positiveCents(f.amount);
  if (amount === null) return { ok: false, error: "Informe um valor maior que zero." };

  const occurred_on = (f.occurred_on ?? "").trim();
  if (!isValidIsoDate(occurred_on)) return { ok: false, error: "Data inválida." };

  const notesRaw = (f.notes ?? "").trim();
  if (notesRaw.length > 1000) return { ok: false, error: "Observação muito longa." };
  const notes = notesRaw || null;
  const descRaw = (f.description ?? "").trim();
  if (descRaw.length > 200) return { ok: false, error: "Descrição muito longa." };

  if (kind === "transfer") {
    if (!isUuid(f.account_id) || !isUuid(f.to_account_id)) return { ok: false, error: "Escolha as duas contas." };
    if (f.account_id === f.to_account_id) return { ok: false, error: "As contas de origem e destino precisam ser diferentes." };
    return {
      ok: true,
      data: {
        kind,
        amount_cents: amount,
        occurred_on,
        description: descRaw || "Transferência",
        from_account_id: f.account_id,
        to_account_id: f.to_account_id,
        notes,
      },
    };
  }

  const category_id = isUuid(f.category_id) ? f.category_id : null;

  // despesa no cartão: o destino vem como "card:<id>"
  if (kind === "expense" && (f.account_id ?? "").startsWith("card:")) {
    const card_id = (f.account_id ?? "").slice(5);
    if (!isUuid(card_id)) return { ok: false, error: "Escolha o cartão." };
    const installments = Number(f.installments ?? "1");
    if (!Number.isInteger(installments) || installments < 1 || installments > 48) {
      return { ok: false, error: "Parcelas: de 1 a 48." };
    }
    if (amount < installments) return { ok: false, error: "Valor pequeno demais para tantas parcelas." };
    return {
      ok: true,
      data: { kind: "card_expense", amount_cents: amount, occurred_on, description: descRaw || "Compra no cartão", card_id, installments, category_id, notes },
    };
  }

  if (!isUuid(f.account_id)) return { ok: false, error: "Escolha a conta." };
  return {
    ok: true,
    data: {
      kind,
      amount_cents: amount,
      occurred_on,
      description: descRaw || (kind === "income" ? "Receita" : "Despesa"),
      account_id: f.account_id,
      category_id,
      status: f.status === "pending" ? "pending" : "paid",
      notes,
    },
  };
}

// ---------------------------------------------------------------------------

export type CardInput = { name: string; limit_cents: number; closing_day: number; due_day: number; color: string };

export function validateCard(f: Fields): Result<CardInput> {
  const name = (f.name ?? "").trim();
  if (name.length < 1 || name.length > 60) return { ok: false, error: "Dê um nome ao cartão (até 60 caracteres)." };
  const rawLimit = (f.limit ?? "").trim();
  const limit = rawLimit === "" ? 0 : parseAmountToCents(rawLimit);
  if (limit === null || limit < 0 || limit > MAX_CENTS) return { ok: false, error: "Limite inválido." };
  const closing = Number(f.closing_day), due = Number(f.due_day);
  if (!Number.isInteger(closing) || closing < 1 || closing > 31) return { ok: false, error: "Dia de fechamento: de 1 a 31." };
  if (!Number.isInteger(due) || due < 1 || due > 31) return { ok: false, error: "Dia de vencimento: de 1 a 31." };
  const color = COLOR_RE.test(f.color ?? "") ? f.color! : "#7c3aed";
  return { ok: true, data: { name, limit_cents: limit, closing_day: closing, due_day: due, color } };
}

// ---------------------------------------------------------------------------

export type RecurrenceInput = {
  type: "income" | "expense";
  description: string;
  amount_cents: number | null;
  is_variable: boolean;
  days_of_month: number[];
  weekend_rule: "previous_business_day" | "next_business_day" | "keep";
  account_id: string;
  category_id: string | null;
  starts_on: string;
  ends_on: string | null;
};

export function validateRecurrence(f: Fields): Result<RecurrenceInput> {
  const type = f.type === "income" ? "income" : f.type === "expense" ? "expense" : null;
  if (!type) return { ok: false, error: "Escolha receita ou despesa." };
  const description = (f.description ?? "").trim();
  if (description.length < 1 || description.length > 120) return { ok: false, error: "Dê um nome (ex.: Salário, Aluguel)." };
  const is_variable = f.is_variable === "1";
  const rawAmount = (f.amount ?? "").trim();
  const amount = rawAmount === "" ? null : positiveCents(rawAmount);
  if (rawAmount !== "" && amount === null) return { ok: false, error: "Valor inválido." };
  if (!is_variable && amount === null) return { ok: false, error: "Informe o valor, ou marque que ele varia." };
  const days = [...new Set((f.days ?? "").split(/[^0-9]+/).filter(Boolean).map(Number))].sort((a, b) => a - b);
  if (days.length < 1 || days.length > 4 || days.some((d) => d < 1 || d > 31)) {
    return { ok: false, error: "Informe de 1 a 4 dias do mês, entre 1 e 31 (ex.: 15, 30)." };
  }
  const rules = ["previous_business_day", "next_business_day", "keep"] as const;
  const weekend_rule = rules.find((r) => r === f.weekend_rule) ?? "previous_business_day";
  if (!isUuid(f.account_id)) return { ok: false, error: "Escolha a conta." };
  const category_id = isUuid(f.category_id) ? f.category_id : null;
  const starts_on = (f.starts_on ?? "").trim();
  if (!isValidIsoDate(starts_on)) return { ok: false, error: "Data de início inválida." };
  const endRaw = (f.ends_on ?? "").trim();
  const ends_on = endRaw === "" ? null : endRaw;
  if (ends_on && (!isValidIsoDate(ends_on) || ends_on < starts_on)) return { ok: false, error: "Data de término inválida." };
  return { ok: true, data: { type, description, amount_cents: amount, is_variable, days_of_month: days, weekend_rule, account_id: f.account_id, category_id, starts_on, ends_on } };
}
