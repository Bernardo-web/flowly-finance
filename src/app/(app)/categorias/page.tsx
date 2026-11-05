import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { categoryTree, getCategories, type Category } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { CategoryForm } from "./category-form";
import { createCategory } from "./actions";

export const metadata: Metadata = { title: "Categorias" };

function Section({ title, kind, categories }: { title: string; kind: "income" | "expense"; categories: Category[] }) {
  const tree = categoryTree(categories.filter((c) => !c.archived), kind);
  const archived = categories.filter((c) => c.archived && c.kind === kind && !c.parent_id);
  const link = (c: Category, child = false) => (
    <Link href={`/categorias/${c.id}`} className={`flex items-center gap-3 py-3 pr-4 ${child ? "pl-10" : "pl-4"}`}>
      <span className="size-3 shrink-0 rounded-full" style={{ background: c.color }} />
      <span className={`flex-1 ${child ? "text-sm" : "font-medium"}`}>{c.name}</span>
      <ChevronRight className="muted size-4" />
    </Link>
  );

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{title}</h2>
      <ul className="card divide-y divide-[var(--border)]">
        {tree.map((p) => (
          <li key={p.id}>
            {link(p)}
            {p.children.length > 0 && (
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {p.children.map((c) => <li key={c.id}>{link(c, true)}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-medium text-brand-700">+ Nova categoria de {title.toLowerCase()}</summary>
        <div className="mt-4">
          <CategoryForm action={createCategory} kind={kind} parents={tree.map(({ id, name }) => ({ id, name }))} compact />
        </div>
      </details>
      {archived.length > 0 && (
        <p className="muted text-xs">
          Arquivadas: {archived.map((c, i) => (
            <span key={c.id}>{i > 0 && ", "}<Link href={`/categorias/${c.id}`} className="underline">{c.name}</Link></span>
          ))}
        </p>
      )}
    </section>
  );
}

export default async function CategoriesPage() {
  const { supabase } = await getUser();
  const categories = await getCategories(supabase, true);
  return (
    <div className="space-y-8">
      <PageHeader title="Categorias" subtitle="Toque numa categoria para editar ou ver o que o Flowly aprendeu sobre ela." />
      <Section title="Despesas" kind="expense" categories={categories} />
      <Section title="Receitas" kind="income" categories={categories} />
    </div>
  );
}
