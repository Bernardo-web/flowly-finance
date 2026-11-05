import { test } from "node:test";
import assert from "node:assert/strict";
import { billFor, buildParcels, clampDate, splitInstallments } from "../src/lib/cards.ts";
import { adjustForWeekend, dueOccurrences, occurrencesBetween, upcomingOccurrences } from "../src/lib/recurrence.ts";
import { looksLikeOfx, parseOfx } from "../src/lib/import/ofx.ts";
import { guessMapping, parseGenericCsv, readCsvTable } from "../src/lib/import/generic-csv.ts";
import { budgetStatus } from "../src/lib/summary.ts";

test("cartão: fatura certa para cada data de compra", () => {
  // fecha dia 5, vence dia 12
  assert.deepEqual(billFor("2026-11-04", 5, 12), { reference_month: "2026-11-01", closing_date: "2026-11-05", due_date: "2026-11-12" });
  assert.equal(billFor("2026-11-05", 5, 12).reference_month, "2026-12-01", "no dia do fechamento já vai para a próxima");
  // fecha dia 28, vence dia 5 do mês seguinte
  assert.deepEqual(billFor("2026-12-30", 28, 5), { reference_month: "2027-01-01", closing_date: "2027-01-28", due_date: "2027-02-05" });
  // fecha dia 31: em fevereiro fecha no dia 28
  assert.equal(billFor("2027-02-27", 31, 10).closing_date, "2027-02-28");
  assert.equal(clampDate(2028, 2, 30), "2028-02-29");
  assert.equal(clampDate(2026, 13, 15), "2027-01-15");
});

test("cartão: parcelas somam o total e caem em faturas seguidas", () => {
  assert.deepEqual(splitInstallments(10000, 3), [3334, 3333, 3333]);
  const p = buildParcels("2026-11-20", 10000, 3, 5, 12);
  assert.equal(p.reduce((s, x) => s + x.amount_cents, 0), 10000);
  assert.deepEqual(p.map((x) => x.bill.reference_month), ["2026-12-01", "2027-01-01", "2027-02-01"]);
  assert.deepEqual(p.map((x) => x.occurred_on), ["2026-11-20", "2026-12-20", "2027-01-20"]);
  const jan31 = buildParcels("2027-01-31", 300, 2, 10, 20);
  assert.equal(jan31[1].occurred_on, "2027-02-28");
});

test("recorrência: salário dias 15 e 30, antecipado no fim de semana", () => {
  // 15/11/2026 é domingo -> sexta 13; 30/11/2026 é segunda
  assert.equal(adjustForWeekend("2026-11-15", "previous_business_day"), "2026-11-13");
  assert.equal(adjustForWeekend("2026-11-15", "next_business_day"), "2026-11-16");
  assert.equal(adjustForWeekend("2026-11-15", "keep"), "2026-11-15");
  const occ = occurrencesBetween([15, 30], "previous_business_day", "2027-02-01", "2027-02-28");
  // fev/2027: 15 é segunda; 30 não existe -> 28 (domingo) -> sexta 26
  assert.deepEqual(occ, [{ nominal: "2027-02-15", date: "2027-02-15" }, { nominal: "2027-02-28", date: "2027-02-26" }]);
  assert.equal(occurrencesBetween([30, 31], "keep", "2027-02-01", "2027-02-28").length, 1, "30 e 31 em fevereiro não duplicam");
});

test("recorrência: gera só o que já venceu, sem repetir", () => {
  const rec = { days_of_month: [15, 30], weekend_rule: "previous_business_day" as const, starts_on: "2026-11-01", ends_on: null, last_generated: null };
  const a = dueOccurrences(rec, "2026-11-13"); // sexta: o dia 15 (domingo) já é pago hoje
  assert.deepEqual(a.due.map((o) => o.date), ["2026-11-13"]);
  assert.equal(a.lastGenerated, "2026-11-15");
  const b = dueOccurrences({ ...rec, last_generated: a.lastGenerated }, "2026-11-20");
  assert.equal(b.due.length, 0, "nada novo até o dia 30");
  const c = dueOccurrences({ ...rec, last_generated: a.lastGenerated }, "2026-12-01");
  assert.deepEqual(c.due.map((o) => o.date), ["2026-11-30"]);
  const up = upcomingOccurrences({ ...rec, last_generated: "2026-11-30" }, "2026-12-01", 30);
  assert.deepEqual(up.map((o) => o.date), ["2026-12-15", "2026-12-30"]);
  const ended = dueOccurrences({ ...rec, ends_on: "2026-11-20" }, "2026-12-31");
  assert.deepEqual(ended.due.map((o) => o.nominal), ["2026-11-15"]);
});

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>Banco do Brasil<FID>001</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261031120000[-3:BRT]<TRNAMT>-54.00<FITID>A1<MEMO>Posto Central
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261101<TRNAMT>15,00<FITID>A2<NAME>Pix Recebido<MEMO>Maria &amp; Filhos
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261102<TRNAMT>-11.00<FITID>A3<MEMO>BB Rende Facil
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261302<TRNAMT>-1.00<FITID>A4<MEMO>Data ruim
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test("OFX: lê SGML, usa FITID e aplica as regras", () => {
  assert.equal(looksLikeOfx(OFX_SGML), true);
  assert.equal(looksLikeOfx("Data;Valor\n"), false);
  const s = parseOfx(OFX_SGML);
  assert.equal(s.rows.length, 3);
  assert.equal(s.errors.length, 1);
  assert.equal(s.bank, "ofx:banco do bra");
  const posto = s.rows.find((r) => r.description === "Posto Central")!;
  assert.equal(posto.amountCents, -5400);
  assert.equal(posto.fingerprint, "fitid:A1");
  assert.equal(posto.occurredOn, "2026-10-31");
  assert.equal(s.rows.find((r) => r.amountCents === 1500)!.description, "Pix Recebido Maria & Filhos");
  assert.equal(s.rows.find((r) => r.fingerprint === "fitid:A3")!.skipReason, "investimento");
});

