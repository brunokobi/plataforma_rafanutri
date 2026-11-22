/** "Rótulo — Pão de Queijo" → "rotulo-pao-de-queijo" (nomes de arquivo). */
export const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
