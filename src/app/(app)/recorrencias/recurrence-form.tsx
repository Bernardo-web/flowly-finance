"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { CategoryOptions } from "@/components/category-select";
import type { Category } from "@/lib/data";
import type { ActionState } from "./actions";

type Defaults = {
  type: "income" | "expense";
  description: string;
  amount: string;
  is_variable: boolean;
  days: string;
  weekend_rule: string;
  account_id: string;
  category_id: string | null;
  starts_on: string;
  ends_on: string;
};

export function RecurrenceForm({
  action,
  accounts,
  categories,
  today,
  defaults,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  accounts: { id: string; name: string }[];
  categories: Category[];
  today: string;
  defaults?: Defaults;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [type, setType] = useState<"income" | "expense">(defaults?.type ?? "income");
  const [variable, setVariable] = useState(defaults?.is_variable ?? false);

  if (accounts.length === 0) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <p className="font-medium">Cadastre uma conta antes de criar recorrências.</p>
        <Link href="/contas/nova" className="btn-primary">Criar conta</Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-5 p-5">
      <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5">
        {(["income", "expense"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={`rounded-lg py-2 text-sm font-semibold ${type === t ? (t === "income" ? "bg-income text-white" : "bg-expense text-white") : "muted"}`}
          >
            {t === "income" ? "Receita" : "Despesa"}
          </button>
        ))}
      </div>
      <input type="hidden" name="type" value={type} />

      <div>
        <label className="label" htmlFor="description">Nome</label>
        <input className="input" id="description" name="description" maxLength={120} required defaultValue={defaults?.description}
          placeholder={type === "income" ? "Ex.: Salário" : "Ex.: Aluguel, Netflix"} />
      </div>

      <div>
        <label className="label" htmlFor="amount">Valor (R$)</label>
        <input className="input tabular-nums" id="amount" name="amount" inputMode="decimal" defaultValue={defaults?.amount}
          placeholder={variable ? "Opcional: valor aproximado" : "0,00"} required={!variable} />
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_variable" value="1" checked={variable} onChange={(e) => setVariable(e.target.checked)} className="size-4" />
          O valor muda todo mês <span className="muted">(entra como pendente para você confirmar)</span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="days">Dias do mês</label>
          <input className="input" id="days" name="days" required defaultValue={defaults?.days} placeholder="Ex.: 15, 30" />
          <p className="muted mt-1 text-xs">Até 4 dias. Se o mês não tiver o dia, usa o último.</p>
        </div>
        <div>
          <label className="label" htmlFor="weekend_rule">Se cair no fim de semana</label>
          <select className="input" id="weekend_rule" name="weekend_rule" defaultValue={defaults?.weekend_rule ?? "previous_business_day"}>
            <option value="previous_business_day">Antecipar para sexta</option>
            <option value="next_business_day">Adiar para segunda</option>
            <option value="keep">Manter a data</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="account_id">Conta</label>
          <select className="input" id="account_id" name="account_id" defaultValue={defaults?.account_id ?? accounts[0].id}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="category_id">Categoria</label>
          <select key={type} className="input" id="category_id" name="category_id" defaultValue={defaults?.type === type ? defaults?.category_id ?? "" : ""}>
            <option value="">Sem categoria</option>
            <CategoryOptions categories={categories} kind={type} />
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="starts_on">Começa em</label>
          <input className="input" id="starts_on" name="starts_on" type="date" required defaultValue={defaults?.starts_on ?? today} />
        </div>
        <div>
          <label className="label" htmlFor="ends_on">Termina em <span className="muted">(opcional)</span></label>
          <input className="input" id="ends_on" name="ends_on" type="date" defaultValue={defaults?.ends_on} />
        </div>
      </div>

      <FormMessage state={state} />
      <SubmitButton>Salvar</SubmitButton>
    </form>
  );
}
