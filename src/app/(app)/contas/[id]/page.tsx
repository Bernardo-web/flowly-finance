import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import { formatCents } from "@/lib/money/cents";
import { PageHeader } from "@/components/page-header";
import { AccountForm } from "../account-form";
import { deleteAccount, setAccountArchived, updateAccount } from "../actions";

export const metadata: Metadata = { title: "Editar conta" };

function centsToInput(c: number) {
  return (c / 100).toFixed(2).replace(".", ",");
}

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await getUser();

  const [{ data: account }, { data: bal }, { count }] = await Promise.all([
    supabase.from("accounts").select("id, name, kind, initial_balance_cents, color, archived").eq("id", id).maybeSingle(),
    supabase.from("account_balances").select("balance_cents").eq("account_id", id).maybeSingle(),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("account_id", id),
  ]);
  if (!account) notFound();
  const txCount = count ?? 0;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title={account.name}
        back="/contas"
        subtitle={<>Saldo atual: <strong className="tabular-nums">{formatCents(Number(bal?.balance_cents ?? 0))}</strong></>}
      />

      <Link href={`/lancamentos?conta=${account.id}`} className="btn-ghost w-full justify-center">
        Ver lançamentos desta conta ({txCount})
      </Link>

      <AccountForm
        action={updateAccount.bind(null, account.id)}
        defaults={{
          name: account.name,
          kind: account.kind,
          initial_balance: centsToInput(Number(account.initial_balance_cents)),
          color: account.color,
        }}
      />

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Outras ações</h2>
        <form action={setAccountArchived}>
          <input type="hidden" name="id" value={account.id} />
          <input type="hidden" name="archived" value={String(!account.archived)} />
          <button className="btn-ghost w-full justify-center">
            {account.archived ? "Reativar conta" : "Arquivar conta"}
          </button>
        </form>
        {txCount === 0 ? (
          <form action={deleteAccount}>
            <input type="hidden" name="id" value={account.id} />
            <button className="btn-ghost w-full justify-center text-expense">Excluir conta</button>
          </form>
        ) : (
          <p className="muted text-xs">
            Contas com lançamentos não podem ser excluídas, para não apagar seu histórico. Arquive para escondê-la.
          </p>
        )}
      </section>
    </div>
  );
}
