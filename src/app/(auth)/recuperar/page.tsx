"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export default function RecoverPage() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="space-y-4">
      <h2 className="text-lg font-semibold">Recuperar senha</h2>
      <div>
        <label className="label" htmlFor="email">E-mail da conta</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton>Enviar link</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/entrar" className="text-brand-700 hover:underline">Voltar para o login</Link>
      </p>
    </form>
  );
}
