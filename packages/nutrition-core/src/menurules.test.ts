import { describe, expect, it } from 'vitest';
import { evaluateRules, mealAdequacy as adequacy, sumMeal, targetValue, type PlannedDish } from './menurules';

const d = (day: number, slot: string, name: string, extra: Partial<PlannedDish> = {}): PlannedDish => ({ day, service: 'lunch', slot, rootId: name, name, category: slot === 'main' ? 'main' : 'side', ingredientIds: [], costCents: 300, ...extra });

describe('regras e metas do cardápio (RN-221)', () => {
  it('adequação às metas do PAT', () => {
    const meal = sumMeal([{ energy_kcal: 450, carbohydrate_g: 60, protein_g: 25, lipid_g: 12, sodium_mg: 500 }, { energy_kcal: 200, carbohydrate_g: 30, protein_g: 5, lipid_g: 5, sodium_mg: 300 }]);
    expect(meal.energy_kcal).toBe(650);
    expect(targetValue('carb_pct', meal)).toBe(55.4);
    const rows = adequacy(meal, { energy_kcal: { min: 600, max: 800 }, carb_pct: { min: 55, max: 75 }, protein_pct: { target: 15 }, fat_pct: { min: 15, max: 30 }, sodium_mg: { min: 720, max: 960 }, fiber_g: { min: 7 } });
    expect(Object.fromEntries(rows.map((r) => [r.key, r.status]))).toEqual({ energy_kcal: 'ok', carb_pct: 'ok', protein_pct: 'high', fat_pct: 'ok', sodium_mg: 'ok', fiber_g: 'unknown' });
    expect(adequacy({ energy_kcal: 500 }, { energy_kcal: { min: 600 } })[0]!.status).toBe('low');
  });

  it('regras do contrato', () => {
    const dishes = [
      d(1, 'main', 'Fígado acebolado', { ingredientIds: ['figado'], costCents: 900 }), d(1, 'salad', 'Alface'),
      d(2, 'main', 'Frango'), d(3, 'main', 'Frito', { category: 'main' }), d(3, 'salad', 'Tomate'), d(4, 'main', 'Bife'),
    ];
    const w = evaluateRules(dishes, [
      { id: 'r1', kind: 'vetoed_ingredient', ingredient_id: 'figado' },
      { id: 'r2', kind: 'required_daily', slot: 'salad' },
      { id: 'r3', kind: 'max_per_week', sheet_category: 'main', max_count: 3 },
      { id: 'r4', kind: 'cost_ceiling', cost_cents: 1000 },
    ], { lengthDays: 7, services: ['lunch'] }, { ingredient: () => 'fígado', slot: () => 'salada', category: () => 'prato principal' });
    expect(w.map((x) => [x.ruleId, x.day])).toEqual([['r1', 1], ['r3', 1], ['r4', 1], ['r2', 2], ['r2', 4]]);
    expect(w.find((x) => x.ruleId === 'r1')!.message).toBe('Fígado acebolado leva fígado, vetado no contrato.');
    expect(w.find((x) => x.ruleId === 'r3')!.message).toBe('prato principal aparece 4 vezes na semana 1 (máximo 3).');
    expect(w.find((x) => x.ruleId === 'r4')!.message).toContain('R$ 12,00');
  });
});
