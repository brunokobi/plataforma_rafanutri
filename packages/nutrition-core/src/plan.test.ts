import { describe, expect, it } from 'vitest';
import { adequacy, computePlanTotals, scaleQuantity } from './plan';
import { recipeNutrition } from './recipe';

const rice = { energy_kcal: 128, protein_g: 2.5, carbohydrate_g: 28.1, lipid_g: 0.2, fiber_g: 1.6 };
const beans = { energy_kcal: 76, protein_g: 4.8, carbohydrate_g: 13.6, lipid_g: 0.5, fiber_g: null };

describe('totais do plano', () => {
  const totals = computePlanTotals([
    { id: 'lunch', items: [{ quantityG: 100, per100g: rice }, { quantityG: 80, per100g: beans }] },
    { id: 'snack', items: [{ quantityG: 100, per100g: { energy_kcal: 100 } }] },
  ]);
  it('soma por refeição e no dia', () => {
    expect(totals.meals.lunch!.totals.energy_kcal).toBeCloseTo(188.8, 5);
    expect(totals.meals.lunch!.totals.protein_g).toBeCloseTo(6.34, 5);
    expect(totals.day.totals.energy_kcal).toBeCloseTo(288.8, 5);
  });
  it('marca nutriente incompleto em vez de contar como zero silenciosamente', () => {
    expect(totals.day.incomplete).toEqual(['fiber_g']);
  });
  it('distribuição da energia por refeição', () => {
    expect(totals.energyShareByMeal.lunch).toBeCloseTo(65.37, 2);
  });
});

describe('adequação', () => {
  it('faixas 90–110%', () => {
    expect(adequacy(95, 100)).toEqual({ pct: 95, band: 'adequate' });
    expect(adequacy(85, 100).band).toBe('below');
    expect(adequacy(115, 100).band).toBe('above');
  });
});

describe('modelos e preparações', () => {
  it('escala quantidade para outra meta', () => {
    expect(scaleQuantity(100, 2000, 1600)).toBeCloseTo(80, 5);
  });
  it('composição por 100 g e por porção a partir do rendimento', () => {
    const r = recipeNutrition(
      [{ quantityG: 100, per100g: { energy_kcal: 358 } }, { quantityG: 5, per100g: { energy_kcal: 884 } }],
      250,
      2,
    );
    expect(r.per100g.energy_kcal).toBeCloseTo(160.88, 5);
    expect(r.perServing!.energy_kcal).toBeCloseTo(201.1, 5);
  });
});
