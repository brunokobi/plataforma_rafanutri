import { describe, expect, it } from 'vitest';
import { formatNutrient, TACO_GROUPS, toDetail } from '@/lib/foods/taco-data';

describe('consulta à TACO (RN-010)', () => {
  it('15 grupos', () => expect(TACO_GROUPS).toHaveLength(15));
  it('formata traço, não analisado e casas pela grandeza', () => {
    expect(formatNutrient({ amount: 0, trace: true })).toBe('Tr');
    expect(formatNutrient({ amount: null, trace: false })).toBe('NA');
    expect(formatNutrient({ amount: 128.456, trace: false })).toBe('128');
    expect(formatNutrient({ amount: 12.345, trace: false })).toBe('12,3');
    expect(formatNutrient({ amount: 1.2345, trace: false })).toBe('1,23');
    expect(formatNutrient({ amount: 76, trace: false }, 0.5)).toBe('38');
  });
  it('ficha: nutrientes na ordem da tabela, medidas válidas', () => {
    const d = toDetail({
      id: 561, name: 'Feijão, carioca, cozido', food_group: 'Leguminosas e derivados', source_code: '561',
      household_measures: [{ label: 'concha média', grams: 86 }, { label: '', grams: 10 }],
      source_id: { name: 'TACO', version: '4ª', citation: null },
      nutrients: [
        { amount_per_100g: '4.8', is_trace: false, nutrient_id: { code: 'protein_g', name: 'Proteína', unit: 'g', position: 20 } },
        { amount_per_100g: '76', is_trace: false, nutrient_id: { code: 'energy_kcal', name: 'Energia', unit: 'kcal', position: 10 } },
        { amount_per_100g: null, is_trace: false, nutrient_id: null },
      ],
    });
    expect(d.nutrients.map((n) => n.code)).toEqual(['energy_kcal', 'protein_g']);
    expect(d.householdMeasures).toEqual([{ label: 'concha média', grams: 86 }]);
    expect(d.id).toBe('561');
  });
});
