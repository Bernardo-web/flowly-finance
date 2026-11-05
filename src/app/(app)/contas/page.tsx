import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, Wallet } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { getAccounts } from "@/lib/data";
import { formatCents } from "@/lib/money/cents";
import { ACCOUNT_KINDS, type AccountKind } from "@/lib/validation";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Contas" };

export default async function AccountsPage() {
  const { supabase } = await getUser();
  const accounts = await getAccounts(supabase, true);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const total = active.reduce((s, a) => s + a.balance_cents, 0);

  const row = (a: (typeof accounts)[number]) => (
    <li key={a.id}>
      <Link href={`/contas/${a.id}`} className="flex items-center gap-3 px-4 py-3.5">
        <span className="size-3 shrink-0 rounded-full" style={{ background: a.color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{a.name}</p>
          <p className="muted text-xs">{ACCOUNT_KINDS[a.kind as AccountKind] ?? a.kind}</p>
        </div>
        <span className={`font-semibold tabular-nums ${a.balance_cents < 0 ? "text-expense" : ""}`}>
          {formatCents(a.balance_cents)}
        </span>
        <ChevronRight className="muted size-4" />
      </Link>
    </li>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas"
        subtitle={active.length > 0 ? <>Saldo total: <strong className="tabular-nums">{formatCents(total)}</strong></> : undefined}
        action={
          <Link href="/contas/nova" className="btn-primary">
            <Plus className="size-4" /> <span className="hidden sm:inline">Nova conta</span>
          </Link>
        }
      />

      {active.length === 0 ? (
        <section className="card flex flex-col items-center gap-3 p-8 text-center">
          <div className="rounded-full bg-brand-50 p-3 text-brand-700"><Wallet className="size-6" /></div>
          <h2 className="font-semibold">Nenhuma conta ainda</h2>
          <p className="muted max-w-sm text-sm">Cadastre onde seu dinheiro fica: conta do banco, carteira digital, dinheiro em espécie.</p>
          <Link href="/contas/nova" className="btn-primary">Criar primeira conta</Link>
        </section>
      ) : (
        <>
          <ul className="card divide-y divide-[var(--border)]">{active.map(row)}</ul>
          <p className="muted px-1 text-xs">
            Saldo diferente do banco? Toque na conta e use <strong>Ajustar saldo</strong> com o valor que aparece no app do
            banco. No BB, use o &quot;Saldo do dia&quot; (conta-corrente + Rende Fácil).
          </p>
        </>
      )}

      {archived.length > 0 && (
        <details className="group">
          <summary className="muted cursor-pointer text-sm">Arquivadas ({archived.length})</summary>
          <ul className="card mt-2 divide-y divide-[var(--border)] opacity-70">{archived.map(row)}</ul>
        </details>
      )}
    </div>
  );
}
