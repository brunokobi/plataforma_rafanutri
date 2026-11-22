// Números no padrão brasileiro: exibição, campo de formulário e leitura do que foi digitado.

/** Número exibido em pt-BR com no máximo `max` casas ("1.234,5"). */
export const fmtNum = (n: number, max = 1, min = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });

/** Valor para um campo de texto com vírgula decimal ("12,5"); vazio para nulo. */
export const toInputDecimal = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

/** Lê decimal digitado com vírgula ou ponto; vazio ou inválido vira null (nunca 0 nem NaN). */
export function parseDecimal(s: string | null | undefined): number | null {
  if (s === null || s === undefined || s.trim() === '') return null;
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
