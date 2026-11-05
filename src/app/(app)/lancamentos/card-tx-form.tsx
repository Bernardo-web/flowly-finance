"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { CategoryOptions } from "@/components/category-select";
import type { Category } from "@/lib/data";
import type { ActionState } from "./actions";

export function CardTxForm({
  action,
  categories,
  defaults,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  categories: Category[];
  defaults: { description: string; category_id: string | null; notes: string };
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="description">Descrição</label>
        <input className="input" id="description" name="description" maxLength={200} required defaultValue={defaults.description} />
      </div>
      <div>
        <label className="label" htmlFor="category_id">Categoria</label>
        <select className="input" id="category_id" name="category_id" defaultValue={defaults.category_id ?? ""}>
          <option value="">Sem categoria</option>
          <CategoryOptions categories={categories} kind="expense" />
        </select>
      </div>
      <div>
        <label className="label" htmlFor="notes">Observação</label>
        <textarea className="input" id="notes" name="notes" rows={2} maxLength={1000} defaultValue={defaults.notes} />
      </div>
      <FormMessage state={state} />
      <SubmitButton>Salvar</SubmitButton>
    </form>
  );
}
