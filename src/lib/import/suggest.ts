/**
 * Sugestão de categoria e marcação de duplicados na prévia da importação.
 * Funções puras: recebem os dados já buscados no banco e devolvem as linhas ajustadas.
 */
import { normalizeText } from "./normalize.ts";

export type CategoryRule = { pattern: string; categoryId: string };

export type Suggestable = {
  description: string;
  fingerprint: string;
  suggestedCategorySlug: string | null;
  selected: boolean;
};

export type Suggested<T> = T & {
  categoryId: string | null;
  categorySource: "rule" | "bank" | null;
  duplicate: boolean;
};

/**
 * Prioridade: regra aprendida do usuário (o padrão mais longo que bater) > categoria do banco.
 * Linhas já existentes no app (mesma impressão digital) vêm marcadas como duplicadas e desmarcadas.
 */
export function applySuggestions<T extends Suggestable>(
  rows: T[],
  rules: CategoryRule[],
  slugToId: Record<string, string>,
  existingCounts: Map<string, number>,
): Suggested<T>[] {
  const sortedRules = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);

  // quantas vezes cada impressão digital já está salva: se duas compras iguais
  // existem no arquivo e só uma no app, só uma é marcada como duplicada
  const remaining = new Map(existingCounts);

  return rows.map((row) => {
    const text = normalizeText(row.description);
    const rule = sortedRules.find((r) => text.includes(r.pattern));
    let categoryId: string | null = null;
    let categorySource: "rule" | "bank" | null = null;
    if (rule) {
      categoryId = rule.categoryId;
      categorySource = "rule";
    } else if (row.suggestedCategorySlug && slugToId[row.suggestedCategorySlug]) {
      categoryId = slugToId[row.suggestedCategorySlug];
      categorySource = "bank";
    }

    const left = remaining.get(row.fingerprint) ?? 0;
    const duplicate = left > 0;
    if (duplicate) remaining.set(row.fingerprint, left - 1);

    return { ...row, categoryId, categorySource, duplicate, selected: row.selected && !duplicate };
  });
}

/** Padrão a aprender quando o usuário escolhe uma categoria para uma descrição. */
export function ruleFromDescription(description: string): string | null {
  const p = normalizeText(description).slice(0, 80).trim();
  return p.length >= 2 ? p : null;
}
