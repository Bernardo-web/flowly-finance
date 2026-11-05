"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUp } from "../actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

function SignUpForm() {
  const [state, action] = useActionState(signUp, undefined);
  const invite = useSearchParams().get("convite") ?? "";

  if (state?.ok) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold">Quase lá!</h2>
        <FormMessage state={state} />
        <Link href="/entrar" className="btn-ghost justify-center">Ir para o login</Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <h2 className="text-lg font-semibold">Criar conta</h2>
      <div>
        <label className="label" htmlFor="invite_code">Código do convite</label>
        <input
          className="input font-mono uppercase tracking-wider"
          id="invite_code"
          name="invite_code"
          defaultValue={invite}
          autoComplete="off"
          maxLength={20}
        />
      </div>
      <div>
        <label className="label" htmlFor="full_name">Nome</label>
        <input className="input" id="full_name" name="full_name" autoComplete="name" maxLength={120} required />
      </div>
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Senha</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <p className="muted mt-1 text-xs">Mínimo de 8 caracteres, com letras e números.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Criar conta</SubmitButton>
      <p className="muted text-center text-xs">
        Ao criar a conta, você concorda com a <Link href="/privacidade" className="underline">política de privacidade</Link>.
      </p>
      <p className="muted text-center text-sm">
        Já tem conta? <Link href="/entrar" className="text-brand-700 hover:underline">Entrar</Link>
      </p>
    </form>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
