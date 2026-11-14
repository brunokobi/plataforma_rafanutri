import { describe, expect, it } from 'vitest';
import { amountText, buildPatientPlanView } from '@/lib/patient-area/plan-view';
import type { PatientPlanPayload } from '@/lib/patient-area/types';

const payload = (mode: 'quantitative' | 'qualitative'): PatientPlanPayload => ({
  patient_id: '00000000-0000-4000-8000-000000000001',
  plan: {
    id: 'p1', title: 'Plano de novembro', mode, published_at: '2026-11-10T15:00:00Z', valid_until: '2026-12-10',
    guidelines: 'Beba água.\n\n  Evite frituras.  ',
    meals: [
      { id: 'almoco', name: 'Almoço', time: '12:30', items: [
        { foodId: '1', quantityG: 100, subs: [{ foodId: '2', quantityG: 140 }, { foodId: '999', quantityG: 50 }] },
        { foodId: '999', quantityG: 30, subs: [] },
        { foodId: '3', quantityG: 200, subs: [] },
      ] },
    ],
  },
  foods: {
    '1': { name: 'Arroz, integral, cozido', household_measures: [{ label: 'colher de sopa', grams: 25 }] },
    '2': { name: 'Batata, inglesa, cozida', household_measures: [] },
    '3': { name: 'Escondidinho da casa', household_measures: [] },
  },
  recipes: { '3': { yield_g: 800, servings: 4, instructions: 'Asse por 20 min.', items: [{ name: 'Mandioca', quantityG: 500 }] } },
});

describe('RN-205 — plano na área do paciente', () => {
  it('formata quantidade com medida caseira e gramas', () => {
    expect(amountText(100, [{ label: 'colher de sopa', grams: 25 }])).toBe('4 colheres de sopa (100 g)');
    expect(amountText(140, [])).toBe('140 g');
    expect(amountText(0, [])).toBe('');
  });

  it('monta refeições, substituições, orientações e preparações; ignora alimento não resolvido', () => {
    const v = buildPatientPlanView(payload('quantitative'));
    const items = v.meals[0]!.items;
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ name: 'Arroz, integral, cozido', amount: '4 colheres de sopa (100 g)', substitutions: ['Batata, inglesa, cozida — 140 g'] });
    expect(v.guidelines).toEqual(['Beba água.', 'Evite frituras.']);
    expect(v.recipes).toHaveLength(1);
    expect(v.recipes[0]!.name).toBe('Escondidinho da casa');
    expect(v.recipes[0]!.ingredients).toEqual(['500 g de mandioca']);
  });

  it('plano qualitativo não mostra quantidades', () => {
    const v = buildPatientPlanView(payload('qualitative'));
    expect(v.meals[0]!.items[0]).toEqual({ name: 'Arroz, integral, cozido', amount: '', substitutions: ['Batata, inglesa, cozida'] });
  });
});
