"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signIn } from "../actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

function LoginForm() {
  const [state, action] = useActionState(signIn, undefined);
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const linkError =
    params.get("erro") === "link-invalido" ? { error: "Este link expirou ou já foi usado. Tente de novo." } : undefined;

  return (
    <form action={action} className="space-y-4">
      <h2 className="text-lg font-semibold">Entrar</h2>
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="password">Senha</label>
          <Link href="/recuperar" className="text-sm text-brand-700 hover:underline">Esqueci a senha</Link>
        </div>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <FormMessage state={state ?? linkError} />
      <SubmitButton>Entrar</SubmitButton>
      <p className="muted text-center text-sm">O Flowly funciona por convite. Recebeu um link? Abra-o para criar sua conta.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
