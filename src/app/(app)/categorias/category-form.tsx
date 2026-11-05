"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { ColorPicker } from "@/components/page-header";
import type { ActionState } from "./actions";

type Parent = { id: string; name: string };

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  kind: "income" | "expense";
  parents: Parent[];
  defaults?: { name: string; parent_id: string | null; color: string };
  compact?: boolean;
};

export function CategoryForm({ action, kind, parents, defaults, compact }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && compact) ref.current?.reset();
  }, [state, compact]);

  return (
    <form ref={ref} action={formAction} className={compact ? "space-y-3" : "card space-y-4 p-5"}>
      <input type="hidden" name="kind" value={kind} />
      <div className={compact ? "grid gap-2 sm:grid-cols-[1fr_12rem]" : "space-y-4"}>
        <div>
          <label className="label" htmlFor={`name-${kind}`}>Nome</label>
          <input className="input" id={`name-${kind}`} name="name" maxLength={40} required defaultValue={defaults?.name} />
        </div>
        <div>
          <label className="label" htmlFor={`parent-${kind}`}>Dentro de</label>
          <select className="input" id={`parent-${kind}`} name="parent_id" defaultValue={defaults?.parent_id ?? ""}>
            <option value="">— Categoria principal —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      {!compact && <ColorPicker value={defaults?.color} />}
      <FormMessage state={state} />
      <SubmitButton className={compact ? "sm:w-auto" : ""}>{compact ? "Adicionar" : "Salvar"}</SubmitButton>
    </form>
  );
}
