import { describe, expect, it } from 'vitest';
import { allergenStatement, frontWarnings, nutritionTable, roundDeclared } from './labeling';

describe('rotulagem (RN-162 a RN-164)', () => {
  it('%VD de proteínas: 12 g na porção = 24%', () => {
    const t = nutritionTable({ protein_g: 20 }, 60);
    const p = t.rows.find((r) => r.key === 'protein_g')!;
    expect(p.perPortion).toBe(12);
    expect(p.vdPct).toBe(24);
    expect(t.missing).toContain('trans_fat_g');
  });
  it('quantidade não significativa vira zero; arredondamento', () => {
    const t = nutritionTable({ energy_kcal: 5, trans_fat_g: 0.1, sodium_mg: 7.4, lipid_g: 12.34, carbohydrate_g: 3.45 }, 50);
    expect(t.rows.find((r) => r.key === 'energy_kcal')).toMatchObject({ per100: 0, perPortion: 0, vdPct: 0 }); // 2,5 kcal na porção
    expect(t.rows.find((r) => r.key === 'trans_fat_g')).toMatchObject({ perPortion: 0, vdPct: null });
    expect(t.rows.find((r) => r.key === 'sodium_mg')).toMatchObject({ perPortion: 0 }); // 3,7 mg
    expect(t.rows.find((r) => r.key === 'lipid_g')).toMatchObject({ per100: 12, perPortion: 6.2, vdPct: 9 });
    expect(roundDeclared('carbohydrate_g', 9.96)).toBe(10);
    expect(roundDeclared('sodium_mg', 599.6)).toBe(600);
  });
  it('lupa: limite exato entra', () => {
    expect(frontWarnings({ sodium_mg: 700 }, 'solid')).toEqual(['sodium']);
    expect(frontWarnings({ sodium_mg: 600, added_sugar_g: 14.9, saturated_fat_g: 6 }, 'solid')).toEqual(['saturated_fat', 'sodium']);
    expect(frontWarnings({ added_sugar_g: 7.5, sodium_mg: 299 }, 'liquid')).toEqual(['added_sugar']);
    expect(frontWarnings({}, 'liquid')).toEqual([]);
  });
  it('declaração de alergênicos: leite e trigo', () => {
    expect(allergenStatement(['milk', 'gluten'])).toBe('ALÉRGICOS: CONTÉM LEITE E DERIVADOS E TRIGO (CEREAIS COM GLÚTEN). CONTÉM GLÚTEN. CONTÉM LACTOSE.');
    expect(allergenStatement([])).toBe('NÃO CONTÉM GLÚTEN.');
    expect(allergenStatement(['eggs', 'soy', 'peanut'])).toBe('ALÉRGICOS: CONTÉM AMENDOIM, OVOS E SOJA. NÃO CONTÉM GLÚTEN.');
  });
});
