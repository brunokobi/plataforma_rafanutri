import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { MonthlyPdf } from '@/components/pdf/uan-monthly';
import { monthLabel, overTarget, shiftMonth, variation, type MonthlyReport } from '@/lib/uan/network';

describe('painel da rede e relatório mensal (RN-229)', () => {
  it('meses, variação e teto', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthLabel('2026-11')).toBe('novembro de 2026');
    expect(variation(1310, 1200)).toBe(9.2);
    expect(variation(1000, null)).toBeNull();
    expect(overTarget({ cost_per_meal_cents: 1310, cost_target_cents: 1200 })).toBe(true);
    expect(overTarget({ cost_per_meal_cents: 1100, cost_target_cents: null })).toBe(false);
  });
  it('PDF do relatório mensal', async () => {
    const data: MonthlyReport = {
      organization: 'Cozinhas', unit: { id: 'u', name: 'Cozinha Central' }, technical_lead: 'Ana', month: '2026-11', from: '2026-11-01', to: '2026-11-19',
      stats: { cost_cents: 1310000, cost_estimated_missing: false, meals_planned: 1050, meals_served: 1000, cost_per_meal_cents: 1310, cost_target_cents: 1200,
        waste: { produced_g: 400000, leftover_g: 20000, plate_g: 30000, prep_g: 5000, leftover_pct: 5, plate_pct: 7.9, plate_g_per_meal: 30 },
        satisfaction: { avg: 4.3, responses: 120 }, compliance_index: 88.5, nc_open: 2, nc_overdue: 0, top_items: [{ name: 'Carne bovina', cost_cents: 400000 }] },
      previous: { month: '2026-10', cost_per_meal_cents: 1200, meals_served: 1500, compliance_index: 85, plate_pct: 9 },
      trainings: 2, non_conformities: { opened: 5, closed: 3 }, comments: [{ comment: 'Feijão ótimo', rating: 5, dish: 'Feijão' }],
    };
    const b = await renderToBuffer(createElement(MonthlyPdf, { data }) as Parameters<typeof renderToBuffer>[0]);
    expect(b.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);
});
