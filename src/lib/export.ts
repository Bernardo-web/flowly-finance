/** Exportação em CSV no padrão brasileiro (abre direto no Excel): separador ";" e vírgula decimal. */

/**
 * Protege a célula: aspas quando precisa, e um apóstrofo antes de textos que o Excel
 * interpretaria como fórmula (=, +, -, @) — evita "injeção de fórmula" ao abrir o arquivo.
 */
export function csvCell(value: string | number | null | undefined, isText = true): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (isText && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function centsToBr(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export function toCsv(header: string[], rows: (string | number | null)[][], numericCols: number[] = []): string {
  const lines = [header.map((h) => csvCell(h)).join(";")];
  for (const r of rows) lines.push(r.map((c, i) => csvCell(c, !numericCols.includes(i))).join(";"));
  // BOM para o Excel reconhecer acentos
  return "﻿" + lines.join("\r\n") + "\r\n";
}
