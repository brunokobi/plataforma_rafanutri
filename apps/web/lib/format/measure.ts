const ADJECTIVES: Record<string, string> = {
  média: 'médias', médio: 'médios', pequena: 'pequenas', pequeno: 'pequenos', grande: 'grandes',
  americano: 'americanos', cheia: 'cheias', rasa: 'rasas',
};

function pluralWord(word: string): string {
  if (/[aeiouáéíóú]$/i.test(word)) return `${word}s`; // fatia → fatias, filé → filés
  if (/[rz]$/i.test(word)) return `${word}es`; // colher → colheres, pegador → pegadores
  if (/m$/i.test(word)) return `${word.slice(0, -1)}ns`;
  if (/l$/i.test(word)) return `${word.slice(0, -1)}is`;
  return `${word}s`;
}

/** Plural de uma medida caseira: "colher de sopa" → "colheres de sopa", "unidade média" → "unidades médias". */
export function pluralizeMeasure(label: string): string {
  const [first, ...rest] = label.split(' ');
  if (!first) return label;
  return [pluralWord(first), ...rest.map((w) => ADJECTIVES[w] ?? w)].join(' ');
}

/** "1 colher de sopa", "1,5 colher de sopa", "2 colheres de sopa" (plural a partir de 2). */
export function formatMeasure(quantity: number, label: string): string {
  const q = quantity.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${q} ${quantity >= 2 ? pluralizeMeasure(label) : label}`;
}
