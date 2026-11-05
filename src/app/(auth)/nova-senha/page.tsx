"use client";

import { useActionState } from "react";
import { updatePassword } from "../actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export default function NewPasswordPage() {
  const [state, action] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <h2 className="text-lg font-semibold">Criar nova senha</h2>
      <div>
        <label className="label" htmlFor="password">Nova senha</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <p className="muted mt-1 text-xs">Mínimo de 8 caracteres, com letras e números.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Salvar e entrar</SubmitButton>
    </form>
  );
}
