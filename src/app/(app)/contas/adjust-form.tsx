"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import type { ActionState } from "./actions";

export function AdjustBalanceForm({
  action,
  current,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  current: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="label" htmlFor="balance">Saldo real hoje (R$)</label>
        <input className="input tabular-nums" id="balance" name="balance" inputMode="decimal" required placeholder={current} />
        <p className="muted mt-1 text-xs">
          Confira o saldo no app do banco e digite aqui. O Flowly lança a diferença como &quot;Ajuste de saldo&quot;, que corrige o
          saldo sem contar como receita ou despesa.
        </p>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="sm:w-auto">Ajustar saldo</SubmitButton>
    </form>
  );
}
