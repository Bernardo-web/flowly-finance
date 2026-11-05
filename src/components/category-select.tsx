import type { Category } from "@/lib/data";
import { categoryTree } from "@/lib/data";

/** Select de categorias agrupadas (pai › filhos), filtradas por receita ou despesa. */
export function CategoryOptions({ categories, kind }: { categories: Category[]; kind: "income" | "expense" }) {
  return (
    <>
      {categoryTree(categories, kind).map((p) =>
        p.children.length === 0 ? (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ) : (
          <optgroup key={p.id} label={p.name}>
            <option value={p.id}>{p.name} (geral)</option>
            {p.children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ),
      )}
    </>
  );
}
