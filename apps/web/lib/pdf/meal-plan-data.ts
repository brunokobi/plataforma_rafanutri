import { computePlanTotals, roundToHouseholdMeasure } from '@rafanutri/nutrition-core';
import { foodById } from '@/lib/demo/foods';
import { formatMeasure } from '@/lib/format/measure';

export interface PdfItem {
  name: string;
  measure: string;
  grams: number;
  kcal: number;
  substitutions: string[];
}
export interface PdfMeal {
  time: string;
  name: string;
  kcal: number;
  items: PdfItem[];
}
export interface MealPlanPdfData {
  practice: { practiceName: string; professionalName: string; crn: string; crnRegion: string; color: string; contact: string };
  patient: { name: string; objective: string };
  issuedAt: string; // dd/mm/aaaa
  validUntil: string;
  mode: 'quantitative' | 'qualitative';
  showKcal: boolean;
  meals: PdfMeal[];
  totals: { energy: number; protein: number; carbohydrate: number; lipid: number } | null;
  guidelines: string[];
}

export interface EditorMeal {
  id: string;
  name: string;
  time: string;
  items: Array<{ foodId: string; quantityG: number; subs?: Array<{ foodId: string; quantityG: number }> }>;
}

function measureText(foodId: string, grams: number): string {
  const food = foodById(foodId)!;
  const r = roundToHouseholdMeasure(grams, food.householdMeasures);
  if (!r.measure) return `${Math.round(grams)} g`;
  return formatMeasure(r.measure.quantity, r.measure.label);
}

const dateBR = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Monta os dados do PDF a partir do estado do editor (função pura, testável). */
export function buildMealPlanPdfData(
  meals: EditorMeal[],
  opts: {
    mode: 'quantitative' | 'qualitative';
    showKcal: boolean;
    practice: MealPlanPdfData['practice'];
    patient: MealPlanPdfData['patient'];
    guidelines: string[];
    issuedAt?: Date;
    validDays?: number;
  },
): MealPlanPdfData {
  const issued = opts.issuedAt ?? new Date();
  const valid = new Date(issued.getTime() + (opts.validDays ?? 30) * 86_400_000);
  const totals = computePlanTotals(
    meals.map((m) => ({ id: m.id, items: m.items.map((i) => ({ quantityG: i.quantityG, per100g: foodById(i.foodId)!.per100g })) })),
  );
  const showNumbers = opts.mode === 'quantitative';
  return {
    practice: opts.practice,
    patient: opts.patient,
    issuedAt: dateBR(issued),
    validUntil: dateBR(valid),
    mode: opts.mode,
    showKcal: showNumbers && opts.showKcal,
    meals: meals.map((m) => ({
      time: m.time,
      name: m.name,
      kcal: Math.round(totals.meals[m.id]?.totals.energy_kcal ?? 0),
      items: m.items.map((i) => {
        const food = foodById(i.foodId)!;
        return {
          name: food.name,
          measure: showNumbers ? measureText(i.foodId, i.quantityG) : '',
          grams: showNumbers ? Math.round(i.quantityG) : 0,
          kcal: Math.round(((food.per100g.energy_kcal ?? 0) * i.quantityG) / 100),
          substitutions: (i.subs ?? []).map((s) =>
            showNumbers ? `${measureText(s.foodId, s.quantityG)} de ${foodById(s.foodId)!.name.toLowerCase()}` : foodById(s.foodId)!.name,
          ),
        };
      }),
    })),
    totals:
      showNumbers && opts.showKcal
        ? {
            energy: Math.round(totals.day.totals.energy_kcal ?? 0),
            protein: Math.round(totals.day.totals.protein_g ?? 0),
            carbohydrate: Math.round(totals.day.totals.carbohydrate_g ?? 0),
            lipid: Math.round(totals.day.totals.lipid_g ?? 0),
          }
        : null,
    guidelines: opts.guidelines,
  };
}
