/** Valores em centavos (inteiro) ↔ texto em reais (pt-BR). */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 123456 → "R$ 1.234,56" (espaço não separável normalizado para espaço comum). */
export function formatCents(cents: number): string {
  return BRL.format(cents / 100).replace(/ /g, ' ');
}

/** "1.234,56", "1234,5", "R$ 10", "10.50" → centavos; null se inválido ou ≤ 0. */
export function parseMoneyToCents(input: string): number | null {
  let s = input.replace(/R\$|\s/g, '').trim();
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0) {
    // vírgula é o separador decimal; pontos são de milhar
    if (s.indexOf(',') !== lastComma) return null;
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    // só pontos: decimal se tiver 1 ou 2 dígitos depois do último ponto e um único ponto; senão, milhar
    const decimals = s.length - lastDot - 1;
    s = s.indexOf('.') === lastDot && decimals <= 2 ? s : s.replace(/\./g, '');
  }
  const [int, dec = ''] = s.split('.');
  if (dec.length > 2 || !int) return null;
  const cents = Number(int) * 100 + Number(dec.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/** Centavos para o campo de valor: 123456 → "1.234,56". */
export function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
