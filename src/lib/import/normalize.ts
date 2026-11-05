/**
 * Normaliza textos de extrato para comparar e aprender categorias:
 * remove acentos, prefixos de maquininha, pontuação e espaços extras.
 * "Alípio dos Santos Júnior" e "Alipio dos Santos Junior" viram a mesma chave.
 */
export function normalizeText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\*/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "31/10/2026" -> "2026-10-31" (null se a data não existir). */
export function parseBrDate(raw: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const iso = `${yyyy}-${mm}-${dd}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/**
 * Impressão digital de um lançamento para achar duplicados entre o que
 * já está salvo e o que está sendo importado: data + valor + texto normalizado.
 */
export function fingerprint(dateIso: string, amountCents: number, description: string): string {
  return `${dateIso}|${amountCents}|${normalizeText(description)}`;
}
