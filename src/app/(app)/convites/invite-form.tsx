"use client";

import { useActionState, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { createInvite } from "./actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

export function InviteForm() {
  const [state, action] = useActionState(createInvite, undefined);
  return (
    <form action={action} className="card space-y-4 p-5">
      <h2 className="font-semibold">Novo convite</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div>
          <label className="label" htmlFor="note">Para quem? (opcional)</label>
          <input className="input" id="note" name="note" maxLength={120} placeholder="Ex.: Mãe" />
        </div>
        <div>
          <label className="label" htmlFor="max_uses">Usos</label>
          <input className="input" id="max_uses" name="max_uses" type="number" min={1} max={50} defaultValue={1} />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="sm:w-auto">Gerar link de convite</SubmitButton>
    </form>
  );
}

export function ShareInvite({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const text = "Você foi convidado para o Flowly, meu organizador financeiro. Crie sua conta por este link:";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Convite para o Flowly", text, url });
        return;
      } catch {
        /* usuário cancelou: cai para copiar */
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={share} className="btn-ghost text-sm" aria-label="Compartilhar link do convite">
      {copied ? <Check className="size-4 text-income" /> : <Share2 className="size-4" />}
      {copied ? "Copiado" : "Enviar"}
    </button>
  );
}
