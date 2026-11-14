/** Valor em reais por extenso (pt-BR), para o recibo. 123456789 centavos → "um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete reais e oitenta e nove centavos". */
const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** 0–999 por extenso ("" para 0). */
function upTo999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]!);
  if (rest) {
    if (rest < 20) parts.push(UNITS[rest]!);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u ? `${TENS[t]} e ${UNITS[u]}` : TENS[t]!);
    }
  }
  return parts.join(' e ');
}

const SCALES: Array<[string, string]> = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];

/** Inteiro por extenso, com "e" entre grupos quando o grupo seguinte é < 100 ou centena redonda. */
export function integerInWords(n: number): string {
  if (n === 0) return 'zero';
  const groups: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) groups.push(x % 1000);
  const words: Array<{ text: string; value: number }> = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const g = groups[i]!;
    if (!g) continue;
    const [sing, plural] = SCALES[i]!;
    const text = i === 0 ? upTo999(g) : i === 1 ? (g === 1 ? 'mil' : `${upTo999(g)} mil`) : `${upTo999(g)} ${g === 1 ? sing : plural}`;
    words.push({ text, value: g });
  }
  return words.reduce((acc, w, idx) => {
    if (idx === 0) return w.text;
    const joinE = idx === words.length - 1 && (w.value < 100 || w.value % 100 === 0);
    return `${acc}${joinE ? ' e ' : ', '}${w.text}`;
  }, '');
}

export function centsInWords(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('valor inválido');
  const reais = Math.floor(cents / 100);
  const c = cents % 100;
  const parts: string[] = [];
  if (reais > 0) {
    const w = integerInWords(reais);
    // "um milhão de reais", "dois bilhões de reais"
    const de = reais % 1_000_000 === 0 ? ' de' : '';
    parts.push(`${w}${de} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (c > 0) parts.push(`${integerInWords(c)} ${c === 1 ? 'centavo' : 'centavos'}`);
  return parts.length ? parts.join(' e ') : 'zero real';
}
