/**
 * Leitor de OFX (formato padrão de extrato aceito pela maioria dos bancos:
 * BB, Caixa, Itaú, Bradesco, Santander, Nubank, Inter, C6...).
 * Funciona com OFX 1.x (SGML, tags sem fechamento) e 2.x (XML).
 * O FITID (identificador único da transação no banco) é usado para detectar duplicados.
 */
import { parseAmountToCents } from "../money/cents.ts";
import { fingerprint, normalizeText } from "./normalize.ts";
import { finalize, skipReasonFor, type ImportError, type ImportRow, type ParsedStatement } from "./common.ts";

export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 4000).toUpperCase();
  return head.includes("<OFX>") || head.includes("OFXHEADER") || head.includes("<STMTTRN>");
}

/** Valor de uma tag: "<TAG>valor" até a próxima tag ou quebra de linha. */
function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  return m ? m[1].trim() : "";
}

/** "20261031120000[-3:BRT]" -> "2026-10-31" */
function ofxDate(raw: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** Decodifica entidades simples que aparecem em OFX gerado por bancos. */
function decode(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseOfx(text: string): ParsedStatement {
  const org = tag(text, "ORG") || tag(text, "BANKID") || "banco";
  const bank = `ofx:${normalizeText(org).slice(0, 12) || "banco"}`;
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];

  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  if (blocks.length === 0) {
    return { bank, format: "ofx", rows: [], period: null, errors: [{ line: 1, message: "Nenhuma movimentação encontrada no arquivo OFX." }] };
  }

  blocks.forEach((block, i) => {
    const n = i + 1;
    const occurredOn = ofxDate(tag(block, "DTPOSTED"));
    if (!occurredOn) return void errors.push({ line: n, message: "Movimentação com data inválida." });
    const amountCents = parseAmountToCents(tag(block, "TRNAMT"));
    if (amountCents === null) return void errors.push({ line: n, message: "Movimentação com valor inválido." });
    if (amountCents === 0) return;

    const memo = decode(tag(block, "MEMO"));
    const name = decode(tag(block, "NAME"));
    // alguns bancos colocam o detalhe no MEMO, outros no NAME; junta sem repetir
    const description = name && memo && !normalizeText(memo).includes(normalizeText(name))
      ? `${name} ${memo}`.slice(0, 200)
      : (memo || name || "Sem descrição").slice(0, 200);
    const fitid = tag(block, "FITID");
    const skipReason = skipReasonFor(description);

    rows.push({
      line: n,
      occurredOn,
      amountCents,
      type: amountCents > 0 ? "income" : "expense",
      description,
      bankDescription: description,
      bankCategory: "",
      bankSubcategory: "",
      suggestedCategorySlug: null,
      selected: skipReason === null,
      skipReason,
      // FITID é único por conta no banco: a melhor chave contra duplicados
      fingerprint: fitid ? `fitid:${fitid.slice(0, 120)}` : fingerprint(occurredOn, amountCents, description),
    });
  });

  return finalize(bank, "ofx", rows, errors);
}
