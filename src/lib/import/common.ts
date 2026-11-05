/** Tipos e regras compartilhados pelos leitores de extrato (BB CSV, OFX, CSV genérico). */
import { normalizeText } from "./normalize.ts";

export type SkipReason = "investimento" | "estorno";

export type ImportRow = {
  line: number;                 // linha ou posição no arquivo (para mensagens de erro)
  occurredOn: string;           // ISO yyyy-mm-dd
  amountCents: number;          // com sinal: negativo = saída
  type: "income" | "expense";
  description: string;          // texto que aparece no app
  bankDescription: string;      // texto original do banco, guardado para auditoria
  bankCategory: string;
  bankSubcategory: string;
  suggestedCategorySlug: string | null;
  selected: boolean;            // vem marcado na prévia?
  skipReason: SkipReason | null;
  fingerprint: string;
};

export type ImportError = { line: number; message: string };

export type ParsedStatement = {
  bank: string;                 // "bb", "ofx:<banco>", "csv"
  format: "csv" | "ofx";
  rows: ImportRow[];
  errors: ImportError[];
  period: { from: string; to: string } | null;
  balance?: { cents: number; date: string } | null; // saldo informado pelo banco no arquivo (OFX)
};

const REVERSALS = ["pix rejeitado", "pix envio devolvido", "pix recebimento devolvido", "devolucao pix", "estorno pix"];

/**
 * Movimentos que não são receita nem despesa de verdade e vêm desmarcados:
 * - aplicação/resgate automático (BB Rende Fácil): só dinheiro indo e voltando;
 * - estornos de Pix: devolvem um Pix que não deu certo.
 */
export function skipReasonFor(description: string, bankCategory = ""): SkipReason | null {
  const d = normalizeText(description);
  if (normalizeText(bankCategory) === "investimentos" || d.includes("rende facil")) return "investimento";
  if (REVERSALS.some((r) => d.startsWith(r))) return "estorno";
  return null;
}

/** Ordena (mais recentes primeiro) e calcula o período coberto. */
export function finalize(bank: string, format: "csv" | "ofx", rows: ImportRow[], errors: ImportError[]): ParsedStatement {
  rows.sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : a.line - b.line));
  const dates = rows.map((r) => r.occurredOn).sort();
  return {
    bank,
    format,
    rows,
    errors,
    period: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
  };
}

/** Divide uma linha de CSV respeitando aspas. */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}
