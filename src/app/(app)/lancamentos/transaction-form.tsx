"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { CategoryOptions } from "@/components/category-select";
import type { Category } from "@/lib/data";
import type { ActionState } from "./actions";

type Kind = "expense" | "income" | "transfer";
type AccountOpt = { id: string; name: string };

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  accounts: AccountOpt[];
  categories: Category[];
  today: string;
  defaults?: {
    kind: "income" | "expense";
    amount: string;
    occurred_on: string;
    description: string;
    account_id: string;
    category_id: string | null;
    status: "paid" | "pending";
    notes: string;
  };
  defaultAccountId?: string;
};

const KINDS: { value: Kind; label: string; on: string }[] = [
  { value: "expense", label: "Despesa", on: "bg-expense text-white" },
  { value: "income", label: "Receita", on: "bg-income text-white" },
  { value: "transfer", label: "Transferência", on: "bg-brand-700 text-white" },
];

export function TransactionForm({ action, accounts, categories, today, defaults, defaultAccountId }: Props) {
  const editing = Boolean(defaults);
  const [kind, setKind] = useState<Kind>(defaults?.kind ?? "expense");
  const [state, formAction] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // "Salvar e lançar outro": limpa valor e descrição, mantém conta, data e tipo
  useEffect(() => {
    if (state?.ok && formRef.current) {
      const f = formRef.current;
      (f.elements.namedItem("amount") as HTMLInputElement).value = "";
      (f.elements.namedItem("description") as HTMLInputElement).value = "";
      (f.elements.namedItem("notes") as HTMLTextAreaElement).value = "";
      amountRef.current?.focus();
    }
  }, [state]);

  if (accounts.length === 0) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <p className="font-medium">Antes de lançar, cadastre uma conta.</p>
        <Link href="/contas/nova" className="btn-primary">Criar conta</Link>
      </div>
    );
  }

  const firstAccount = defaults?.account_id ?? defaultAccountId ?? accounts[0].id;

  return (
    <form ref={formRef} action={formAction} className="card space-y-5 p-5">
      {!editing && (
        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-3 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => setKind(k.value)}
              className={`rounded-lg py-2 text-sm font-semibold transition ${kind === k.value ? k.on : "muted"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
      <input type="hidden" name="kind" value={kind} />

      <div>
        <label className="label" htmlFor="amount">Valor</label>
        <div className="flex items-center gap-2">
          <span className="muted text-2xl font-semibold">R$</span>
          <input
            ref={amountRef}
            className={`input text-3xl font-bold tabular-nums ${kind === "expense" ? "text-expense" : kind === "income" ? "text-income" : ""}`}
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            defaultValue={defaults?.amount}
            autoFocus={!editing}
            required
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="description">Descrição</label>
        <input
          className="input"
          id="description"
          name="description"
          maxLength={200}
          defaultValue={defaults?.description}
          placeholder={kind === "transfer" ? "Transferência" : kind === "income" ? "Ex.: Salário" : "Ex.: Mercado"}
        />
      </div>

      {kind !== "transfer" && (
        <div>
          <label className="label" htmlFor="category_id">Categoria</label>
          <select key={kind} className="input" id="category_id" name="category_id" defaultValue={defaults?.category_id ?? ""}>
            <option value="">Sem categoria</option>
            <CategoryOptions categories={categories} kind={kind} />
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="account_id">{kind === "transfer" ? "Sai de" : "Conta"}</label>
          <select className="input" id="account_id" name="account_id" defaultValue={firstAccount}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {kind === "transfer" ? (
          <div>
            <label className="label" htmlFor="to_account_id">Vai para</label>
            <select
              className="input"
              id="to_account_id"
              name="to_account_id"
              defaultValue={accounts.find((a) => a.id !== firstAccount)?.id ?? ""}
            >
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="occurred_on">Data</label>
            <input className="input" id="occurred_on" name="occurred_on" type="date" defaultValue={defaults?.occurred_on ?? today} required />
          </div>
        )}
      </div>

      {kind === "transfer" && (
        <div>
          <label className="label" htmlFor="occurred_on_t">Data</label>
          <input className="input" id="occurred_on_t" name="occurred_on" type="date" defaultValue={today} required />
        </div>
      )}

      {kind !== "transfer" && (
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="status"
            value="pending"
            defaultChecked={defaults?.status === "pending"}
            className="size-5 accent-[var(--color-brand-700)]"
          />
          <span>
            Ainda não {kind === "income" ? "recebi" : "paguei"} <span className="muted">(fica pendente e não conta no saldo)</span>
          </span>
        </label>
      )}

      <details open={Boolean(defaults?.notes)}>
        <summary className="muted cursor-pointer text-sm">Observação</summary>
        <textarea className="input mt-2" name="notes" rows={2} maxLength={1000} defaultValue={defaults?.notes} />
      </details>

      <FormMessage state={state} />

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <SubmitButton className="sm:flex-1">Salvar</SubmitButton>
        {!editing && (
          <button
            type="submit"
            name="again"
            value="1"
            className="btn-ghost justify-center sm:flex-1"
          >
            Salvar e lançar outro
          </button>
        )}
      </div>
    </form>
  );
}
