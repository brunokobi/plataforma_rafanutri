import type { Food } from '@/lib/foods/food';
import { DEMO_FOODS, DEMO_PLAN, type DemoMeal } from './foods';

/**
 * Plano de exemplo da paciente fictícia com os alimentos equivalentes da TACO 4ª ed.
 * A TACO não tem tilápia: usa pintado grelhado (outro peixe branco grelhado).
 */
export const DEMO_TO_TACO: Record<string, string> = {
  'pao-integral': '52', // Pão, trigo, forma, integral
  ovo: '488', // Ovo, de galinha, inteiro, cozido/10minutos
  mamao: '226', // Mamão, Papaia, cru
  banana: '182', // Banana, prata, crua
  arroz: '3', // Arroz, tipo 1, cozido
  feijao: '561', // Feijão, carioca, cozido
  frango: '410', // Frango, peito, sem pele, grelhado
  brocolis: '100', // Brócolis, cozido
  azeite: '260', // Azeite, de oliva, extra virgem
  'iogurte-zero-lactose': '448', // Iogurte, natural
  aveia: '7', // Aveia, flocos, crua
  morango: '239', // Morango, cru
  castanha: '589', // Castanha-do-Brasil, crua
  'batata-doce': '88', // Batata, doce, cozida
  tilapia: '313', // Pintado, grelhado
  alface: '78', // Alface, crespa, crua
  tomate: '157', // Tomate, com semente, cru
};

export const DEMO_TACO_CODES = [...new Set(Object.values(DEMO_TO_TACO))];

/** Troca os ids da base de exemplo pelos alimentos da TACO. Null se faltar algum alimento. */
export function demoPlanWithTaco(byCode: Map<string, Food>): { plan: DemoMeal[]; foods: Food[] } | null {
  const plan: DemoMeal[] = [];
  for (const meal of DEMO_PLAN) {
    const items = [];
    for (const item of meal.items) {
      const food = byCode.get(DEMO_TO_TACO[item.foodId] ?? '');
      if (!food) return null;
      items.push({ ...item, foodId: food.id });
    }
    plan.push({ ...meal, items });
  }
  return { plan, foods: [...byCode.values()] };
}

/** Base de exemplo no formato do editor (usada só se o Directus estiver fora do ar). */
export function demoFoodsAsFoods(): Food[] {
  return DEMO_FOODS.map((f) => ({ ...f, source: 'EXEMPLO' }));
}
