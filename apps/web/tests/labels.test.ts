import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { LabelPdf } from '@/components/pdf/uan-label';
import { buildLabel, labelPer100, labelSvg, wrapText, type LabelRecord } from '@/lib/uan/labels';

describe('rótulo nutricional no app', () => {
  const per100 = labelPer100({ energy_kcal: 350, carbohydrate_g: 50, added_sugar_g: 20, protein_g: 20, lipid_g: 8, saturated_fat_g: 3, fiber_g: 1.2, sodium_mg: 700 }, { total_sugar_g: 25, trans_fat_g: 0 });
  it('valores da ficha + informados; lupa e %VD', () => {
    const b = buildLabel(per100, 60, 'solid');
    expect(b.problems).toEqual([]);
    expect(b.values.perPortion.protein_g).toBe(12);
    expect(b.values.vd.protein_g).toBe(24);
    expect(b.warnings).toEqual(['added_sugar', 'sodium']);
  });
  it('inconsistências e faltas impedem a emissão', () => {
    expect(buildLabel({ ...per100, total_sugar_g: 10 }, 60, 'solid').problems).toContain('Açúcares totais não podem ser menores que os adicionados.');
    expect(buildLabel(labelPer100({ energy_kcal: 100 }, { total_sugar_g: null, trans_fat_g: 0 }), 60, 'solid').problems[0]).toMatch(/^Sem valor: .*Açúcares totais/);
  });
  it('SVG com tabela, lupa e alergênicos (texto escapado)', () => {
    const b = buildLabel(per100, 60, 'solid');
    const svg = labelSvg({ product_name: 'Bolo <de> chocolate', physical_state: 'solid', portion_g: 60, household_measure: '1 fatia', servings_per_pack: 8, values: b.values, front_warnings: b.warnings, allergen_statement: 'ALÉRGICOS: CONTÉM LEITE E DERIVADOS E TRIGO. CONTÉM GLÚTEN. CONTÉM LACTOSE.' });
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('INFORMAÇÃO NUTRICIONAL');
    expect(svg).toContain('ALTO EM');
    expect(svg).toContain('AÇÚCAR ADICIONADO');
    expect(svg).toContain('Porção: 60 g (1 fatia)');
    expect(svg).toContain('Porções por embalagem: 8');
    expect(svg).toContain('>24<'); // %VD de proteínas
    expect(svg).toContain('LEITE E DERIVADOS');
    expect(wrapText('a b c d', 3)).toEqual(['a b', 'c d']);
  });
  it('PDF do rótulo', async () => {
    const b = buildLabel(per100, 60, 'solid');
    const label: LabelRecord = { id: 'l', sheet_id: 's', sheet_root_id: 's', sheet_version: 2, product_name: 'Bolo', physical_state: 'solid', portion_g: 60, household_measure: '1 fatia', servings_per_pack: null, values: b.values, front_warnings: b.warnings, allergens: ['milk'], allergen_statement: 'ALÉRGICOS: CONTÉM LEITE.', layout: 'vertical', archived: false, created_at: '2026-11-18T12:00:00Z' };
    const buf = await renderToBuffer(createElement(LabelPdf, { label }) as Parameters<typeof renderToBuffer>[0]);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);
});
