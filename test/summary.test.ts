import { test } from "node:test";
import assert from "node:assert/strict";
import { spendingByCategory } from "../src/lib/summary.ts";

const cats = [
  { id: "ali", parent_id: null, name: "Alimentação", color: "#ea580c" },
  { id: "mer", parent_id: "ali", name: "Mercado", color: "#ea580c" },
  { id: "tra", parent_id: null, name: "Transporte", color: "#2563eb" },
];

test("gastos somam no pai, ignoram receitas, pendentes e transferências", () => {
  const out = spendingByCategory(
    [
      { type: "expense", amount_cents: 3000, status: "paid", category_id: "mer" },
      { type: "expense", amount_cents: 1000, status: "paid", category_id: "ali" },
      { type: "expense", amount_cents: 2000, status: "paid", category_id: "tra" },
      { type: "expense", amount_cents: 500, status: "paid", category_id: null },
      { type: "expense", amount_cents: 9999, status: "pending", category_id: "tra" },
      { type: "income", amount_cents: 9999, status: "paid", category_id: null },
      { type: "transfer_out", amount_cents: 9999, status: "paid", category_id: null },
    ],
    cats,
  );
  assert.deepEqual(out.map((o) => [o.name, o.cents]), [["Alimentação", 4000], ["Transporte", 2000], ["Sem categoria", 500]]);
  assert.ok(Math.abs(out.reduce((s, o) => s + o.share, 0) - 1) < 1e-9);
});

test("agrupa o excedente em 'Outras'", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, parent_id: null, name: `C${i}`, color: "#000000" }));
  const txs = many.map((c, i) => ({ type: "expense", amount_cents: (i + 1) * 100, status: "paid", category_id: c.id }));
  const out = spendingByCategory(txs, many, 4);
  assert.equal(out.length, 4);
  assert.equal(out[3].name, "Outras");
  assert.equal(out[3].cents, 100 + 200 + 300 + 400 + 500);
  assert.equal(spendingByCategory([], many).length, 0);
});
