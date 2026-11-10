import { describe, expect, it } from 'vitest';
import { macroDistribution, resolveMacro } from './macros';

describe('macronutrientes', () => {
  it('g/kg → gramas, kcal e %', () => {
    const r = resolveMacro('protein', { mode: 'g_per_kg', value: 2 }, 2000, 70);
    expect(r).toMatchObject({ grams: 140, kcal: 560 });
    expect(r.pct).toBeCloseTo(28, 5);
  });
  it('% → gramas', () => {
    expect(resolveMacro('carbohydrate', { mode: 'pct', value: 50 }, 2000, 70).grams).toBeCloseTo(250, 5);
  });
  it('distribuição soma e mostra a diferença para a meta', () => {
    const d = macroDistribution(
      { protein: { mode: 'g_per_kg', value: 2 }, carbohydrate: { mode: 'pct', value: 50 }, lipid: { mode: 'grams', value: 70 } },
      2000,
      70,
    );
    expect(d.totalKcal).toBeCloseTo(2190, 5);
    expect(d.deltaKcal).toBeCloseTo(190, 5);
    expect(d.lipid.gPerKg).toBeCloseTo(1, 5);
  });
});
