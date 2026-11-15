import { describe, expect, it } from 'vitest';
import { buildInputs, calculate, notAnalyzed, scaleItems, sheetAllergens, type IngredientInfo, type SheetGraph } from '@/lib/uan/techsheets';

const ing = (id: string, name: string, p: Partial<IngredientInfo> = {}): IngredientInfo => ({ id, name, default_fc: 1, allergens: [], food_name: null, per100g: null, price_per_kg_cents: null, ...p });
const sheet = (id: string, name: string, items: SheetGraph['sheets'][number]['items'], p: Partial<SheetGraph['sheets'][number]> = {}): SheetGraph['sheets'][number] => ({
  id, organization_id: 'o', root_id: id, parent_id: null, version: 1, name, category: 'main', servings: 10, cooked_weight_g: null, cooking_index: null,
  prep_minutes: null, equipment: null, notes: null, status: 'draft', computed: null, approved_at: null, updated_at: null, items, ...p,
});

describe('fichas técnicas no app (U2b)', () => {
  const molho = sheet('molho', 'Molho branco', [{ position: 1, ingredient_id: 'leite', sub_sheet_id: null, gross_g: 1000, fc: null, note: null }], { cooked_weight_g: 800, servings: 4 });
  const prato = sheet('prato', 'Lasanha', [
    { position: 1, ingredient_id: 'massa', sub_sheet_id: null, gross_g: 500, fc: null, note: null },
    { position: 2, ingredient_id: null, sub_sheet_id: 'molho', gross_g: 400, fc: null, note: null },
  ]);
  const graph: SheetGraph = {
    sheets: [prato, molho],
    ingredients: [
      ing('leite', 'Leite', { allergens: ['milk', 'lactose'], price_per_kg_cents: 600, per100g: { energy_kcal: 60 } }),
      ing('massa', 'Massa', { allergens: ['gluten', 'eggs'], price_per_kg_cents: 1200, per100g: { energy_kcal: 370 } }),
    ],
  };

  it('monta a entrada do cálculo com sub-receita (FC do insumo quando a ficha não informa)', () => {
    const r = calculate('prato', buildInputs('prato', graph, []))!;
    expect(r.costCents).toBe(600 + 300); // massa 600 + metade do molho (600)
    expect(r.totals.energy_kcal).toBeCloseTo(1850 + 300);
  });

  it('a edição em tela substitui a ficha salva no cálculo', () => {
    const r = calculate('prato', buildInputs('prato', graph, [], {
      servings: '5', cooked_weight_g: '', cooking_index: '',
      items: [{ ingredient_id: 'massa', sub_sheet_id: null, gross: '1000', fc: '', note: '' }, { ingredient_id: null, sub_sheet_id: null, gross: '', fc: '', note: '' }],
    }))!;
    expect(r.costCents).toBe(1200);
    expect(r.costPerServingCents).toBe(240);
  });

  it('alergênicos propagados das sub-receitas', () => {
    expect(sheetAllergens('prato', graph, []).sort()).toEqual(['eggs', 'gluten', 'lactose', 'milk']);
    expect(sheetAllergens('prato', graph, [], [{ ingredient_id: 'massa', sub_sheet_id: null, gross: '1', fc: '', note: '' }]).sort()).toEqual(['eggs', 'gluten']);
  });

  it('escalar de 10 para 250 porções multiplica os pesos por 25', () => {
    const out = scaleItems([{ ingredient_id: 'a', sub_sheet_id: null, gross: '1000', fc: '', note: '' }, { ingredient_id: 'b', sub_sheet_id: null, gross: '12,5', fc: '', note: '' }], 25);
    expect(out.map((i) => i.gross)).toEqual(['25000', '312,5']);
  });

  it('avisa quando a base não analisou energia ou macronutrientes (NA)', () => {
    const list = [ing('a', 'Leite', { per100g: { energy_kcal: null, protein_g: null } }), ing('b', 'Massa', { per100g: { energy_kcal: 370, protein_g: 10, carbohydrate_g: 75, lipid_g: 1 } }), ing('c', 'Sal')];
    expect(notAnalyzed(['a', 'b', 'c', null], list)).toEqual(['Leite']);
  });
});
