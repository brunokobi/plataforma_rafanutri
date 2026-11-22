import { describe, expect, it } from 'vitest';
import { recipeComposition, recipeNutrition } from './recipe';

describe('preparações', () => {
  const arroz = { quantityG: 200, per100g: { energy_kcal: 128, fiber_g: 1.6, vitamin_c_mg: null } };
  const feijao = { quantityG: 100, per100g: { energy_kcal: 76, fiber_g: null, vitamin_c_mg: null } };

  it('composição igual à gravada pelo servidor: null sem dado, incompleto, 2 casas', () => {
    const r = recipeComposition([arroz, feijao], 280);
    expect(r.per100g.energy_kcal).toBe(118.57);
    expect(r.per100g.fiber_g).toBe(1.14);
    expect(r.per100g.vitamin_c_mg).toBeNull();
    expect(r.incomplete).toEqual(['fiber_g']);
  });

  it('aceita ingrediente de até 20 kg (receita de cozinha industrial)', () => {
    expect(recipeComposition([{ quantityG: 15000, per100g: { energy_kcal: 100 } }], 15000).per100g.energy_kcal).toBe(100);
    expect(() => recipeComposition([{ quantityG: 25000, per100g: {} }], 1000)).toThrow();
  });

  it('recipeNutrition por porção', () => {
    const r = recipeNutrition([arroz], 200, 2);
    expect(r.per100g.energy_kcal).toBe(128);
    expect(r.perServing?.energy_kcal).toBe(128);
  });
});
