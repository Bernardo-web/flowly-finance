/**
 * Leitor do CSV exportado pelo Banco do Brasil.
 *
 * Cabeçalho esperado (separador ";"):
 * Descrição;Valor;Data;Quantidade de Parcelas;Número da Parcela;Descrição Complementar;
 * Categoria;Sub-Categoria;Origem;Instituição;Agência;Conta
 *
 * Regras (validadas com um extrato real de 539 linhas):
 * - Saídas vêm com dois sinais de menos ("--11.00").
 * - Em lançamentos genéricos ("Pix Enviado", "Compra com Cartão"...), o nome útil
 *   (quem recebeu, a loja) está em "Descrição Complementar".
 * - BB Rende Fácil (aplicação/resgate) é só dinheiro indo e voltando da conta salário:
 *   vem desmarcado por padrão.
 * - Estornos de Pix não são receita: vêm desmarcados por padrão.
 * - Linhas idênticas dentro do mesmo arquivo são mantidas (compras repetidas são reais);
 *   duplicados são checados só contra o que já está salvo no app.
 * - Agência e Conta são ignoradas e nunca saem deste módulo.
 */
import { parseAmountToCents } from "../money/cents.ts";
import { fingerprint, normalizeText, parseBrDate } from "./normalize.ts";
import { finalize, skipReasonFor, splitCsvLine, type ImportError, type ImportRow, type ParsedStatement } from "./common.ts";

export type { ImportRow, ParsedStatement, SkipReason } from "./common.ts";

const REQUIRED_HEADERS = ["descricao", "valor", "data", "descricao complementar", "categoria", "sub categoria"];

// Descrições do BB que não dizem nada sozinhas; o detalhe vem na coluna complementar.
const GENERIC_DESCRIPTIONS = new Set([
  "pix enviado",
  "pix recebido",
  "pix agendado",
  "compra com cartao",
  "transferencia recebida",
  "transferencia enviada",
  "ted recebida",
  "ted enviada",
  "pagamento de boleto",
  "pagto cobranca",
]);

// Categoria do BB -> categoria padrão do Flowly (ver seed_default_categories no schema).
const CATEGORY_MAP: Record<string, { default: string | null; sub?: Record<string, string> }> = {
  "alimentacao": {
    default: "alimentacao",
    sub: { "bar rest e padaria": "alimentacao-rest", "feira e supermercado": "alimentacao-mercado" },
  },
  "casa": { default: "moradia", sub: { "moveis e utensilios": "moradia-itens" } },
  "comunicacao": { default: "comunicacao" },
  "despesas pessoais": {
    default: "pessoal",
    sub: { "compras diversas": "compras", "servicos diversos": "servicos" },
  },
  "educacao": { default: "educacao" },
  "lazer": {
    default: "lazer",
    sub: { "jogos e loterias": "lazer-jogos", "viagens e lazer": "lazer-viagens" },
  },
  "saude": { default: "saude" },
  "tarifas e impostos": { default: "tarifas" },
  "transporte": {
    default: "transporte",
    sub: {
      "combustivel": "transporte-comb",
      "estacionamento e pedagio": "transporte-estac",
      "servicos e manutencao": "transporte-manut",
      "transporte urbano e apps": "transporte-apps",
    },
  },
  "receitas": { default: "outras-receitas" },
  "outros": { default: null }, // o BB não sabe; o usuário decide (e o app aprende)
};

const INCOME_SLUGS = new Set(["salario", "renda-extra", "rendimentos", "reembolsos", "outras-receitas"]);

function mapBankCategory(category: string, subcategory: string, type: "income" | "expense"): string | null {
  const entry = CATEGORY_MAP[normalizeText(category)];
  if (!entry) return null;
  const slug = entry.sub?.[normalizeText(subcategory)] ?? entry.default;
  if (!slug) return null;
  // categoria de despesa num valor de entrada (ou o contrário) não faz sentido
  const isIncomeSlug = INCOME_SLUGS.has(slug);
  if ((type === "income") !== isIncomeSlug) return null;
  return slug;
}

/** Reconhece se o texto parece um CSV do BB, sem ler tudo. */
export function looksLikeBbCsv(text: string): boolean {
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const headers = splitCsvLine(first, ";").map(normalizeText);
  return REQUIRED_HEADERS.every((h) => headers.includes(h));
}

export function parseBbCsv(text: string): ParsedStatement {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headers = splitCsvLine(lines[0] ?? "", ";").map(normalizeText);
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return {
      bank: "bb", format: "csv", rows: [], period: null,
      errors: [{ line: 1, message: `Arquivo não parece um extrato CSV do Banco do Brasil (faltam colunas: ${missing.join(", ")}).` }],
    };
  }
  const col = (name: string) => headers.indexOf(name);
  const iDesc = col("descricao"), iVal = col("valor"), iDate = col("data");
  const iComp = col("descricao complementar"), iCat = col("categoria"), iSub = col("sub categoria");

  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];

  for (let n = 1; n < lines.length; n++) {
    const raw = lines[n];
    if (!raw || raw.trim() === "") continue;
    const line = n + 1;
    const cells = splitCsvLine(raw, ";");

    const occurredOn = parseBrDate(cells[iDate] ?? "");
    if (!occurredOn) { errors.push({ line, message: `Data inválida: "${cells[iDate] ?? ""}"` }); continue; }

    const amountCents = parseAmountToCents(cells[iVal] ?? "");
    if (amountCents === null) { errors.push({ line, message: `Valor inválido: "${cells[iVal] ?? ""}"` }); continue; }
    if (amountCents === 0) continue; // linha informativa, sem movimento

    const bankDescription = (cells[iDesc] ?? "").trim();
    const complement = (cells[iComp] ?? "").trim();
    const bankCategory = (cells[iCat] ?? "").trim();
    const bankSubcategory = (cells[iSub] ?? "").trim();
    const normDesc = normalizeText(bankDescription);
    const type = amountCents > 0 ? "income" : "expense";

    const description =
      (GENERIC_DESCRIPTIONS.has(normDesc) && complement ? complement : bankDescription) || complement || "Sem descrição";

    const skipReason = skipReasonFor(bankDescription, bankCategory);

    rows.push({
      line,
      occurredOn,
      amountCents,
      type,
      description,
      bankDescription: complement && complement !== bankDescription ? `${bankDescription} — ${complement}` : bankDescription,
      bankCategory,
      bankSubcategory,
      suggestedCategorySlug: skipReason ? null : mapBankCategory(bankCategory, bankSubcategory, type),
      selected: skipReason === null,
      skipReason,
      fingerprint: fingerprint(occurredOn, amountCents, description),
    });
  }

  return finalize("bb", "csv", rows, errors);
}
