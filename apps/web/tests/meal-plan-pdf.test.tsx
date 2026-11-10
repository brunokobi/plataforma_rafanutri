// @vitest-environment node
import { renderToBuffer } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import { MealPlanDocument } from '@/components/pdf/meal-plan-document';
import { DEMO_PLAN } from '@/lib/demo/foods';
import { demoGuidelines, demoPractice } from '@/lib/demo/practice';
import { buildMealPlanPdfData } from '@/lib/pdf/meal-plan-data';

const base = {
  practice: demoPractice,
  patient: { name: 'Marina Costa', objective: 'Emagrecimento' },
  guidelines: demoGuidelines,
  issuedAt: new Date('2026-11-10T12:00:00'),
};

describe('dados do PDF', () => {
  it('quantitativo com calorias traz gramas, kcal e totais', () => {
    const d = buildMealPlanPdfData(DEMO_PLAN, { ...base, mode: 'quantitative', showKcal: true });
    expect(d.issuedAt).toBe('10/11/2026');
    expect(d.validUntil).toBe('10/12/2026');
    expect(d.totals?.energy).toBeGreaterThan(1000);
    expect(d.meals[1]?.items[0]).toMatchObject({ name: 'Arroz branco, cozido', grams: 150, measure: '6 colheres de sopa' });
  });
  it('qualitativo nunca mostra números', () => {
    const d = buildMealPlanPdfData(DEMO_PLAN, { ...base, mode: 'qualitative', showKcal: true });
    expect(d.showKcal).toBe(false);
    expect(d.totals).toBeNull();
    expect(d.meals.every((m) => m.items.every((i) => i.grams === 0 && i.measure === ''))).toBe(true);
  });
  it('lista as substituições escolhidas', () => {
    const meals = DEMO_PLAN.map((m) => ({ ...m, items: m.items.map((i) => (i.foodId === 'arroz' ? { ...i, subs: [{ foodId: 'macarrao', quantityG: 120 }] } : i)) }));
    const d = buildMealPlanPdfData(meals, { ...base, mode: 'quantitative', showKcal: false });
    expect(d.meals[1]?.items[0]?.substitutions).toEqual(['2,5 pegadores de macarrão, cozido']);
  });
});

describe('MealPlanDocument', () => {
  it('gera um PDF válido', async () => {
    const data = buildMealPlanPdfData(DEMO_PLAN, { ...base, mode: 'quantitative', showKcal: true });
    const buf = await renderToBuffer(<MealPlanDocument data={data} />);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(2000);
  }, 20_000);
});
