import { describe, expect, it } from 'vitest';
import { computeNeeds, draftOrders, receivingLimit, temperatureRejects, type NeedsData } from '@/lib/uan/purchasing';

const sheet = (id: string, items: NeedsData['graph']['sheets'][number]['items'], p: Partial<NeedsData['graph']['sheets'][number]> = {}) => ({
  id, organization_id: 'o', root_id: id, parent_id: null, version: 1, name: id, category: 'side' as const, servings: 10, cooked_weight_g: null, cooking_index: null,
  prep_minutes: null, equipment: null, notes: null, status: 'approved' as const, computed: null, approved_at: null, updated_at: null, items, ...p,
});

describe('compras (U4b)', () => {
  const data: NeedsData = {
    unit: { id: 'u', name: 'U' }, from: '2026-11-16', to: '2026-11-17',
    days: [
      { day: '2026-11-16', items: [{ service: 'lunch', slot: 'side', sheet_root_id: 'arroz', sheet_id: 'arroz', name: 'Arroz' }] },
      { day: '2026-11-17', items: [{ service: 'lunch', slot: 'side', sheet_root_id: 'arroz', sheet_id: 'arroz', name: 'Arroz' }] },
    ],
    diners: [{ day: '2026-11-16', service: 'lunch', planned: 100 }, { day: '2026-11-17', service: 'lunch', planned: 50 }],
    graph: {
      sheets: [sheet('arroz', [{ position: 1, ingredient_id: 'arroz-i', sub_sheet_id: null, gross_g: 600, fc: null, note: null }], { cooking_index: 2.5 })],
      ingredients: [{ id: 'arroz-i', name: 'Arroz', default_fc: 1, allergens: [], food_name: null, per100g: null, price_per_kg_cents: 549, purchase_unit: 'pct', grams_per_unit: 5000 }],
    },
    adhesion: [],
    stock: [{ ingredient_id: 'arroz-i', quantity_g: 2000 }],
    open_orders: [],
    preferred: [{ ingredient_id: 'arroz-i', supplier_id: 's1', supplier_name: 'Atacado', price_cents: 2745 }],
    suppliers: [{ id: 's1', name: 'Atacado' }],
  };

  it('necessidade do período: 150 porções × 60 g de arroz cru = 9 kg − 2 kg em estoque = 7 kg = 2 pacotes de 5 kg', () => {
    const [l] = computeNeeds(data, 0);
    expect([l!.needG, l!.stockG, l!.toBuyG, l!.toBuyUnits, l!.supplierName]).toEqual([9000, 2000, 7000, 2, 'Atacado']);
  });

  it('pedidos em rascunho por fornecedor, só com o que falta', () => {
    const orders = draftOrders(computeNeeds(data, 0));
    expect(orders).toEqual([{ supplier_id: 's1', supplierName: 'Atacado', items: [{ ingredient_id: 'arroz-i', quantity_units: 2 }] }]);
    expect(draftOrders(computeNeeds({ ...data, stock: [{ ingredient_id: 'arroz-i', quantity_g: 20000 }] }, 0))).toEqual([]);
  });

  it('carne refrigerada a 9 °C é recusada no recebimento', () => {
    expect(receivingLimit('chilled')).toBe(7);
    expect(temperatureRejects('chilled', 9)).toBe(true);
    expect(temperatureRejects('chilled', 5)).toBe(false);
    expect(temperatureRejects('frozen', -8)).toBe(true);
    expect(temperatureRejects('ambient', 30)).toBe(false);
  });
});
