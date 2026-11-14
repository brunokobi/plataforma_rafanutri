import { buildMealPlanPdfData, type MealPlanPdfData } from '@/lib/pdf/meal-plan-data';
import type { PatientPlanPayload } from './types';

const DAY = 86_400_000;

/** Dados do PDF do plano a partir do que o servidor devolve ao paciente (sem kcal; alimento não resolvido sai). */
export function patientPlanPdfData(p: PatientPlanPayload): MealPlanPdfData {
  const doc = p.document;
  const food = (id: string) => p.foods[id];
  const meals = p.plan.meals.map((m) => ({
    id: m.id,
    name: m.name,
    time: m.time ?? '',
    items: m.items
      .filter((i) => food(i.foodId))
      .map((i) => ({ foodId: i.foodId, quantityG: Math.min(Math.max(i.quantityG, 0), 5000), subs: i.subs.filter((s) => food(s.foodId)).map((s) => ({ foodId: s.foodId, quantityG: Math.min(Math.max(s.quantityG, 0), 5000) })) })),
  }));
  const issuedAt = p.plan.published_at ? new Date(p.plan.published_at) : new Date();
  const validDays = p.plan.valid_until ? Math.max(1, Math.round((new Date(`${p.plan.valid_until}T12:00:00Z`).getTime() - issuedAt.getTime()) / DAY)) : 30;
  return buildMealPlanPdfData(meals, {
    mode: p.plan.mode,
    showKcal: false,
    practice: {
      practiceName: doc?.practice_name ?? 'Consultório',
      professionalName: doc?.professional_name ?? '',
      crn: doc?.crn ?? '',
      crnRegion: doc?.crn_region ?? 'CRN',
      color: doc?.brand_color ?? '#2E7D32',
      contact: doc?.contact ?? '',
    },
    patient: { name: doc?.patient_name ?? '', objective: doc?.objective ?? '' },
    guidelines: (p.plan.guidelines ?? '').split('\n').map((g) => g.trim()).filter(Boolean),
    issuedAt,
    validDays,
    foodById: (id) => (food(id) ? { name: food(id)!.name, per100g: {}, householdMeasures: food(id)!.household_measures } : undefined),
    recipes: p.recipes,
  });
}

/** "plano-alimentar-2026-11-14.pdf" */
export function patientPdfFileName(publishedAt: string | null): string {
  const d = publishedAt ? new Date(publishedAt) : new Date();
  const day = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return `plano-alimentar-${day}.pdf`;
}
