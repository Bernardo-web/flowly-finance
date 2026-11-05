"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import { deleteAccount, updateProfile } from "./actions";

export function ProfileForm({ name }: { name: string }) {
  const [state, action] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="full_name">Nome</label>
        <input className="input" id="full_name" name="full_name" maxLength={120} required defaultValue={name} />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="sm:w-auto">Salvar</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccount, undefined);
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm">
        Apaga sua conta e <strong>todos</strong> os seus dados (contas, cartões, lançamentos, regras). Não dá para desfazer.
        Se quiser guardar uma cópia, exporte antes.
      </p>
      <div>
        <label className="label" htmlFor="confirm">Digite EXCLUIR para confirmar</label>
        <input className="input" id="confirm" name="confirm" autoComplete="off" />
      </div>
      <FormMessage state={state} />
      <button type="submit" className="btn-primary w-full bg-red-600 hover:bg-red-700 sm:w-auto">Excluir minha conta</button>
    </form>
  );
}
