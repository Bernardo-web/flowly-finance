import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAccount, validateCategory, validateTransaction } from "../src/lib/validation.ts";
import { monthBounds, parseMonth, shiftMonth, todayIso, isValidIsoDate } from "../src/lib/dates.ts";

const ACC = "11111111-1111-4111-8111-111111111111";
const ACC2 = "22222222-2222-4222-8222-222222222222";

test("datas no fuso de São Paulo", () => {
  // 02:00 UTC do dia 6 ainda é dia 5 em São Paulo
  assert.equal(todayIso(new Date("2026-11-06T02:00:00Z")), "2026-11-05");
  assert.deepEqual(monthBounds("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthBounds("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(parseMonth("2026-13", new Date("2026-11-05T12:00:00Z")), "2026-11");
  assert.equal(parseMonth("2026-03"), "2026-03");
  assert.equal(isValidIsoDate("2026-02-30"), false);
});

test("conta", () => {
  const ok = validateAccount({ name: " Banco do Brasil ", kind: "checking", initial_balance: "1.234,56" });
  assert.ok(ok.ok && ok.data.name === "Banco do Brasil" && ok.data.initial_balance_cents === 123456);
  const neg = validateAccount({ name: "Nubank", kind: "checking", initial_balance: "-50" });
  assert.ok(neg.ok && neg.data.initial_balance_cents === -5000, "saldo inicial pode ser negativo (cheque especial)");
  assert.equal(validateAccount({ name: "", kind: "checking" }).ok, false);
  assert.equal(validateAccount({ name: "X", kind: "hacker" }).ok, false);
  assert.equal(validateAccount({ name: "X", kind: "cash", initial_balance: "abc" }).ok, false);
});

test("categoria", () => {
  const ok = validateCategory({ name: "Pets", kind: "expense", parent_id: "", color: "#ff0000" });
  assert.ok(ok.ok && ok.data.parent_id === null && ok.data.color === "#ff0000");
  const badColor = validateCategory({ name: "Pets", kind: "expense", color: "red;drop" });
  assert.ok(badColor.ok && badColor.data.color === "#64748b");
  assert.equal(validateCategory({ name: "Pets", kind: "other" }).ok, false);
});

test("lançamento", () => {
  const exp = validateTransaction({ kind: "expense", amount: "12,50", occurred_on: "2026-11-05", account_id: ACC, description: "" });
  assert.ok(exp.ok && exp.data.kind === "expense");
  if (exp.ok && exp.data.kind === "expense") {
    assert.equal(exp.data.amount_cents, 1250);
    assert.equal(exp.data.description, "Despesa");
    assert.equal(exp.data.status, "paid");
    assert.equal(exp.data.category_id, null);
  }
  const neg = validateTransaction({ kind: "expense", amount: "-12,50", occurred_on: "2026-11-05", account_id: ACC });
  assert.ok(neg.ok && neg.data.amount_cents === 1250, "sinal vem do tipo, não do valor digitado");

  assert.equal(validateTransaction({ kind: "expense", amount: "0", occurred_on: "2026-11-05", account_id: ACC }).ok, false);
  assert.equal(validateTransaction({ kind: "expense", amount: "10", occurred_on: "2026-02-30", account_id: ACC }).ok, false);
  assert.equal(validateTransaction({ kind: "expense", amount: "10", occurred_on: "2026-11-05", account_id: "x" }).ok, false);

  const tr = validateTransaction({ kind: "transfer", amount: "100", occurred_on: "2026-11-05", account_id: ACC, to_account_id: ACC2 });
  assert.ok(tr.ok && tr.data.kind === "transfer" && tr.data.description === "Transferência");
  assert.equal(
    validateTransaction({ kind: "transfer", amount: "100", occurred_on: "2026-11-05", account_id: ACC, to_account_id: ACC }).ok,
    false,
  );
});

test("compra no cartão, cartão e recorrência", async () => {
  const { validateCard, validateRecurrence } = await import("../src/lib/validation.ts");
  const card = validateTransaction({ kind: "expense", amount: "100,00", occurred_on: "2026-11-05", account_id: `card:${ACC}`, installments: "3" });
  assert.ok(card.ok && card.data.kind === "card_expense" && card.data.installments === 3 && card.data.amount_cents === 10000);
  assert.equal(validateTransaction({ kind: "expense", amount: "100", occurred_on: "2026-11-05", account_id: `card:${ACC}`, installments: "0" }).ok, false);
  assert.equal(validateTransaction({ kind: "income", amount: "100", occurred_on: "2026-11-05", account_id: `card:${ACC}` }).ok, false, "receita não vai para cartão");

  const c = validateCard({ name: "Ourocard", limit: "2.000,00", closing_day: "5", due_day: "12" });
  assert.ok(c.ok && c.data.limit_cents === 200000);
  assert.equal(validateCard({ name: "X", closing_day: "0", due_day: "12" }).ok, false);

  const sal = validateRecurrence({ type: "income", description: "Salário", amount: "1.500", days: "30, 15", account_id: ACC, starts_on: "2026-11-01" });
  assert.ok(sal.ok && sal.data.days_of_month.join() === "15,30" && sal.data.weekend_rule === "previous_business_day");
  const tik = validateRecurrence({ type: "income", description: "TikTok", is_variable: "1", days: "15", account_id: ACC, starts_on: "2026-11-01" });
  assert.ok(tik.ok && tik.data.amount_cents === null && tik.data.is_variable);
  assert.equal(validateRecurrence({ type: "income", description: "X", days: "15", account_id: ACC, starts_on: "2026-11-01" }).ok, false, "fixo sem valor");
  assert.equal(validateRecurrence({ type: "income", description: "X", amount: "1", days: "1,2,3,4,5", account_id: ACC, starts_on: "2026-11-01" }).ok, false);
});
