import type { Metadata } from "next";
import { getUser } from "@/lib/supabase/server";
import { getAccounts, getCategories } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { ImportWizard } from "./import-wizard";
import { undoImport } from "./actions";

export const metadata: Metadata = { title: "Importar extrato" };

const when = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function ImportPage() {
  const { supabase } = await getUser();
  const [accounts, categories, { data: rules }, { data: imports }] = await Promise.all([
    getAccounts(supabase),
    getCategories(supabase),
    supabase.from("category_rules").select("pattern, category_id"),
    supabase
      .from("imports")
      .select("id, file_name, rows_imported, created_at, account_id")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Conta arquivada";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar extrato"
        subtitle="No app ou site do BB, exporte o extrato da conta em CSV e escolha o arquivo aqui."
      />

      <ImportWizard
        accounts={accounts.map(({ id, name }) => ({ id, name }))}
        categories={categories}
        rules={(rules ?? []).map((r) => ({ pattern: r.pattern as string, categoryId: r.category_id as string }))}
      />

      {(imports ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Importações recentes</h2>
          <ul className="card divide-y divide-[var(--border)]">
            {(imports ?? []).map((imp) => (
              <li key={imp.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{imp.file_name}</p>
                  <p className="muted text-xs">
                    {imp.rows_imported} lançamentos · {accountName(imp.account_id)} · {when.format(new Date(imp.created_at))}
                  </p>
                </div>
                <form action={undoImport}>
                  <input type="hidden" name="id" value={imp.id} />
                  <button className="btn-ghost py-1.5 text-sm text-expense" title="Apaga os lançamentos desta importação">
                    Desfazer
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="muted text-xs">Desfazer apaga só os lançamentos que vieram daquele arquivo; os feitos à mão continuam.</p>
        </section>
      )}
    </div>
  );
}
