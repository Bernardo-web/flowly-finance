"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, FileUp, Loader2, RotateCcw } from "lucide-react";
import { looksLikeBbCsv, parseBbCsv } from "@/lib/import/bb-csv";
import { looksLikeOfx, parseOfx } from "@/lib/import/ofx";
import { guessMapping, parseGenericCsv, readCsvTable, type CsvMapping, type CsvTable } from "@/lib/import/generic-csv";
import type { ImportRow, ParsedStatement } from "@/lib/import/common";
import { applySuggestions, ruleFromDescription, type CategoryRule, type Suggested } from "@/lib/import/suggest";
import { formatCents } from "@/lib/money/cents";
import { dayLabel, monthOf } from "@/lib/dates";
import { CategoryOptions } from "@/components/category-select";
import type { Category } from "@/lib/data";
import { confirmImport, getExisting } from "./actions";

type Row = Suggested<ImportRow> & { key: number; userPicked: boolean; possibleDup: boolean };
type Filter = "all" | "uncategorized" | "off";

const MAX_BYTES = 5 * 1024 * 1024;

async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  // extratos antigos às vezes vêm em Windows-1252; os acentos denunciam
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf8;
}

function badge(r: Row): string | null {
  if (r.skipReason === "investimento") return "Rende Fácil";
  if (r.skipReason === "estorno") return "Estorno";
  if (r.duplicate) return "Já importado";
  if (r.possibleDup) return "Parece já lançado";
  return null;
}

