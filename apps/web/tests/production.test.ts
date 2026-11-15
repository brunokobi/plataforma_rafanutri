import { describe, expect, it } from 'vitest';
import { dayRequisition, prepList, serviceIndicators, sheetInputs, type ProductionDay } from '@/lib/uan/production';

const sheet = (id: string, name: string, items: ProductionDay['graph']['sheets'][number]['items'], p: Partial<ProductionDay['graph']['sheets'][number]> = {}) => ({
  id, organization_id: 'o', root_id: id, parent_id: null, version: 1, name, category: 'main' as const, servings: 10, cooked_weight_g: null, cooking_index: null,
  prep_minutes: null, equipment: null, notes: null, status: 'approved' as const, computed: null, approved_at: null, updated_at: null, items, ...p,
});
const ing = (id: string, name: string, p: Partial<ProductionDay['graph']['ingredients'][number]> = {}) => ({
  id, name, default_fc: 1, allergens: [], food_name: null, per100g: null, price_per_kg_cents: 1000, purchase_unit: 'kg', grams_per_unit: 1000, ...p,
});

const day: ProductionDay = {
  unit: { id: 'u', name: 'U' }, day: '2026-11-16', can_plan: true, can_record: true, can_see_cost: true,
  diners: [{ service: 'lunch', planned: 300, actual: 250 }],
  menu: [
    { service: 'lunch', slot: 'main', sheet_root_id: 'frango', sheet_id: 'frango', name: 'Frango', cycle_name: 'C' },
    { service: 'lunch', slot: 'side', sheet_root_id: 'arroz', sheet_id: 'arroz', name: 'Arroz', cycle_name: 'C' },
  ],
  graph: {
    sheets: [
      sheet('frango', 'Frango', [{ position: 1, ingredient_id: 'cebola', sub_sheet_id: null, gross_g: 200, fc: 1.25, note: null }, { position: 2, ingredient_id: 'frango-i', sub_sheet_id: null, gross_g: 1500, fc: null, note: null }], { cooked_weight_g: 1200 }),
      sheet('arroz', 'Arroz', [{ position: 1, ingredient_id: 'arroz-i', sub_sheet_id: null, gross_g: 1000, fc: null, note: null }, { position: 2, ingredient_id: 'cebola', sub_sheet_id: null, gross_g: 50, fc: 1.25, note: null }], { cooked_weight_g: 2500 }),
    ],
    ingredients: [ing('cebola', 'Cebola', { price_per_kg_cents: 400 }), ing('frango-i', 'Frango inteiro'), ing('arroz-i', 'Arroz', { purchase_unit: 'pct', grams_per_unit: 5000 })],
  },
  adhesion: [{ sheet_root_id: 'frango', rate: 0.6 }],
  waste: [
    { service: 'lunch', sheet_root_id: 'arroz', produced_g: 100000, leftover_g: 4000, plate_waste_g: null, prep_waste_g: null, portions_served: 240, reason: null, notes: null, recorded_at: '' },
    { service: 'lunch', sheet_root_id: null, produced_g: null, leftover_g: null, plate_waste_g: 8000, prep_waste_g: null, portions_served: null, reason: 'taste', notes: null, recorded_at: '' },
  ],
  history: [],
};

describe('produção do dia no app (U3a)', () => {
  const inputs = sheetInputs(day.graph);
  const prep = prepList(day, inputs);

  it('porções: 300 previstos × 60% de adesão = 180; sem histórico, 100%', () => {
    expect(prep.find((p) => p.rootId === 'frango')!.portions).toBe(180);
    expect(prep.find((p) => p.rootId === 'arroz')!.portions).toBe(300);
    expect(prep.find((p) => p.rootId === 'frango')!.yieldG).toBe(21600); // 1200 g × 18
  });

  it('cebola dos dois pratos vira uma linha; quantidade na unidade de compra', () => {
    const req = dayRequisition(prep, inputs, day.graph.ingredients);
    const cebola = req.find((r) => r.id === 'cebola')!;
    expect(cebola.grossG).toBe(200 * 18 + 50 * 30);
    expect(cebola.from.sort()).toEqual(['Arroz', 'Frango']);
    const arroz = req.find((r) => r.id === 'arroz-i')!;
    expect(arroz.purchaseQty).toBe(6); // 30 kg em pacotes de 5 kg
    expect(arroz.purchaseUnit).toBe('pct');
  });

  it('indicadores do serviço: 4% de sobra e 8,3% de resto-ingesta', () => {
    const ind = serviceIndicators(day, 'lunch', prep)!;
    expect(ind.leftoverPct).toBe(4);
    expect(ind.plateWastePct).toBe(8.3);
    expect(ind.perCapitaWasteG).toBe(32);
    expect(ind.wasteCostCents).toBeGreaterThan(0);
    expect(serviceIndicators({ ...day, waste: [] }, 'lunch', prep)).toBeNull();
  });
});
