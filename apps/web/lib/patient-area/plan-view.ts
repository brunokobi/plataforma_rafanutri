import { roundToHouseholdMeasure } from '@rafanutri/nutrition-core';
import { formatMeasure } from '@/lib/format/measure';
import { pdfRecipes, type PdfRecipe } from '@/lib/pdf/meal-plan-data';
import type { PatientPlanPayload } from './types';

export interface PlanViewItem { name: string; amount: string; substitutions: string[] }
export interface PlanViewMeal { id: string; name: string; time: string | null; items: PlanViewItem[] }
export interface PatientPlanView {
  title: string;
  publishedAt: string | null;
  validUntil: string | null;
  meals: PlanViewMeal[];
  guidelines: string[];
  recipes: PdfRecipe[];
}

/** "2 colheres de sopa (50 g)"; sem medida caseira, só gramas. Vazio no plano qualitativo. */
export function amountText(grams: number, measures: Array<{ label: string; grams: number }>): string {
  if (!(grams > 0)) return '';
  const g = Math.min(grams, 5000);
  const r = roundToHouseholdMeasure(g, measures);
  const rounded = Math.round(g);
  return r.measure ? `${formatMeasure(r.measure.quantity, r.measure.label)} (${rounded} g)` : `${rounded} g`;
}

/** Monta o plano como o paciente lê (função pura). Alimento que não veio do servidor é ignorado. */
export function buildPatientPlanView(p: PatientPlanPayload): PatientPlanView {
  const quantitative = p.plan.mode !== 'qualitative';
  const food = (id: string) => p.foods[id];
  const meals = p.plan.meals.map((m) => ({
    id: m.id,
    name: m.name,
    time: m.time,
    items: m.items.flatMap((i) => {
      const f = food(i.foodId);
      if (!f) return [];
      const substitutions = i.subs.flatMap((s) => {
        const sf = food(s.foodId);
        if (!sf) return [];
        const amt = quantitative ? amountText(s.quantityG, sf.household_measures) : '';
        return [amt ? `${sf.name} — ${amt}` : sf.name];
      });
      return [{ name: f.name, amount: quantitative ? amountText(i.quantityG, f.household_measures) : '', substitutions }];
    }),
  }));
  const lookup = (id: string) => (food(id) ? { name: food(id)!.name, per100g: {}, householdMeasures: food(id)!.household_measures } : undefined);
  return {
    title: p.plan.title,
    publishedAt: p.plan.published_at,
    validUntil: p.plan.valid_until,
    meals,
    guidelines: (p.plan.guidelines ?? '').split('\n').map((g) => g.trim()).filter(Boolean),
    recipes: pdfRecipes(p.plan.meals.map((m) => ({ ...m, time: m.time ?? '' })), lookup, p.recipes),
  };
}
