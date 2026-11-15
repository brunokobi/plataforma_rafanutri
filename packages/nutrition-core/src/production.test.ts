import { describe, expect, it } from 'vitest';
import { averageAdhesion, plannedPortions, realCorrectionFactor, requisition, wasteIndicators } from './production';
import type { SheetInput } from './techsheet';

describe('produção da UAN (U3)', () => {
  it('60% de adesão em 300 comensais = 180 porções', () => {
    expect(plannedPortions(300, 0.6)).toBe(180);
    expect(plannedPortions(301, 0.6)).toBe(181);
    expect(plannedPortions(300)).toBe(300);
    expect(() => plannedPortions(-1)).toThrow();
  });

  it('adesão média ponderada pelos comensais', () => {
    expect(averageAdhesion([{ portionsServed: 180, diners: 300 }, { portionsServed: 120, diners: 200 }])).toBe(0.6);
    expect(averageAdhesion([])).toBeNull();
  });

  const sheets = new Map<string, SheetInput>([
    ['frango', { id: 'frango', servings: 10, items: [
      { kind: 'ingredient', name: 'cebola|Cebola', grossG: 200, fc: 1.25, pricePerKgCents: 400, per100g: null },
      { kind: 'ingredient', name: 'frango|Frango', grossG: 1500, fc: 1.1, pricePerKgCents: 1500, per100g: null },
    ] }],
    ['arroz', { id: 'arroz', servings: 10, items: [
      { kind: 'ingredient', name: 'arroz|Arroz', grossG: 1000, fc: 1, pricePerKgCents: 549, per100g: null },
      { kind: 'sub', name: 'Refogado', grossG: 100, subId: 'refogado' },
    ] }],
    ['refogado', { id: 'refogado', servings: 4, cookedWeightG: 200, items: [
      { kind: 'ingredient', name: 'cebola|Cebola', grossG: 300, fc: 1.25, pricePerKgCents: 400, per100g: null },
    ] }],
  ]);

  it('mesmo insumo de dois pratos vira uma linha (com sub-receita)', () => {
    const lines = requisition([{ sheetId: 'frango', portions: 300, label: 'Frango' }, { sheetId: 'arroz', portions: 300, label: 'Arroz' }], sheets);
    const cebola = lines.find((l) => l.key === 'cebola')!;
    // frango: 200 × 30 = 6000 g; arroz: 100 g de refogado × 30 = 3000 g de refogado = 15 × o rendimento de 200 g → 300 × 15 = 4500 g
    expect(cebola.grossG).toBe(6000 + 4500);
    expect(cebola.from.sort()).toEqual(['Arroz', 'Frango']);
    expect(lines.find((l) => l.key === 'arroz')!.grossG).toBe(30000);
    expect(lines.map((l) => l.name)).toEqual(['Arroz', 'Cebola', 'Frango']);
  });

  it('margem de segurança', () => {
    const lines = requisition([{ sheetId: 'frango', portions: 10, label: 'Frango' }], sheets, 5);
    expect(lines.find((l) => l.key === 'frango')!.grossG).toBe(1575);
  });

  it('100 kg produzidos, 4 kg de sobra e 8 kg de resto: 4% de sobra e 8,3% de resto-ingesta', () => {
    const w = wasteIndicators({ producedG: 100000, leftoverG: 4000, plateWasteG: 8000, diners: 250, costPerKgCents: 1200 });
    expect(w.distributedG).toBe(96000);
    expect(w.leftoverPct).toBe(4);
    expect(w.plateWastePct).toBe(8.3);
    expect(w.acceptancePct).toBe(91.7);
    expect(w.perCapitaWasteG).toBe(32);
    expect(w.wasteCostCents).toBe(14400);
    expect(() => wasteIndicators({ producedG: 1, leftoverG: 2, plateWasteG: 0, diners: 1 })).toThrow();
    expect(wasteIndicators({ producedG: 0, leftoverG: 0, plateWasteG: 0, diners: 0 }).leftoverPct).toBeNull();
  });

  it('FC real × FC da ficha', () => {
    expect(realCorrectionFactor(1000, 750, 1.25)).toEqual({ fc: 1.333, diffPct: 6.6 });
  });
});

import { purchaseRequirements } from './production';

describe('necessidade de compra (RN-139)', () => {
  // 150 g de arroz cozido por pessoa, IC 2,5 e FC 1: a ficha de 10 porções usa 600 g cru e rende 1500 g
  const arroz = new Map<string, SheetInput>([['arroz', { id: 'arroz', servings: 10, cookingIndex: 2.5, items: [{ kind: 'ingredient', name: 'arroz|Arroz', grossG: 600, fc: 1, pricePerKgCents: 549, per100g: null }] }]]);

  it('100 comensais de arroz (150 g cozido, IC 2,5) = 6 kg de arroz cru', () => {
    const [line] = purchaseRequirements([[{ sheetId: 'arroz', portions: 100, label: 'Arroz' }]], arroz, new Map(), new Map(), new Map([['arroz', 1000]]));
    expect(line!.needG).toBe(6000);
    expect(line!.toBuyUnits).toBe(6);
  });

  it('soma os dias, aplica a margem, desconta estoque e pedidos e arredonda para a embalagem', () => {
    const [line] = purchaseRequirements(
      [[{ sheetId: 'arroz', portions: 100, label: 'Arroz' }], [{ sheetId: 'arroz', portions: 50, label: 'Arroz' }]],
      arroz, new Map([['arroz', 2000]]), new Map([['arroz', 1000]]), new Map([['arroz', 5000]]), 10,
    );
    expect(line!.needG).toBe(9900); // 9000 × 1,1
    expect(line!.toBuyG).toBe(6900);
    expect(line!.toBuyUnits).toBe(2); // pacotes de 5 kg
    const [none] = purchaseRequirements([[{ sheetId: 'arroz', portions: 10, label: 'Arroz' }]], arroz, new Map([['arroz', 5000]]), new Map(), new Map([['arroz', 1000]]));
    expect(none!.toBuyG).toBe(0);
  });
});
