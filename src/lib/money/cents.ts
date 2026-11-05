/**
 * Dinheiro no Flowly é sempre inteiro em centavos.
 * Nada de float: 0.1 + 0.2 !== 0.3 em JavaScript.
 */

/**
 * Converte texto de valor de extrato em centavos com sinal.
 * Aceita "15.00", "-15.00", "--11.00" (bug do CSV do BB), "1.234,56", "1,234.56", "R$ 12,30".
 * Retorna null se não for um número válido.
 */
export function parseAmountToCents(raw: string): number | null {
  let s = raw.trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (s === "") return null;

  let negative = false;
  // um ou mais sinais de menos no início (o BB exporta "--11.00")
  const minus = /^-+/.exec(s);
  if (minus) {
    negative = true;
    s = s.slice(minus[0].length);
  }
  // sinal no final ou entre parênteses, comum em alguns bancos
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }

  if (!/^[0-9.,]+$/.test(s)) return null;

  // o último separador que aparece é o decimal, se tiver 1 ou 2 dígitos depois dele
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let intPart = s;
  let fracPart = "";
  if (lastSep !== -1) {
    const after = s.slice(lastSep + 1);
    if (after.length >= 1 && after.length <= 2) {
      intPart = s.slice(0, lastSep);
      fracPart = after;
    }
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (intPart === "") intPart = "0";
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;

  const cents = Number(intPart) * 100 + Number(fracPart.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 123456 -> "R$ 1.234,56" */
export function formatCents(cents: number): string {
  return brl.format(cents / 100);
}
