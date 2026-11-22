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

/**
 * Composição por 100 g da preparação com a MESMA regra que a extensão grava (directus/extensions/rafanutri/foods.js,
 * recipePer100g): nutriente sem dado em nenhum ingrediente = null; sem dado em algum = soma do que se sabe e vai para
 * `incomplete`; 2 casas; ingrediente de até 20 kg. A prévia da tela usa esta, para mostrar o que será salvo.
 */
export function recipeComposition(
  ingredients: ReadonlyArray<{ quantityG: number; per100g: NutrientValues }>,
  yieldG: number,
): { per100g: NutrientValues; incomplete: string[] } {
  assertRange('yieldG', yieldG, 1, 100000);
  for (const i of ingredients) assertRange('quantityG', i.quantityG, 0, 20000);
  const codes = [...new Set(ingredients.flatMap((i) => Object.keys(i.per100g)))].sort();
  const per100g: NutrientValues = {};
  const incomplete: string[] = [];
  for (const code of codes) {
    let sum = 0;
    let known = 0;
    for (const i of ingredients) {
      const v = i.per100g[code];
      if (v === null || v === undefined) continue;
      sum += (v * i.quantityG) / 100;
      known += 1;
    }
    if (known === 0) per100g[code] = null;
    else {
      per100g[code] = Math.round((sum / yieldG) * 100 * 100) / 100;
      if (known < ingredients.length) incomplete.push(code);
    }
  }
  return { per100g, incomplete };
}
