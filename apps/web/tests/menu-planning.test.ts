import { describe, expect, it } from 'vitest';
import { cycleWarnings, dayAdequacy, ruleText } from '@/lib/uan/menu-planning';
import { prepList, sheetInputs, type ProductionDay } from '@/lib/uan/production';
import type { MenuItem, MenuPlanning } from '@/lib/uan/menus';

const item = (day: number, slot: MenuItem['slot'], name: string, extra: Partial<MenuItem> = {}): MenuItem => ({ day_index: day, service: 'lunch', slot, sheet_root_id: name, sheet_id: `${name}-v1`, name, category: slot === 'main' ? 'main' : 'side', cost_cents: 400, nutrients: { energy_kcal: 300, carbohydrate_g: 40, protein_g: 20, lipid_g: 8 }, ...extra });

describe('perfis e regras no cardápio (RN-221)', () => {
  const planning: MenuPlanning = {
    profile: { id: 'p', name: 'PAT', segment: 'pat', stage: null, targets: { energy_kcal: { min: 600, max: 800 } }, validated: false, reference: null },
    autonomy: 'free',
    rules: [
      { id: 'r1', kind: 'vetoed_ingredient', ingredient_id: 'fig', ingredient_name: 'Fígado', sheet_category: null, slot: null, service: null, max_count: null, cost_cents: null, note: null },
      { id: 'r2', kind: 'required_daily', ingredient_id: null, ingredient_name: null, sheet_category: null, slot: 'salad', service: 'lunch', max_count: null, cost_cents: null, note: null },
    ],
    ingredients: { 'Bife-v1': ['fig'] },
    profiles: [],
  };
  it('adequação do dia: soma dos pratos contra as metas', () => {
    const items = [item(1, 'main', 'Frango'), item(1, 'side', 'Arroz')];
    expect(dayAdequacy(items, 'lunch', 1, planning.profile!.targets)[0]).toMatchObject({ key: 'energy_kcal', value: 600, status: 'ok' });
    expect(dayAdequacy(items.slice(0, 1), 'lunch', 1, planning.profile!.targets)[0]!.status).toBe('low');
    expect(dayAdequacy(items, 'lunch', 2, planning.profile!.targets)).toEqual([]);
  });
  it('avisos das regras com os nomes da tela', () => {
    const w = cycleWarnings([item(1, 'main', 'Bife'), item(1, 'salad', 'Alface'), item(2, 'main', 'Frango')], planning, { length_days: 7, services: ['lunch'] });
    expect(w.map((x) => x.message)).toEqual(['Bife leva Fígado, vetado no contrato.', 'Falta salada, obrigatório todo dia.']);
    expect(ruleText(planning.rules[1]!)).toBe('Salada todo dia no almoço');
    expect(ruleText({ kind: 'cost_ceiling', cost_cents: 1250, ingredient_name: null, sheet_category: null, slot: null, service: null, max_count: null })).toBe('Teto de R$ 12,50 por refeição');
  });
});

describe('ajuste local de per capita (RN-221)', () => {
  it('multiplica o rendimento da preparação pelo fator da unidade', () => {
    const sheet = { id: 's1', organization_id: 'o', root_id: 'r1', parent_id: null, version: 1, name: 'Arroz', category: 'side' as const, servings: 10, cooked_weight_g: 2000, cooking_index: null, prep_minutes: null, equipment: null, notes: null, status: 'approved' as const, computed: null, approved_at: null, updated_at: null, items: [{ position: 1, ingredient_id: 'i1', sub_sheet_id: null, gross_g: 1000, fc: 1, note: null }] };
    const day: ProductionDay = {
      unit: { id: 'u', name: 'U' }, day: '2026-11-18', can_plan: true, can_record: true, can_see_cost: true,
      diners: [{ service: 'lunch', planned: 10, actual: null }],
      menu: [{ service: 'lunch', slot: 'side', sheet_root_id: 'r1', sheet_id: 's1', name: 'Arroz', cycle_name: 'C' }],
      graph: { sheets: [sheet], ingredients: [{ id: 'i1', name: 'Arroz cru', default_fc: 1, allergens: [], food_name: null, per100g: null, price_per_kg_cents: 500, purchase_unit: 'kg', grams_per_unit: 1000 }] },
      adhesion: [], adjustments: [{ sheet_root_id: 'r1', portion_factor: 1.5 }], waste: [], history: [],
    };
    const p = prepList(day, sheetInputs(day.graph));
    expect(p[0]).toMatchObject({ portions: 10, factor: 1.5, yieldG: 3000 });
  });
});
