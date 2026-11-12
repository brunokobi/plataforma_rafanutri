import type { PlanMeal } from './schema';

/** Fator de escala entre o modelo e a meta (limitado a 0,3×–3× para evitar erros de digitação). */
export function scaleFactor(templateKcal: number | null | undefined, targetKcal: number | null | undefined): number | null {
  if (!templateKcal || !targetKcal || templateKcal <= 0 || targetKcal <= 0) return null;
  const f = targetKcal / templateKcal;
  return Math.min(3, Math.max(0.3, f));
}

/**
 * Arredondamento prático para quem vai pesar ou medir: de 5 em 5 g a partir de 20 g,
 * de 1 em 1 g abaixo disso (temperos, óleos, castanhas), nunca zerando um alimento que existia.
 */
export function roundPortion(grams: number): number {
  if (grams <= 0) return 0;
  const r = grams >= 20 ? Math.round(grams / 5) * 5 : Math.round(grams);
  return Math.max(1, r);
}

/** Escala as quantidades de todas as refeições (itens e substituições) pelo fator. */
export function scaleMeals(meals: PlanMeal[], factor: number): PlanMeal[] {
  return meals.map((m) => ({
    ...m,
    items: m.items.map((i) => ({
      ...i,
      quantityG: roundPortion(i.quantityG * factor),
      ...(i.subs ? { subs: i.subs.map((s) => ({ ...s, quantityG: roundPortion(s.quantityG * factor) })) } : {}),
    })),
  }));
}

/** Tags digitadas ("low carb, Emagrecimento") → lista limpa, como o banco guarda. */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10).map((t) => t.slice(0, 30));
}
