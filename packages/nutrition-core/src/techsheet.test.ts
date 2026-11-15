import { describe, expect, it } from 'vitest';
import { computeSheet, cookingIndex, correctionFactor, netWeight, scaleFactor, type SheetInput } from './techsheet';

describe('ficha técnica (RN-130)', () => {
  it('PB 1000 g e FC 1,25 → PL 800 g; PL 800 g e pronto 640 g → IC 0,80', () => {
    expect(netWeight(1000, 1.25)).toBe(800);
    expect(correctionFactor(1000, 800)).toBe(1.25);
    expect(cookingIndex(800, 640)).toBe(0.8);
    expect(() => netWeight(1000, 0.9)).toThrow();
    expect(() => correctionFactor(500, 800)).toThrow();
  });

  const arroz: SheetInput = {
    id: 'arroz',
    servings: 10,
    cookedWeightG: 2500,
    items: [
      { kind: 'ingredient', name: 'Arroz', grossG: 1000, fc: 1, pricePerKgCents: 549, per100g: { energy_kcal: 358, protein_g: 7.2 } },
      { kind: 'ingredient', name: 'Cebola', grossG: 100, fc: 1.25, pricePerKgCents: 400, per100g: { energy_kcal: 39, protein_g: 1.7 } },
      { kind: 'ingredient', name: 'Sal', grossG: 10, fc: 1, pricePerKgCents: null, per100g: null },
    ],
  };

  it('pesos, rendimento, custo e nutrientes', () => {
    const r = computeSheet('arroz', new Map([['arroz', arroz]]));
    expect(r.grossG).toBe(1110);
    expect(r.netG).toBe(1090);
    expect(r.yieldG).toBe(2500);
    expect(r.cookingIndex).toBeCloseTo(2.294, 3);
    expect(r.costCents).toBe(589); // 549 + 40
    expect(r.costPerServingCents).toBe(59);
    expect(r.portionG).toBe(250);
    // nutrientes pela parte comestível: arroz 1000 g, cebola 80 g
    expect(r.totals.energy_kcal).toBeCloseTo(3580 + 31.2, 1);
    expect(r.perServing.energy_kcal).toBeCloseTo(361.12, 2);
    expect(r.per100g.energy_kcal).toBeCloseTo(144.45, 2);
    expect(r.missingNutrients).toEqual(['Sal']);
    expect(r.missingPrices).toEqual(['Sal']);
  });

  it('sem peso pronto: usa o IC; sem IC, o peso líquido', () => {
    expect(computeSheet('a', new Map([['a', { ...arroz, id: 'a', cookedWeightG: null, cookingIndex: 2 }]])).yieldG).toBe(2180);
    expect(computeSheet('b', new Map([['b', { ...arroz, id: 'b', cookedWeightG: null }]])).yieldG).toBe(1090);
  });

  it('sub-receita entra pela fração do rendimento; ciclo é recusado', () => {
    const molho: SheetInput = { id: 'molho', servings: 4, cookedWeightG: 400, items: [{ kind: 'ingredient', name: 'Tomate', grossG: 500, fc: 1.25, pricePerKgCents: 800, per100g: { energy_kcal: 15 } }] };
    const prato: SheetInput = { id: 'prato', servings: 2, items: [{ kind: 'sub', name: 'Molho', grossG: 200, subId: 'molho' }, { kind: 'ingredient', name: 'Massa', grossG: 300, fc: 1, pricePerKgCents: 1000, per100g: { energy_kcal: 370 } }] };
    const r = computeSheet('prato', new Map([['molho', molho], ['prato', prato]]));
    expect(r.costCents).toBe(200 + 300); // metade do molho (400 centavos) + massa
    expect(r.totals.energy_kcal).toBeCloseTo(30 + 1110, 1); // metade de 60 kcal + 1110
    const a: SheetInput = { id: 'x', servings: 1, items: [{ kind: 'sub', name: 'Y', grossG: 10, subId: 'y' }] };
    const b: SheetInput = { id: 'y', servings: 1, items: [{ kind: 'sub', name: 'X', grossG: 10, subId: 'x' }] };
    expect(() => computeSheet('x', new Map([['x', a], ['y', b]]))).toThrow(/ciclo/);
  });

  it('escalar de 10 para 250 porções multiplica por 25', () => {
    expect(scaleFactor(10, 250)).toBe(25);
    expect(() => scaleFactor(0, 10)).toThrow();
  });
});
