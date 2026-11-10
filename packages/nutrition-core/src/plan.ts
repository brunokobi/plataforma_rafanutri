import { assertRange } from './errors';

/** Código do nutriente (ex.: energy_kcal, protein_g) → valor. `null` = não analisado na fonte. */
export type NutrientValues = Record<string, number | null>;

export interface NutrientTotals {
  /** Soma dos valores conhecidos. */
  totals: Record<string, number>;
  /** Nutrientes em que algum item não tinha dado (o total é um valor mínimo). */
  incomplete: string[];
}

/** Nutrientes de um item: valor por 100 g × quantidade / 100. */
export function itemNutrients(per100g: NutrientValues, quantityG: number): NutrientValues {
  assertRange('quantityG', quantityG, 0, 5000);
  const out: NutrientValues = {};
  for (const [code, v] of Object.entries(per100g)) {
    out[code] = v === null ? null : (v * quantityG) / 100;
  }
  return out;
}

export function sumNutrients(items: readonly NutrientValues[]): NutrientTotals {
  const totals: Record<string, number> = {};
  const incomplete = new Set<string>();
  for (const item of items) {
    for (const [code, v] of Object.entries(item)) {
      if (v === null) {
        incomplete.add(code);
        totals[code] ??= 0;
      } else {
        totals[code] = (totals[code] ?? 0) + v;
      }
    }
  }
  return { totals, incomplete: [...incomplete].sort() };
}

export interface PlanItemInput {
  quantityG: number;
  per100g: NutrientValues;
}
export interface PlanMealInput {
  id: string;
  items: readonly PlanItemInput[];
}

export interface PlanTotals {
  meals: Record<string, NutrientTotals>;
  day: NutrientTotals;
  /** Percentual da energia do dia em cada refeição. */
  energyShareByMeal: Record<string, number>;
}

export function computePlanTotals(meals: readonly PlanMealInput[], energyCode = 'energy_kcal'): PlanTotals {
  const mealTotals: Record<string, NutrientTotals> = {};
  const all: NutrientValues[] = [];
  for (const meal of meals) {
    const items = meal.items.map((i) => itemNutrients(i.per100g, i.quantityG));
    mealTotals[meal.id] = sumNutrients(items);
    all.push(...items);
  }
  const day = sumNutrients(all);
  const dayEnergy = day.totals[energyCode] ?? 0;
  const energyShareByMeal: Record<string, number> = {};
  for (const [id, t] of Object.entries(mealTotals)) {
    energyShareByMeal[id] = dayEnergy > 0 ? ((t.totals[energyCode] ?? 0) / dayEnergy) * 100 : 0;
  }
  return { meals: mealTotals, day, energyShareByMeal };
}

export type AdequacyBand = 'below' | 'adequate' | 'above';

export interface Adequacy {
  pct: number;
  band: AdequacyBand;
}

/** Adequação = total / meta × 100, com faixa (padrão: abaixo de 90%, 90–110%, acima de 110%). */
export function adequacy(total: number, target: number, lower = 90, upper = 110): Adequacy {
  assertRange('target', target, Number.MIN_VALUE, Number.MAX_VALUE);
  const pct = (total / target) * 100;
  const band: AdequacyBand = pct < lower ? 'below' : pct > upper ? 'above' : 'adequate';
  return { pct, band };
}

/** Escala as quantidades de um modelo para outra meta energética (ex.: 2000 → 1600 kcal). */
export function scaleQuantity(quantityG: number, fromKcal: number, toKcal: number): number {
  assertRange('fromKcal', fromKcal, 1, 20000);
  assertRange('toKcal', toKcal, 1, 20000);
  return quantityG * (toKcal / fromKcal);
}
