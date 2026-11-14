/** Busca e filtro por tag das listas de receitas (funções puras). */
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export function allTags(recipes: Array<{ tags: string[] }>): string[] {
  return [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function filterRecipes<T extends { name: string; tags: string[]; description?: string | null }>(recipes: T[], query: string, tag: string | null): T[] {
  const q = norm(query);
  return recipes.filter((r) => (!tag || r.tags.includes(tag)) && (!q || norm(`${r.name} ${r.description ?? ''} ${r.tags.join(' ')}`).includes(q)));
}

/** "Rende 4 porções · 30 min · Fácil" */
export function recipeMeta(r: { servings: number | null; prep_minutes: number | null; difficulty: string | null }, labels: Record<string, string>): string {
  const parts: string[] = [];
  if (r.servings) parts.push(`${r.servings.toLocaleString('pt-BR')} ${r.servings === 1 ? 'porção' : 'porções'}`);
  if (r.prep_minutes) parts.push(r.prep_minutes >= 60 ? `${Math.floor(r.prep_minutes / 60)} h${r.prep_minutes % 60 ? ` ${r.prep_minutes % 60} min` : ''}` : `${r.prep_minutes} min`);
  if (r.difficulty && labels[r.difficulty]) parts.push(labels[r.difficulty]!);
  return parts.join(' · ');
}

/** Tags digitadas separadas por vírgula → lista limpa (minúsculas, sem repetir, até 10). */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const t of text.split(',')) {
    const tag = t.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 10);
}
