import { assertRange } from './errors';
import { itemNutrients, sumNutrients, type NutrientValues, type PlanItemInput } from './plan';

export interface RecipeNutrition {
  /** Composição por 100 g da preparação pronta. */
  per100g: NutrientValues;
  /** Composição por porção, se `servings` for informado. */
  perServing: NutrientValues | null;
  incomplete: string[];
}

/**
 * Composição de uma preparação: soma dos ingredientes, normalizada pelo peso final (rendimento).
 * `yieldG` é o peso da preparação pronta, que reflete perdas e ganhos de água na cocção.
 */
export function recipeNutrition(ingredients: readonly PlanItemInput[], yieldG: number, servings?: number): RecipeNutrition {
  assertRange('yieldG', yieldG, 1, 100000);
  const { totals, incomplete } = sumNutrients(ingredients.map((i) => itemNutrients(i.per100g, i.quantityG)));
  const per100g: NutrientValues = {};
  for (const [code, v] of Object.entries(totals)) per100g[code] = (v / yieldG) * 100;
  let perServing: NutrientValues | null = null;
  if (servings !== undefined) {
    assertRange('servings', servings, 0.1, 1000);
    perServing = {};
    for (const [code, v] of Object.entries(totals)) perServing[code] = v / servings;
  }
  return { per100g, perServing, incomplete };
}
