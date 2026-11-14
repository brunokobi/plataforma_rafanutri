import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { MealPlanDocument } from '@/components/pdf/meal-plan-document';
import { patientPdfFileName, patientPlanPdfData } from '@/lib/patient-area/plan-pdf';
import type { PatientPlanPayload } from '@/lib/patient-area/types';

const payload: PatientPlanPayload = {
  patient_id: '00000000-0000-4000-8000-000000000001',
  document: { practice_name: 'Consultório Teste', brand_color: '#336699', professional_name: 'Rafa Nutri', crn: '123', crn_region: 'CRN-9', contact: 'rafa@example.com', patient_name: 'Ana Souza', objective: 'Saúde' },
  plan: {
    id: 'p1', title: 'Plano', mode: 'quantitative', status: 'archived', published_at: '2026-11-10T15:00:00Z', valid_until: '2026-12-10', guidelines: 'Beba água.',
    meals: [{ id: 'almoco', name: 'Almoço', time: '12:30', items: [
      { foodId: '1', quantityG: 100, subs: [{ foodId: '2', quantityG: 140 }, { foodId: '999', quantityG: 1 }] },
      { foodId: '999', quantityG: 30, subs: [] },
    ] }],
  },
  foods: { '1': { name: 'Arroz, integral, cozido', household_measures: [{ label: 'colher de sopa', grams: 25 }] }, '2': { name: 'Batata, inglesa, cozida', household_measures: [] } },
  recipes: {},
};

describe('RN-209 — PDF do plano para o paciente', () => {
  it('monta os dados sem kcal, com cabeçalho do consultório e validade do plano', () => {
    const d = patientPlanPdfData(payload);
    expect(d.showKcal).toBe(false);
    expect(d.totals).toBeNull();
    expect(d.practice.practiceName).toBe('Consultório Teste');
    expect(d.patient.name).toBe('Ana Souza');
    expect(d.issuedAt).toBe('10/11/2026');
    expect(d.validUntil).toBe('10/12/2026');
    expect(d.meals[0]!.items).toHaveLength(1);
    expect(d.meals[0]!.items[0]!.measure).toBe('4 colheres de sopa');
    expect(d.meals[0]!.items[0]!.substitutions).toEqual(['140 g de batata, inglesa, cozida']);
    expect(d.guidelines).toEqual(['Beba água.']);
  });

  it('gera um PDF válido no servidor', async () => {
    const buf = await renderToBuffer(createElement(MealPlanDocument, { data: patientPlanPdfData(payload) }) as Parameters<typeof renderToBuffer>[0]);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 30_000);

  it('nome do arquivo com a data de publicação em Brasília', () => {
    expect(patientPdfFileName('2026-11-15T01:00:00Z')).toBe('plano-alimentar-2026-11-14.pdf');
  });
});