test("OFX 2.x (XML)", () => {
  const xml = `<?xml version="1.0"?><OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261103</DTPOSTED><TRNAMT>-9.90</TRNAMT><FITID>X9</FITID><MEMO>Assinatura</MEMO></STMTTRN></BANKTRANLIST></OFX>`;
  const s = parseOfx(xml);
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0].amountCents, -990);
  assert.equal(s.rows[0].description, "Assinatura");
});

test("CSV genérico: reconhece colunas de bancos diferentes", () => {
  // estilo Nubank conta
  const nu = readCsvTable("Data,Valor,Identificador,Descrição\n31/10/2026,-23.90,abc,Compra no débito - Padaria\n01/11/2026,100.00,def,Transferência recebida\n")!;
  const mNu = guessMapping(nu)!;
  assert.ok(mNu);
  const sNu = parseGenericCsv(nu, mNu);
  assert.deepEqual(sNu.rows.map((r) => r.amountCents).sort((a, b) => a - b), [-2390, 10000]);

  // estilo Inter, com linhas de título antes do cabeçalho e separador ;
  const inter = readCsvTable("Extrato Conta Corrente\nConta ;123\n\nData Lançamento;Histórico;Descrição;Valor;Saldo\n05/11/2026;Pix enviado ;João;-50,00;1.000,00\n04/11/2026;Pix recebido;Ana;1.234,56;1.050,00\n")!;
  const mInter = guessMapping(inter)!;
  assert.equal(inter.headers[0], "Data Lançamento");
  const sInter = parseGenericCsv(inter, mInter);
  assert.deepEqual(sInter.rows.map((r) => r.amountCents), [-5000, 123456]);
  assert.deepEqual(sInter.period, { from: "2026-11-04", to: "2026-11-05" });

  // colunas separadas de crédito e débito, data ISO
  const cd = readCsvTable("date;description;credito;debito\n2026-11-01;Salário;3.000,00;\n2026-11-02;Mercado;;120,50\n")!;
  const mCd = guessMapping(cd)!;
  assert.equal(mCd.dateFormat, "ymd");
  assert.deepEqual(parseGenericCsv(cd, mCd).rows.map((r) => r.amountCents).sort((a, b) => a - b), [-12050, 300000]);

  // sem colunas reconhecíveis: o usuário mapeia
  assert.equal(guessMapping(readCsvTable("a;b;c\n1;2;3\n")!), null);
});

test("orçamento: aviso em 80% e estouro em 100%", () => {
  assert.equal(budgetStatus(7900, 10000).level, "ok");
  assert.equal(budgetStatus(8000, 10000).level, "warning");
  assert.equal(budgetStatus(10000, 10000).level, "over");
  assert.equal(budgetStatus(12000, 10000).leftCents, -2000);
});

test("exportação CSV: padrão brasileiro e proteção contra fórmulas", async () => {
  const { csvCell, centsToBr, toCsv } = await import("../src/lib/export.ts");
  assert.equal(centsToBr(-123456), "-1234,56");
  assert.equal(centsToBr(5), "0,05");
  assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell("Mercado; padaria"), '"Mercado; padaria"');
  assert.equal(csvCell("-12,50", false), "-12,50", "valores numéricos não levam apóstrofo");
  const out = toCsv(["Data", "Valor"], [["01/11/2026", "-12,50"]], [1]);
  assert.ok(out.startsWith("﻿Data;Valor\r\n01/11/2026;-12,50"));
});
