import { describe, expect, it } from 'vitest';
import { patientPlanPdfData } from '@/lib/patient-area/plan-pdf';
import { buildPatientPlanView } from '@/lib/patient-area/plan-view';
import type { PatientPlanPayload, ShareSettings } from '@/lib/patient-area/types';
import { weightChartGeometry } from '@/lib/patient-area/weight-chart';

const payload = (share: ShareSettings): PatientPlanPayload => ({
  patient_id: '00000000-0000-4000-8000-000000000001',
  share,
  plan: {
    id: 'p1', title: 'Plano', mode: 'quantitative', published_at: '2026-11-10T15:00:00Z', valid_until: null, guidelines: null,
    meals: [
      { id: 'cafe', name: 'Café', time: '07:30', items: [{ foodId: '1', quantityG: 200, subs: [] }] },
      { id: 'almoco', name: 'Almoço', time: '12:30', items: [{ foodId: '2', quantityG: 100, subs: [] }] },
    ],
  },
  foods: {
    '1': { name: 'Iogurte', household_measures: [], per100g: { energy_kcal: 60, protein_g: 4, carbohydrate_g: 5, lipid_g: 3 } },
    '2': { name: 'Arroz', household_measures: [], per100g: { energy_kcal: 130, protein_g: 2.5, carbohydrate_g: 28, lipid_g: 0.2 } },
  },
  recipes: {},
});
const off = { show_kcal: false, show_macros: false, show_weight_history: false };

describe('RN-210 — o que o paciente vê', () => {
  it('tudo desligado: sem totais e sem kcal por refeição', () => {
    const v = buildPatientPlanView(payload(off));
    expect(v.totals).toBeNull();
    expect(v.meals.map((m) => m.kcal)).toEqual([null, null]);
  });

  it('só calorias: kcal do dia e por refeição, sem macros', () => {
    const v = buildPatientPlanView(payload({ ...off, show_kcal: true }));
    expect(v.totals).toEqual({ energy: 250, protein: null, carbohydrate: null, lipid: null });
    expect(v.meals.map((m) => m.kcal)).toEqual([120, 130]);
  });

  it('só macros: sem kcal', () => {
    const v = buildPatientPlanView(payload({ ...off, show_macros: true }));
    expect(v.totals).toEqual({ energy: null, protein: 11, carbohydrate: 38, lipid: 6 });
    expect(v.meals[0]!.kcal).toBeNull();
  });

  it('PDF segue as mesmas escolhas', () => {
    expect(patientPlanPdfData(payload(off)).totals).toBeNull();
    expect(patientPlanPdfData(payload({ ...off, show_kcal: true })).totals).toEqual({ energy: 250, protein: null, carbohydrate: null, lipid: null });
    expect(patientPlanPdfData(payload({ ...off, show_kcal: true, show_macros: true })).totals).toEqual({ energy: 250, protein: 11, carbohydrate: 38, lipid: 6 });
  });

  it('gráfico de peso: ordem por data, último ponto à direita, um ponto no meio', () => {
    const g = weightChartGeometry([{ date: '2026-11-10', weight_kg: 78.5 }, { date: '2026-10-01', weight_kg: 80 }])!;
    expect(g.points.map((p) => p.date)).toEqual(['2026-10-01', '2026-11-10']);
    expect(g.points[1]!.x).toBeGreaterThan(g.points[0]!.x);
    expect(g.points[1]!.y).toBeGreaterThan(g.points[0]!.y); // peso menor fica mais embaixo
    expect(g.path.startsWith('M')).toBe(true);
    const one = weightChartGeometry([{ date: '2026-11-10', weight_kg: 70 }])!;
    expect(one.points[0]!.x).toBeCloseTo(36 + (320 - 36 - 44) / 2);
    expect(weightChartGeometry([])).toBeNull();
  });
});
