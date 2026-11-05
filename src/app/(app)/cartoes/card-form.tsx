"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { ColorPicker } from "@/components/page-header";
import type { ActionState } from "./actions";

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  defaults?: { name: string; limit: string; closing_day: number; due_day: number; color: string };
};

export function CardForm({ action, defaults }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="name">Nome</label>
        <input className="input" id="name" name="name" maxLength={60} required defaultValue={defaults?.name} placeholder="Ex.: Ourocard, Nubank" />
      </div>
      <div>
        <label className="label" htmlFor="limit">Limite (R$)</label>
        <input className="input tabular-nums" id="limit" name="limit" inputMode="decimal" defaultValue={defaults?.limit} placeholder="0,00" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="closing_day">Dia do fechamento</label>
          <input className="input" id="closing_day" name="closing_day" type="number" min={1} max={31} required defaultValue={defaults?.closing_day} />
        </div>
        <div>
          <label className="label" htmlFor="due_day">Dia do vencimento</label>
          <input className="input" id="due_day" name="due_day" type="number" min={1} max={31} required defaultValue={defaults?.due_day} />
        </div>
      </div>
      <p className="muted text-xs">
        Compras até a véspera do fechamento entram na fatura do mês; a partir do dia do fechamento, na fatura seguinte.
        Os dois dias aparecem no app do banco.
      </p>
      <ColorPicker value={defaults?.color ?? "#7c3aed"} />
      <FormMessage state={state} />
      <SubmitButton>Salvar</SubmitButton>
    </form>
  );
}
