import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { X } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { categoryTree, getCategories } from "@/lib/data";
import { isUuid } from "@/lib/validation";
import { PageHeader } from "@/components/page-header";
import { CategoryForm } from "../category-form";
import { deleteRule, setCategoryArchived, updateCategory } from "../actions";

export const metadata: Metadata = { title: "Editar categoria" };

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await getUser();
  const categories = await getCategories(supabase, true);
  const category = categories.find((c) => c.id === id);
  if (!category) notFound();

  const { data: rules } = await supabase
    .from("category_rules")
    .select("id, pattern, hits")
    .eq("category_id", id)
    .order("hits", { ascending: false });

  const parents = categoryTree(categories.filter((c) => !c.archived), category.kind)
    .filter((p) => p.id !== id)
    .map(({ id, name }) => ({ id, name }));

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={category.name} back="/categorias" subtitle={category.kind === "income" ? "Receita" : "Despesa"} />

      <CategoryForm
        action={updateCategory.bind(null, id)}
        kind={category.kind}
        parents={parents}
        defaults={{ name: category.name, parent_id: category.parent_id, color: category.color }}
      />

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">O que o Flowly aprendeu</h2>
        {(rules ?? []).length === 0 ? (
          <p className="muted text-sm">
            Ainda nada. Ao importar um extrato e escolher esta categoria para um lançamento, o Flowly passa a sugeri-la
            para descrições parecidas.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(rules ?? []).map((r) => (
              <li key={r.id} className="flex items-center gap-1 rounded-full border border-[var(--border)] py-1 pl-3 pr-1 text-sm">
                <span>“{r.pattern}”</span>
                <form action={deleteRule}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="category_id" value={id} />
                  <button aria-label={`Esquecer "${r.pattern}"`} className="muted rounded-full p-1 hover:bg-black/5 dark:hover:bg-white/5">
                    <X className="size-3.5" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={setCategoryArchived} className="card p-5">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="archived" value={String(!category.archived)} />
        <button className="btn-ghost w-full justify-center">
          {category.archived ? "Reativar categoria" : "Arquivar categoria"}
        </button>
        {!category.archived && (
          <p className="muted mt-2 text-xs">Lançamentos antigos continuam com ela; só deixa de aparecer nas opções.</p>
        )}
      </form>
    </div>
  );
}
