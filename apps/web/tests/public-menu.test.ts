import { describe, expect, it } from 'vitest';
import { answersComplete, groupByService, longDate, type PublicDish } from '@/lib/uan/public-menu';

const dish = (service: PublicDish['service'], slot: PublicDish['slot'], name: string): PublicDish => ({ service, slot, sheet_root_id: name, name, allergens: [], nutrients: { energy_kcal: null, protein_g: null, carbohydrate_g: null, lipid_g: null, fiber_g: null, sodium_mg: null } });

describe('cardápio público (RN-223)', () => {
  it('agrupa por serviço na ordem do dia', () => {
    const g = groupByService([dish('lunch', 'main', 'Frango'), dish('lunch', 'side', 'Arroz'), dish('dinner', 'main', 'Sopa')]);
    expect(g.map((x) => [x.service, x.items.length])).toEqual([['lunch', 2], ['dinner', 1]]);
  });
  it('respostas completas por tipo de pergunta', () => {
    const qs = [{ text: 'Nota', kind: 'stars' as const }, { text: 'De novo?', kind: 'yes_no' as const }];
    expect(answersComplete(qs, [5, true])).toBe(true);
    expect(answersComplete(qs, [6, true])).toBe(false);
    expect(answersComplete(qs, [4, null])).toBe(false);
    expect(answersComplete(qs, [4])).toBe(false);
  });
  it('data por extenso', () => {
    expect(longDate('2026-11-18')).toBe('quarta-feira, 18 de novembro');
  });
});
