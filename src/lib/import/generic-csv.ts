/**
 * Leitor de CSV de qualquer banco. Reconhece as colunas pelos nomes mais comuns
 * (Nubank, Inter, C6, PicPay, Mercado Pago, Caixa...) e, se não reconhecer,
 * deixa o usuário indicar quais colunas são data, descrição e valor.
 */
import { parseAmountToCents } from "../money/cents.ts";
import { fingerprint, normalizeText } from "./normalize.ts";
import { finalize, skipReasonFor, splitCsvLine, type ImportError, type ImportRow, type ParsedStatement } from "./common.ts";

export type DateFormat = "dmy" | "ymd" | "mdy";

export type CsvMapping = {
  date: number;
  description: number;
  amount: number | null;     // coluna única com sinal
  credit: number | null;     // ou colunas separadas de entrada e saída
  debit: number | null;
  invert: boolean;           // inverte o sinal (ex.: fatura de cartão em que compra vem positiva)
  dateFormat: DateFormat;
};

export type CsvTable = { separator: string; headers: string[]; rows: string[][] };

const DATE_NAMES = ["data", "data lancamento", "data de lancamento", "data movimento", "data da transacao", "data transacao", "date", "dt lancamento"];
const DESC_NAMES = ["descricao", "historico", "title", "titulo", "lancamento", "estabelecimento", "detalhes", "memo", "description", "identificacao"];
const AMOUNT_NAMES = ["valor", "amount", "valor r", "valor rs", "quantia", "valor da transacao", "valor final"];
const CREDIT_NAMES = ["credito", "entrada", "entradas", "valor credito"];
const DEBIT_NAMES = ["debito", "saida", "saidas", "valor debito"];

export function detectSeparator(headerLine: string): string {
  const counts = [";", ",", "\t"].map((s) => [s, splitCsvLine(headerLine, s).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ";";
}

/** Lê o CSV em tabela, pulando linhas de título antes do cabeçalho (comum em extratos). */
export function readCsvTable(text: string): CsvTable | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;
  // cabeçalho = primeira linha (entre as 15 primeiras) que tem uma coluna de data reconhecível
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const sep = detectSeparator(lines[i]);
    const cells = splitCsvLine(lines[i], sep).map(normalizeText);
    if (cells.length > 1 && cells.some((c) => DATE_NAMES.includes(c))) { headerIdx = i; break; }
  }
  const separator = detectSeparator(lines[headerIdx]);
  const headers = splitCsvLine(lines[headerIdx], separator);
  const rows = lines.slice(headerIdx + 1).map((l) => splitCsvLine(l, separator));
  return { separator, headers, rows };
}

function findCol(norm: string[], names: string[]): number | null {
  for (const n of names) {
    const i = norm.indexOf(n);
    if (i !== -1) return i;
  }
  // nome parecido ("valor (r$)" -> "valor r")
  for (const n of names) {
    const i = norm.findIndex((h) => h.startsWith(n));
    if (i !== -1) return i;
  }
  return null;
}

function parseDate(raw: string, fmt: DateFormat): string | null {
  const s = raw.trim().slice(0, 10);
  let y: number, m: number, d: number;
  let mt = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (mt) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else {
    mt = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
    if (!mt) return null;
    const a = Number(mt[1]), b = Number(mt[2]);
    y = Number(mt[3]) < 100 ? 2000 + Number(mt[3]) : Number(mt[3]);
    [d, m] = fmt === "mdy" ? [b, a] : [a, b];
  }
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}

/** dd/mm é o padrão no Brasil; mm/dd só se algum "dia" passar de 12 na segunda posição. */
function guessDateFormat(samples: string[]): DateFormat {
  if (samples.some((s) => /^\d{4}[-/.]/.test(s.trim()))) return "ymd";
  const secondOver12 = samples.some((s) => {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]/.exec(s.trim());
    return m ? Number(m[2]) > 12 : false;
  });
  return secondOver12 ? "mdy" : "dmy";
}

/** Tenta descobrir sozinho as colunas. Devolve null se faltar data, descrição ou valor. */
export function guessMapping(table: CsvTable): CsvMapping | null {
  const norm = table.headers.map(normalizeText);
  const date = findCol(norm, DATE_NAMES);
  const description = findCol(norm, DESC_NAMES);
  const amount = findCol(norm, AMOUNT_NAMES);
  const credit = findCol(norm, CREDIT_NAMES);
  const debit = findCol(norm, DEBIT_NAMES);
  if (date === null || description === null) return null;
  if (amount === null && (credit === null || debit === null)) return null;
  return {
    date,
    description,
    amount,
    credit: amount === null ? credit : null,
    debit: amount === null ? debit : null,
    invert: false,
    dateFormat: guessDateFormat(table.rows.slice(0, 30).map((r) => r[date] ?? "")),
  };
}

export function parseGenericCsv(table: CsvTable, map: CsvMapping): ParsedStatement {
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];

  table.rows.forEach((cells, i) => {
    const line = i + 2;
    const rawDate = cells[map.date] ?? "";
    if (rawDate.trim() === "") return; // linhas de total/rodapé
    const occurredOn = parseDate(rawDate, map.dateFormat);
    if (!occurredOn) return void errors.push({ line, message: `Data inválida: "${rawDate}"` });

    let cents: number | null;
    if (map.amount !== null) cents = parseAmountToCents(cells[map.amount] ?? "");
    else {
      const c = parseAmountToCents(cells[map.credit ?? -1] || "0") ?? 0;
      const d = parseAmountToCents(cells[map.debit ?? -1] || "0") ?? 0;
      cents = Math.abs(c) - Math.abs(d);
    }
    if (cents === null) return void errors.push({ line, message: `Valor inválido na linha ${line}` });
    if (cents === 0) return;
    if (map.invert) cents = -cents;

    const description = (cells[map.description] ?? "").trim().slice(0, 200) || "Sem descrição";
    const skipReason = skipReasonFor(description);
    rows.push({
      line,
      occurredOn,
      amountCents: cents,
      type: cents > 0 ? "income" : "expense",
      description,
      bankDescription: description,
      bankCategory: "",
      bankSubcategory: "",
      suggestedCategorySlug: null,
      selected: skipReason === null,
      skipReason,
      fingerprint: fingerprint(occurredOn, cents, description),
    });
  });

  return finalize("csv", "csv", rows, errors);
}
