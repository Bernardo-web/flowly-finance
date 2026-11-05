import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseAmountToCents, formatCents } from "../src/lib/money/cents.ts";
import { normalizeText, parseBrDate } from "../src/lib/import/normalize.ts";
import { looksLikeBbCsv, parseBbCsv } from "../src/lib/import/bb-csv.ts";
import { applySuggestions, ruleFromDescription } from "../src/lib/import/suggest.ts";

const sample = readFileSync(new URL("./fixtures/bb-exemplo.csv", import.meta.url), "utf8");

test("valores viram centavos sem erro de arredondamento", () => {
  assert.equal(parseAmountToCents("--11.00"), -1100);
  assert.equal(parseAmountToCents("159.35"), 15935);
  assert.equal(parseAmountToCents("-0.10"), -10);
  assert.equal(parseAmountToCents("1.234,56"), 123456);
  assert.equal(parseAmountToCents("1,234.56"), 123456);
  assert.equal(parseAmountToCents("R$ 12,3"), 1230);
  assert.equal(parseAmountToCents("1.000"), 100000);
  assert.equal(parseAmountToCents("(5,00)"), -500);
  assert.equal(parseAmountToCents("abc"), null);
  assert.equal(parseAmountToCents(""), null);
  assert.equal(formatCents(-123456).replace(/\s/g, " "), "-R$ 1.234,56");
});

test("datas e textos são normalizados", () => {
  assert.equal(parseBrDate("31/10/2026"), "2026-10-31");
  assert.equal(parseBrDate("31/02/2026"), null);
  assert.equal(normalizeText("Alípio dos Santos Júnior"), normalizeText("Alipio dos Santos Junior"));
  assert.equal(normalizeText("Mp*Padaria"), "mp padaria");
});

test("reconhece o formato do BB", () => {
  assert.equal(looksLikeBbCsv(sample), true);
  assert.equal(looksLikeBbCsv("data,valor,descricao\n"), false);
  assert.equal(parseBbCsv("a;b;c\n1;2;3").errors.length, 1);
});

test("aplica as regras definidas para o BB", () => {
  const { rows, errors, period } = parseBbCsv(sample);

  assert.equal(errors.length, 1, "linha com valor inválido vira erro, não trava o resto");
  assert.equal(errors[0].line, 12);
  assert.equal(rows.length, 10);
  assert.deepEqual(period, { from: "2026-06-14", to: "2026-11-04" });

  const rende = rows.filter((r) => r.skipReason === "investimento");
  assert.equal(rende.length, 2, "aplicação e resgate do Rende Fácil");
  assert.ok(rende.every((r) => !r.selected));

  const estorno = rows.find((r) => r.bankDescription.startsWith("Pix Rejeitado"));
  assert.equal(estorno?.skipReason, "estorno");
  assert.equal(estorno?.selected, false);

  const pix = rows.filter((r) => r.bankDescription.startsWith("Pix Enviado"));
  assert.equal(pix.length, 2, "Pix iguais no mesmo dia continuam os dois");
  assert.equal(pix[0].description, "João da Silva", "usa o nome do destinatário");
  assert.equal(pix[0].fingerprint, pix[1].fingerprint, "acentos não diferenciam o mesmo destinatário");
  assert.equal(pix[0].suggestedCategorySlug, null, "'Outros' do BB fica para o usuário decidir");

  const compra = rows.find((r) => r.description === "Loja Exemplo");
  assert.equal(compra?.suggestedCategorySlug, "compras");
  assert.equal(compra?.amountCents, -2390);
  assert.equal(compra?.type, "expense");

  assert.equal(rows.find((r) => r.description === "Posto Central")?.suggestedCategorySlug, "transporte-comb");
  assert.equal(rows.find((r) => r.description === "Maria Exemplo")?.suggestedCategorySlug, "outras-receitas");
  assert.equal(rows[0].occurredOn, "2026-11-04", "mais recentes primeiro");

  // dados bancários sensíveis nunca saem do leitor
  assert.ok(!JSON.stringify(rows).includes("00000"));
});

test("regras aprendidas vencem o banco; duplicados contam ocorrências", () => {
  const { rows } = parseBbCsv(sample);
  const slugToId = { "lazer-viagens": "cat-lazer", "transporte-comb": "cat-comb" };
  const rules = [
    { pattern: ruleFromDescription("Mercado Bairro")!, categoryId: "cat-mercado" },
    { pattern: "joao da silva", categoryId: "cat-familia" },
  ];
  const pixFp = rows.find((r) => r.description === "João da Silva")!.fingerprint;
  const out = applySuggestions(rows, rules, slugToId, new Map([[pixFp, 1]]));

  const mercado = out.find((r) => r.description === "Mercado Bairro")!;
  assert.equal(mercado.categoryId, "cat-mercado", "o usuário corrigiu o 'Lazer' errado do BB");
  assert.equal(mercado.categorySource, "rule");

  const pix = out.filter((r) => r.description.includes("o da Silva"));
  assert.equal(pix.filter((r) => r.duplicate).length, 1, "só um dos dois Pix já estava salvo");
  assert.equal(pix.filter((r) => r.selected).length, 1);
  assert.ok(pix.every((r) => r.categoryId === "cat-familia"));

  assert.equal(out.find((r) => r.description === "Posto Central")!.categorySource, "bank");
});

// Teste opcional com um extrato real, que fica só na sua máquina:
//   BB_CSV_REAL=/caminho/extrato.csv npm test
const real = process.env.BB_CSV_REAL;
test("extrato real do BB (opcional)", { skip: !real || !existsSync(real) }, () => {
  const { rows, errors } = parseBbCsv(readFileSync(real!, "utf8"));
  assert.equal(errors.length, 0);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(Number.isSafeInteger(r.amountCents) && r.amountCents !== 0);
    assert.match(r.occurredOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.description.length > 0);
  }
  const skipped = rows.filter((r) => r.skipReason);
  const mapped = rows.filter((r) => r.suggestedCategorySlug);
  console.log(
    `  ${rows.length} linhas | ${skipped.length} desmarcadas (Rende Fácil/estornos) | ` +
      `${mapped.length} já categorizadas | ${rows.length - skipped.length - mapped.length} para o usuário decidir`,
  );
});
