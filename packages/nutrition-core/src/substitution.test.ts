import { describe, expect, it } from 'vitest';
import { NutritionInputError } from './errors';
import { computeSubstitution, equivalentQuantity, rankSubstitutes, roundToHouseholdMeasure } from './substitution';

const rice = { id: 'rice', per100g: { energy_kcal: 128, protein_g: 2.5, carbohydrate_g: 28.1, lipid_g: 0.2 } };
const pasta = {
  id: 'pasta',
  per100g: { energy_kcal: 160, protein_g: 5, carbohydrate_g: 31, lipid_g: 1 },
  householdMeasures: [{ label: 'colher de sopa', grams: 25 }, { label: 'escumadeira', grams: 40 }],
};
const potato = { id: 'potato', per100g: { energy_kcal: 52, protein_g: 1.2, carbohydrate_g: 11.9, lipid_g: 0 } };
const oil = { id: 'oil', per100g: { energy_kcal: 884, protein_g: 0, carbohydrate_g: 0, lipid_g: 100 } };

describe('equivalência', () => {
  it('iguala a energia', () => {
    expect(equivalentQuantity(rice.per100g, 100, pasta.per100g, 'energy_kcal')).toBeCloseTo(80, 5);
  });
  it('recusa substituto sem o nutriente do critério', () => {
    expect(() => equivalentQuantity(rice.per100g, 100, oil.per100g, 'carbohydrate_g')).toThrow(NutritionInputError);
  });
  it('arredonda para a medida caseira mais próxima', () => {
    expect(roundToHouseholdMeasure(80, pasta.householdMeasures)).toEqual({
      grams: 80, measure: { label: 'escumadeira', quantity: 2 },
    });
    expect(roundToHouseholdMeasure(83)).toEqual({ grams: 85, measure: null });
  });
  it('mostra a diferença após o arredondamento', () => {
    const r = computeSubstitution(rice, 100, pasta, 'energy_kcal');
    expect(r.quantityG).toBe(80);
    expect(r.delta.energy_kcal).toBeCloseTo(0, 5);
    expect(r.delta.protein_g).toBeCloseTo(1.5, 5);
  });
  it('ordena candidatos pela menor diferença nos outros macros', () => {
    const ranked = rankSubstitutes(rice, 100, [pasta, potato, oil, rice], 'energy_kcal');
    expect(ranked.map((r) => r.food.id)).toEqual(['potato', 'pasta', 'oil']);
  });
});
