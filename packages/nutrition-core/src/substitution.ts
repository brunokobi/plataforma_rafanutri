import { assertRange, NutritionInputError } from './errors';
import type { NutrientValues } from './plan';

export type SubstitutionCriterion = 'energy_kcal' | 'protein_g' | 'carbohydrate_g' | 'lipid_g';

export interface FoodRef {
  id: string;
  per100g: NutrientValues;
  householdMeasures?: readonly HouseholdMeasure[];
}

export interface HouseholdMeasure {
  label: string;
  grams: number;
}

/** Quantidade do substituto que iguala o critério: q_orig × (valor_orig / valor_subst). */
export function equivalentQuantity(
  original: NutrientValues,
  originalQuantityG: number,
  substitute: NutrientValues,
  criterion: SubstitutionCriterion,
): number {
  assertRange('originalQuantityG', originalQuantityG, 0, 5000);
  const o = original[criterion];
  const s = substitute[criterion];
  if (o == null || s == null) {
    throw new NutritionInputError('MISSING_FIELD', criterion, `Sem dado de ${criterion} para calcular a equivalência`);
  }
  if (s <= 0) {
    throw new NutritionInputError('INVALID_INPUT', criterion, `O substituto não tem ${criterion}; escolha outro critério`);
  }
  return (originalQuantityG * o) / s;
}

export interface RoundedQuantity {
  grams: number;
  measure: { label: string; quantity: number } | null;
}

/**
 * Arredonda para a medida caseira mais próxima (em passos de meia medida).
 * Sem medida caseira, arredonda para múltiplos de 5 g.
 */
export function roundToHouseholdMeasure(grams: number, measures: readonly HouseholdMeasure[] = []): RoundedQuantity {
  assertRange('grams', grams, 0, 5000);
  let best: RoundedQuantity | null = null;
  let bestErr = Infinity;
  for (const m of measures) {
    if (m.grams <= 0) continue;
    const quantity = Math.max(0.5, Math.round((grams / m.grams) * 2) / 2);
    const g = quantity * m.grams;
    const err = Math.abs(g - grams);
    if (err < bestErr) {
      bestErr = err;
      best = { grams: g, measure: { label: m.label, quantity } };
    }
  }
  return best ?? { grams: Math.max(5, Math.round(grams / 5) * 5), measure: null };
}

export interface SubstitutionResult {
  quantityG: number;
  measure: RoundedQuantity['measure'];
  /** Diferença do substituto em relação ao original (substituto − original), por nutriente. */
  delta: Record<string, number | null>;
}

const COMPARE_KEYS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'lipid_g'] as const;

export function computeSubstitution(
  original: FoodRef,
  originalQuantityG: number,
  substitute: FoodRef,
  criterion: SubstitutionCriterion,
): SubstitutionResult {
  const raw = equivalentQuantity(original.per100g, originalQuantityG, substitute.per100g, criterion);
  const rounded = roundToHouseholdMeasure(raw, substitute.householdMeasures);
  const delta: Record<string, number | null> = {};
  for (const k of COMPARE_KEYS) {
    const o = original.per100g[k];
    const s = substitute.per100g[k];
    delta[k] = o == null || s == null ? null : (s * rounded.grams) / 100 - (o * originalQuantityG) / 100;
  }
  return { quantityG: rounded.grams, measure: rounded.measure, delta };
}

/**
 * Ordena candidatos pela menor diferença nos macros que não são o critério
 * (soma das diferenças absolutas em kcal), após igualar o critério.
 */
export function rankSubstitutes(
  original: FoodRef,
  originalQuantityG: number,
  candidates: readonly FoodRef[],
  criterion: SubstitutionCriterion,
): Array<{ food: FoodRef; result: SubstitutionResult; score: number }> {
  const kcal: Record<string, number> = { protein_g: 4, carbohydrate_g: 4, lipid_g: 9 };
  const ranked: Array<{ food: FoodRef; result: SubstitutionResult; score: number }> = [];
  for (const food of candidates) {
    if (food.id === original.id) continue;
    let result: SubstitutionResult;
    try {
      result = computeSubstitution(original, originalQuantityG, food, criterion);
    } catch {
      continue;
    }
    let score = 0;
    for (const k of ['protein_g', 'carbohydrate_g', 'lipid_g'] as const) {
      if (k === criterion) continue;
      score += Math.abs(result.delta[k] ?? 0) * kcal[k]!;
    }
    ranked.push({ food, result, score });
  }
  return ranked.sort((a, b) => a.score - b.score);
}
