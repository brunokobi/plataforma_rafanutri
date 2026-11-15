import { describe, expect, it } from 'vitest';
import { costPanel, type CostsData } from '@/lib/uan/costs';

const sheet = (id: string, items: CostsData['graph']['sheets'][number]['items']) => ({
  id, organization_id: 'o', root_id: id, parent_id: null, version: 1, name: id, category: 'main' as const, servings: 10, cooked_weight_g: null, cooking_index: null,
  prep_minutes: null, equipment: null, notes: null, status: 'approved' as const, computed: null, approved_at: null, updated_at: null, items,
});

describe('painel de custos (U5)', () => {
  const data: CostsData = {
    unit: { id: 'u', name: 'U' }, from: '2026-11-16', to: '2026-11-16',
    days: [{ day: '2026-11-16', items: [{ service: 'lunch', slot: 'main', sheet_root_id: 'prato', sheet_id: 'prato', name: 'Prato' }] }],
    diners: [{ day: '2026-11-16', service: 'lunch', planned: 100, actual: 100 }],
    graph: {
      sheets: [sheet('prato', [
        { position: 1, ingredient_id: 'carne', sub_sheet_id: null, gross_g: 1000, fc: null, note: null }, // 100 g/porção a R$ 80/kg = R$ 8,00
        { position: 2, ingredient_id: 'arroz', sub_sheet_id: null, gross_g: 1000, fc: null, note: null }, // 100 g/porção a R$ 40/kg = R$ 4,00
      ])],
      ingredients: [
        { id: 'carne', name: 'Carne', default_fc: 1, allergens: [], food_name: null, per100g: null, price_per_kg_cents: 8000, purchase_unit: 'kg', grams_per_unit: 1000 },
        { id: 'arroz', name: 'Arroz', default_fc: 1, allergens: [], food_name: null, per100g: null, price_per_kg_cents: 4000, purchase_unit: 'kg', grams_per_unit: 1000 },
      ],
    },
    adhesion: [], stock: [], open_orders: [], preferred: [], suppliers: [],
    consumption: [
      { day: '2026-11-16', ingredient_id: 'carne', name: 'Carne', supplier_id: 's1', supplier_name: 'Frigorífico', grams: 11000, cost_cents: 88000, estimated: false, missing_cost: false },
      { day: '2026-11-16', ingredient_id: 'arroz', name: 'Arroz', supplier_id: 's2', supplier_name: 'Atacado', grams: 10750, cost_cents: 43000, estimated: true, missing_cost: false },
    ],
    criterion: 'x',
  };

  it('planejado R$ 12,00 × realizado R$ 13,10 por refeição: +9,2%, e a carne explica a maior parte', () => {
    const p = costPanel(data);
    expect([p.plannedPerCapita, p.actualPerCapita, p.deviation]).toEqual([1200, 1310, 9.2]);
    expect(p.top.map((t) => [t.name, t.diffCents])).toEqual([['Carne', 8000], ['Arroz', 3000]]);
    expect(p.abc.map((a) => [a.name, a.abc])).toEqual([['Carne', 'A'], ['Arroz', 'A']]);
    expect(p.abcSuppliers[0]!.name).toBe('Frigorífico');
    expect(p.estimatedLines).toBe(1);
  });
});
