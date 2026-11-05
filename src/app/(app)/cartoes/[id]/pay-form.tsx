"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import type { ActionState } from "../actions";

export function PayBillForm({
  action,
  accounts,
  amount,
  today,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  accounts: { id: string; name: string }[];
  amount: string;
  today: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  if (accounts.length === 0) return <p className="muted text-sm">Cadastre uma conta para registrar o pagamento.</p>;
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="pay-amount">Valor pago</label>
          <input className="input tabular-nums" id="pay-amount" name="amount" inputMode="decimal" defaultValue={amount} required />
        </div>
        <div>
          <label className="label" htmlFor="pay-account">Saiu da conta</label>
          <select className="input" id="pay-account" name="account_id">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pay-date">Data</label>
          <input className="input" id="pay-date" name="paid_on" type="date" defaultValue={today} required />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="sm:w-auto">Registrar pagamento</SubmitButton>
      <p className="muted text-xs">O pagamento tira o dinheiro da conta, mas não conta como despesa de novo: as compras já foram contadas.</p>
    </form>
  );
}
