import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data";
import { getBudgetRows } from "@/lib/budgets";
import { monthLabel, monthTitle, parseMonth, shiftMonth } from "@/lib/dates";
import { formatCents } from "@/lib/money/cents";
import { PageHeader } from "@/components/page-header";
import { copyBudgets, setBudget } from "./actions";

export const metadata: Metadata = { title: "Orçamentos" };

const TONE = { ok: "var(--color-brand-600)", warning: "#d97706", over: "var(--color-expense)" } as const;

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  const month = parseMonth(mes);
  const prev = shiftMonth(month, -1);
  const { supabase } = await getUser();
  const categories = await getCategories(supabase, true);
  const rows = await getBudgetRows(supabase, month, categories);
  const withLimit = rows.filter((r) => r.limitCents !== null);

  const { count: prevCount } = withLimit.length === 0
    ? await supabase.from("budgets").select("id", { count: "exact", head: true }).eq("month", `${prev}-01`)
    : { count: 0 };

  const totalLimit = withLimit.reduce((s, r) => s + (r.limitCents ?? 0), 0);
  const totalSpent = withLimit.reduce((s, r) => s + r.spentCents, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Orçamentos" subtitle="Defina quanto quer gastar por categoria. O Flowly avisa ao passar de 80% e de 100%." />

      <div className="card flex items-center justify-between p-2">
        <Link href={`/orcamentos?mes=${prev}`} className="btn-ghost border-0 p-2" aria-label="Mês anterior"><ChevronLeft className="size-5" /></Link>
        <span className="font-semibold">{monthTitle(month)}</span>
        <Link href={`/orcamentos?mes=${shiftMonth(month, 1)}`} className="btn-ghost border-0 p-2" aria-label="Próximo mês"><ChevronRight className="size-5" /></Link>
      </div>

      {withLimit.length > 0 && (
        <div className="card p-4 text-sm">
          Gasto nas categorias com limite: <strong className="tabular-nums">{formatCents(totalSpent)}</strong> de{" "}
          <strong className="tabular-nums">{formatCents(totalLimit)}</strong>
        </div>
      )}

      {(prevCount ?? 0) > 0 && (
        <form action={copyBudgets} className="card flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
          <input type="hidden" name="from" value={prev} />
          <input type="hidden" name="to" value={month} />
          <p className="flex-1 text-sm">Este mês ainda não tem limites. Quer repetir os de {monthLabel(prev)}?</p>
          <button className="btn-primary">Usar os mesmos limites</button>
        </form>
      )}

      <ul className="card divide-y divide-[var(--border)]">
        {rows.map((r) => (
          <li key={r.category.id} className="space-y-2 p-4">
            <div className="flex items-center gap-3">
              <span className="size-3 shrink-0 rounded-full" style={{ background: r.category.color }} />
              <span className="flex-1 truncate font-medium">{r.category.name}</span>
              <span className="text-sm tabular-nums">
                {formatCents(r.spentCents)}
                {r.limitCents !== null && <span className="muted"> / {formatCents(r.limitCents)}</span>}
              </span>
            </div>
            {r.limitCents !== null && (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(r.share, 1) * 100}%`, background: TONE[r.level!] }} />
                </div>
                <p className="text-xs" style={{ color: r.level === "ok" ? "var(--muted)" : TONE[r.level!] }}>
                  {r.level === "over"
                    ? `Estourou em ${formatCents(r.spentCents - r.limitCents)}`
                    : `Restam ${formatCents(r.limitCents - r.spentCents)}${r.level === "warning" ? " — atenção, passou de 80%" : ""}`}
                </p>
              </>
            )}
            <form action={setBudget} className="flex gap-2">
              <input type="hidden" name="category_id" value={r.category.id} />
              <input type="hidden" name="month" value={month} />
              <input
                className="input py-1.5 text-sm tabular-nums"
                name="limit"
                inputMode="decimal"
                placeholder={r.limitCents === null ? "Limite do mês (R$)" : "Deixe vazio para remover"}
                defaultValue={r.limitCents !== null ? (r.limitCents / 100).toFixed(2).replace(".", ",") : ""}
                aria-label={`Limite para ${r.category.name}`}
              />
              <button className="btn-ghost py-1.5 text-sm">Salvar</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
