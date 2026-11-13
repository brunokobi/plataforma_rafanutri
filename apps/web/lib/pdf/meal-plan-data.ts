import { computePlanTotals, roundToHouseholdMeasure } from '@rafanutri/nutrition-core';
import { foodById as demoFoodById } from '@/lib/demo/foods';
import type { HouseholdMeasure, NutrientValues } from '@rafanutri/nutrition-core';
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
  /** Preparações do consultório usadas no plano (ingredientes e modo de preparo). */
  recipes: PdfRecipe[];
}

export interface EditorMeal {
  id: string;
  name: string;
  time: string;
  items: Array<{ foodId: string; quantityG: number; subs?: Array<{ foodId: string; quantityG: number }> }>;
}

/** Preparação para o PDF: ingredientes em texto e modo de preparo. */
export interface PdfRecipe {
  name: string;
  yieldText: string;
  ingredients: string[];
  instructions: string | null;
}
/** Detalhe da preparação como vem do servidor (por id do alimento). */
export interface RecipeForPdf {
  yield_g: number | null;
  servings: number | null;
  instructions: string | null;
  items: Array<{ name: string | null; quantityG: number }>;
}

/** Monta as preparações do PDF na ordem em que aparecem no plano (sem repetir). */
export function pdfRecipes(meals: EditorMeal[], foodById: PdfFoodLookup, details: Record<string, RecipeForPdf>): PdfRecipe[] {
  const out: PdfRecipe[] = [];
  const seen = new Set<string>();
  for (const m of meals) for (const i of m.items) for (const id of [i.foodId, ...(i.subs ?? []).map((s) => s.foodId)]) {
    const d = details[id];
    if (!d || seen.has(id)) continue;
    seen.add(id);
    const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
    const yieldText = d.yield_g ? `Rende ${fmt(d.yield_g)} g${d.servings ? ` (${d.servings.toLocaleString('pt-BR')} porções)` : ''}` : '';
    out.push({
      name: foodById(id)?.name ?? 'Preparação',
      yieldText,
      ingredients: d.items.map((it) => `${fmt(it.quantityG)} g de ${(it.name ?? 'ingrediente').toLowerCase()}`),
      instructions: d.instructions,
    });
  }
  return out;
}

/** Alimento mínimo que o PDF precisa: nome, composição e medidas caseiras. */
export interface PdfFood {
  name: string;
  per100g: NutrientValues;
  householdMeasures: HouseholdMeasure[];
}
export type PdfFoodLookup = (id: string) => PdfFood | undefined;

function measureText(foodById: PdfFoodLookup, foodId: string, grams: number): string {
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
    /** De onde vêm os alimentos (padrão: base de exemplo). */
    foodById?: PdfFoodLookup;
    /** Detalhes das preparações do consultório usadas no plano, por id do alimento. */
    recipes?: Record<string, RecipeForPdf>;
  },
): MealPlanPdfData {
  const foodById = opts.foodById ?? demoFoodById;
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
          measure: showNumbers ? measureText(foodById, i.foodId, i.quantityG) : '',
          grams: showNumbers ? Math.round(i.quantityG) : 0,
          kcal: Math.round(((food.per100g.energy_kcal ?? 0) * i.quantityG) / 100),
          substitutions: (i.subs ?? []).map((s) =>
            showNumbers ? `${measureText(foodById, s.foodId, s.quantityG)} de ${foodById(s.foodId)!.name.toLowerCase()}` : foodById(s.foodId)!.name,
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
    recipes: pdfRecipes(meals, foodById, opts.recipes ?? {}),
  };
}