export function ImportWizard({
  accounts,
  categories,
  rules,
}: {
  accounts: { id: string; name: string }[];
  categories: Category[];
  rules: CategoryRule[];
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [parseErrors, setParseErrors] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, startSaving] = useTransition();
  const [done, setDone] = useState<{ count: number; month: string } | null>(null);
  const [source, setSource] = useState<{ bank: string; format: "csv" | "ofx" }>({ bank: "bb", format: "csv" });
  // CSV de outro banco: tabela lida + colunas escolhidas (automáticas ou pelo usuário)
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [pendingName, setPendingName] = useState("");

  const slugToId = useMemo(
    () => Object.fromEntries(categories.filter((c) => c.slug).map((c) => [c.slug as string, c.id])),
    [categories],
  );

  /** Marca duplicados e sugere categorias, depois abre a prévia. */
  async function prepare(parsed: ParsedStatement, name: string) {
    if (parsed.rows.length === 0 || !parsed.period) {
      setError(parsed.errors[0]?.message ?? "Nenhuma movimentação encontrada no arquivo.");
      return;
    }
    const existing = await getExisting(accountId, parsed.period.from, parsed.period.to);
    const suggested = applySuggestions(parsed.rows, rules, slugToId, new Map(existing.fingerprints));

    // lançamentos feitos à mão com mesma data e valor: provavelmente o mesmo gasto
    const manual = new Map(existing.manual);
    const result: Row[] = suggested.map((r, i) => {
      let possibleDup = false;
      if (!r.duplicate && !r.skipReason) {
        const key = `${r.occurredOn}|${r.amountCents}`;
        const left = manual.get(key) ?? 0;
        if (left > 0) {
          possibleDup = true;
          manual.set(key, left - 1);
        }
      }
      return { ...r, key: i, userPicked: false, possibleDup, selected: r.selected && !possibleDup };
    });

    setSource({ bank: parsed.bank, format: parsed.format });
    setFileName(name);
    setRowsTotal(parsed.rows.length);
    setParseErrors(parsed.errors.length);
    setRows(result);
    setTable(null);
    setFilter("all");
  }

  async function onFile(file: File | undefined) {
    setError("");
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("Arquivo grande demais (máximo de 5 MB).");
    setLoading(true);
    try {
      const text = await readText(file);
      if (looksLikeOfx(text)) return await prepare(parseOfx(text), file.name);
      if (looksLikeBbCsv(text)) return await prepare(parseBbCsv(text), file.name);

      const t = readCsvTable(text);
      if (!t || t.headers.length < 2) {
        setError("Não reconheci o arquivo. Use o extrato em OFX (todos os bancos oferecem) ou em CSV.");
        return;
      }
      const guess = guessMapping(t);
      if (guess) return await prepare(parseGenericCsv(t, guess), file.name);
      // não reconheceu as colunas: o usuário indica
      setTable(t);
      setPendingName(file.name);
      setMapping({ date: 0, description: Math.min(1, t.headers.length - 1), amount: Math.min(2, t.headers.length - 1), credit: null, debit: null, invert: false, dateFormat: "dmy" });
    } catch {
      setError("Não foi possível ler o arquivo.");
    } finally {
      setLoading(false);
    }
  }

  async function applyMapping() {
    if (!table || !mapping) return;
    setError("");
    setLoading(true);
    try {
      await prepare(parseGenericCsv(table, mapping), pendingName);
    } finally {
      setLoading(false);
    }
  }

  function toggle(key: number) {
    setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)));
  }

  /** Escolher a categoria de uma linha aplica a todas com a mesma descrição (e ensina o Flowly). */
  function pickCategory(key: number, categoryId: string) {
    setRows((rs) => {
      if (!rs) return rs;
      const target = rs.find((r) => r.key === key);
      if (!target) return rs;
      const pattern = ruleFromDescription(target.description);
      return rs.map((r) =>
        r.key === key || (pattern && r.type === target.type && ruleFromDescription(r.description) === pattern)
          ? { ...r, categoryId: categoryId || null, userPicked: true }
          : r,
      );
    });
  }

  function setAllVisible(selected: boolean) {
    const keys = new Set(visible.map((r) => r.key));
    setRows((rs) => rs && rs.map((r) => (keys.has(r.key) ? { ...r, selected } : r)));
  }

  function submit() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.selected);
    const learned = new Map<string, string>();
    for (const r of rows) {
      const p = ruleFromDescription(r.description);
      if (r.userPicked && r.categoryId && p) learned.set(p, r.categoryId);
    }
    setError("");
    startSaving(async () => {
      const res = await confirmImport({
        accountId,
        bank: source.bank,
        format: source.format,
        fileName,
        rowsTotal,
        rows: chosen.map((r) => ({
          type: r.type,
          amount_cents: Math.abs(r.amountCents),
          occurred_on: r.occurredOn,
          description: r.description,
          category_id: r.categoryId,
          fingerprint: r.fingerprint,
          bank_description: r.bankDescription,
        })),
        rules: [...learned.entries()].map(([pattern, category_id]) => ({ pattern, category_id })),
      });
      if (!res.ok) return setError(res.error);
      setDone({ count: res.count, month: monthOf(chosen[0].occurredOn) });
      setRows(null);
    });
  }

  const visible = useMemo(() => {
    if (!rows) return [];
    if (filter === "uncategorized") return rows.filter((r) => r.selected && !r.categoryId);
    if (filter === "off") return rows.filter((r) => !r.selected);
    return rows;
  }, [rows, filter]);

  if (accounts.length === 0) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <p className="font-medium">Cadastre a conta do banco antes de importar.</p>
        <Link href="/contas/nova" className="btn-primary">Criar conta</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center">
        <CheckCircle2 className="size-10 text-income" />
        <h2 className="text-lg font-semibold">{done.count} lançamentos importados</h2>
        <p className="muted text-sm">As categorias que você escolheu já viraram regras para os próximos extratos.</p>
        <div className="flex gap-2">
          <Link href={`/lancamentos?mes=${done.month}&conta=${accountId}`} className="btn-primary">Ver lançamentos</Link>
          <button className="btn-ghost" onClick={() => setDone(null)}>Importar outro</button>
        </div>
      </div>
    );
  }

  // ---- passo 1b: CSV com colunas não reconhecidas
  if (!rows && table && mapping) {
    const colSelect = (label: string, key: "date" | "description" | "amount" | "credit" | "debit", optional = false) => (
      <div>
        <label className="label">{label}</label>
        <select
          className="input"
          value={mapping[key] ?? ""}
          onChange={(e) => setMapping({ ...mapping, [key]: e.target.value === "" ? null : Number(e.target.value) })}
        >
          {optional && <option value="">— nenhuma —</option>}
          {table.headers.map((h, i) => (
            <option key={i} value={i}>{h || `Coluna ${i + 1}`} {table.rows[0]?.[i] ? `(ex.: ${table.rows[0][i].slice(0, 20)})` : ""}</option>
          ))}
        </select>
      </div>
    );
    return (
      <div className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Quais colunas são quais?</h2>
          <p className="muted text-sm">Não reconheci este CSV automaticamente. Indique as colunas uma vez.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {colSelect("Data", "date")}
          {colSelect("Descrição", "description")}
          {colSelect("Valor (com sinal)", "amount", true)}
          <div>
            <label className="label">Formato da data</label>
            <select className="input" value={mapping.dateFormat} onChange={(e) => setMapping({ ...mapping, dateFormat: e.target.value as CsvMapping["dateFormat"] })}>
              <option value="dmy">dia/mês/ano</option>
              <option value="ymd">ano-mês-dia</option>
              <option value="mdy">mês/dia/ano</option>
            </select>
          </div>
          {mapping.amount === null && (
            <>
              {colSelect("Entradas (crédito)", "credit", true)}
              {colSelect("Saídas (débito)", "debit", true)}
            </>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mapping.invert} onChange={(e) => setMapping({ ...mapping, invert: e.target.checked })} className="size-4" />
          Inverter sinais <span className="muted">(se os gastos aparecerem como positivos)</span>
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => { setTable(null); setMapping(null); }}>Cancelar</button>
          <button className="btn-primary flex-1" onClick={applyMapping} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />} Continuar
          </button>
        </div>
      </div>
    );
  }

  // ---- passo 1: conta + arquivo
  if (!rows) {
    return (
      <div className="card space-y-5 p-5">
        <div>
          <label className="label" htmlFor="account">Conta de destino</label>
          <select className="input" id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <label
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] p-8 text-center transition hover:border-brand-500 ${
            loading ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {loading ? <Loader2 className="size-8 animate-spin text-brand-700" /> : <FileUp className="size-8 text-brand-700" />}
          <span className="font-medium">{loading ? "Lendo o extrato…" : "Escolher arquivo do extrato"}</span>
          <span className="muted text-xs">OFX de qualquer banco ou CSV · o arquivo é lido no seu aparelho e não é enviado</span>
          <input
            type="file"
            accept=".csv,.ofx,.txt,text/csv,text/plain,application/x-ofx"
            className="sr-only"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      </div>
    );
  }

  // ---- passo 2: prévia
  const selected = rows.filter((r) => r.selected);
  const autoOff = rows.filter((r) => !r.selected).length;
  const uncategorized = selected.filter((r) => !r.categoryId).length;
  const net = selected.reduce((s, r) => s + r.amountCents, 0);
  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: `Todas (${rows.length})` },
    { id: "uncategorized", label: `Sem categoria (${uncategorized})` },
    { id: "off", label: `Desmarcadas (${autoOff})` },
  ];

  return (
    <div className="space-y-4">
      <div className="card space-y-1 p-4 text-sm">
        <p className="font-medium">{fileName}</p>
        <p className="muted">
          {selected.length} de {rows.length} serão importadas · resultado {formatCents(net)}
          {parseErrors > 0 && ` · ${parseErrors} linha(s) ilegível(is) ignorada(s)`}
        </p>
        <p className="muted text-xs">
          Rende Fácil, estornos e o que já existe no Flowly vêm desmarcados. Ao escolher uma categoria, ela vale para
          todas as linhas com a mesma descrição.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === t.id ? "bg-brand-700 text-white" : "btn-ghost py-1.5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {visible.length > 0 && (
        <div className="flex justify-end gap-3 text-sm">
          <button className="text-brand-700" onClick={() => setAllVisible(true)}>Marcar todas</button>
          <button className="muted" onClick={() => setAllVisible(false)}>Desmarcar todas</button>
        </div>
      )}

      <ul className="card divide-y divide-[var(--border)]">
        {visible.length === 0 && <li className="muted p-6 text-center text-sm">Nada nesta aba.</li>}
        {visible.map((r) => {
          const b = badge(r);
          return (
            <li key={r.key} className={`flex gap-3 p-3 ${r.selected ? "" : "opacity-55"}`}>
              <input
                type="checkbox"
                checked={r.selected}
                onChange={() => toggle(r.key)}
                aria-label={`Importar ${r.description}`}
                className="mt-1 size-5 shrink-0 accent-[var(--color-brand-700)]"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.description}</p>
                    <p className="muted text-xs">
                      {dayLabel(r.occurredOn)}
                      {b && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{b}</span>}
                    </p>
                  </div>
                  <span className={`whitespace-nowrap font-semibold tabular-nums ${r.amountCents > 0 ? "text-income" : "text-expense"}`}>
                    {r.amountCents > 0 ? "+" : "−"} {formatCents(Math.abs(r.amountCents))}
                  </span>
                </div>
                {r.selected && (
                  <select
                    className={`input py-1.5 text-sm ${!r.categoryId ? "border-amber-400" : ""}`}
                    value={r.categoryId ?? ""}
                    onChange={(e) => pickCategory(r.key, e.target.value)}
                    aria-label="Categoria"
                  >
                    <option value="">Sem categoria</option>
                    <CategoryOptions categories={categories} kind={r.type} />
                  </select>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      <div
        className="sticky bottom-20 z-10 flex gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg md:bottom-4"
      >
        <button className="btn-ghost" onClick={() => setRows(null)} disabled={saving}>
          <RotateCcw className="size-4" /> Trocar arquivo
        </button>
        <button className="btn-primary flex-1" onClick={submit} disabled={saving || selected.length === 0}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Importar {selected.length}
        </button>
      </div>
    </div>
  );
}
