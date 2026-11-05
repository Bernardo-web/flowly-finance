"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { ColorPicker } from "@/components/page-header";
import { ACCOUNT_KINDS } from "@/lib/validation";
import type { ActionState } from "./actions";

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  defaults?: { name: string; kind: string; initial_balance: string; color: string };
};

export function AccountForm({ action, defaults }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="name">Nome</label>
        <input className="input" id="name" name="name" maxLength={60} required defaultValue={defaults?.name} placeholder="Ex.: Banco do Brasil" />
      </div>
      <div>
        <label className="label" htmlFor="kind">Tipo</label>
        <select className="input" id="kind" name="kind" defaultValue={defaults?.kind ?? "checking"}>
          {Object.entries(ACCOUNT_KINDS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="initial_balance">Saldo inicial (R$)</label>
        <input
          className="input tabular-nums"
          id="initial_balance"
          name="initial_balance"
          inputMode="decimal"
          defaultValue={defaults?.initial_balance}
          placeholder="0,00"
        />
        <p className="muted mt-1 text-xs">
          Para começar do zero, use o saldo de hoje. Vai importar o extrato? Deixe 0 e informe o saldo real no fim da
          importação: o Flowly acerta a diferença. Use o sinal de menos se estiver negativa.
        </p>
      </div>
      <ColorPicker value={defaults?.color} />
      <FormMessage state={state} />
      <SubmitButton>Salvar</SubmitButton>
    </form>
  );
}
