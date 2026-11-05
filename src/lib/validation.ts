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

  if (!isUuid(f.account_id)) return { ok: false, error: "Escolha a conta." };
  const category_id = isUuid(f.category_id) ? f.category_id : null;
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
