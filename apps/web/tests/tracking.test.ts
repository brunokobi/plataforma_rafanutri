import { describe, expect, it } from 'vitest';
import { barsGeometry, trendGeometry } from '@/lib/tracking/chart';
import { bmiPosition, daysSince, fromLocalDateTime, goalProgress, localDateTimeValue, mealAdherence, toTarget, weightChange, weightSeries } from '@/lib/tracking/types';

describe('acompanhamento em casa', () => {
  it('série do peso junta casa (último do dia) e consultório em ordem', () => {
    const s = weightSeries({ weight: {
      logs: [
        { id: '1', weight_kg: 80, measured_at: '2026-11-01T10:00:00Z', note: null, by_patient: true },
        { id: '2', weight_kg: 79.5, measured_at: '2026-11-01T22:00:00Z', note: null, by_patient: true },
        { id: '3', weight_kg: 78, measured_at: '2026-11-20T10:00:00Z', note: null, by_patient: true },
      ],
      clinic: [{ date: '2026-11-10', weight_kg: 79 }],
      target_kg: 75,
    } });
    expect(s.map((p) => [p.day, p.kg, p.source])).toEqual([['2026-11-01', 79.5, 'patient'], ['2026-11-10', 79, 'clinic'], ['2026-11-20', 78, 'patient']]);
    expect(weightChange(s)).toEqual({ kg: -1.5, since: '2026-11-01' });
    expect(weightChange(s.slice(0, 1))).toBeNull();
  });

  it('metas, adesão, alvo e régua do IMC', () => {
    expect(goalProgress({ frequency: 'daily', times_per_week: null, done_week: 5 })).toEqual({ done: 5, of: 7, pct: 71 });
    expect(goalProgress({ frequency: 'weekly', times_per_week: 3, done_week: 4 })).toEqual({ done: 3, of: 3, pct: 100 });
    expect(mealAdherence([{ done: 4, total: 5 }, { done: 6, total: 5 }])).toBe(90);
    expect(mealAdherence([])).toBeNull();
    expect(toTarget(80.24, 75)).toBe(5.2);
    expect(toTarget(null, 75)).toBeNull();
    expect(bmiPosition(15)).toBe(0);
    expect(bmiPosition(27.5)).toBe(0.5);
    expect(bmiPosition(50)).toBe(1);
  });

  it('data e hora local de São Paulo', () => {
    expect(localDateTimeValue(new Date('2026-11-28T10:30:00Z'))).toBe('2026-11-28T07:30');
    expect(fromLocalDateTime('2026-11-28T07:30')).toBe('2026-11-28T10:30:00.000Z');
    expect(fromLocalDateTime('ontem')).toBeNull();
    expect(daysSince('2026-11-20T12:00:00Z', new Date('2026-11-28T13:00:00Z'))).toBe(8);
    expect(daysSince(null)).toBeNull();
  });

  it('geometria dos gráficos', () => {
    const g = trendGeometry([{ day: '2026-11-01', kg: 80, source: 'patient' }, { day: '2026-11-21', kg: 78, source: 'patient' }], 75)!;
    expect(g.home).toHaveLength(2);
    expect(g.home[0]!.x).toBeLessThan(g.home[1]!.x);
    expect(g.home[0]!.y).toBeLessThan(g.home[1]!.y);
    expect(g.targetY).toBeGreaterThan(g.home[1]!.y);
    expect(trendGeometry([], null)).toBeNull();
    const b = barsGeometry([{ day: '2026-11-27', ml: 2000 }, { day: '2026-11-28', ml: 500 }], 2000);
    expect(b.bars.map((x) => x.hit)).toEqual([true, false]);
    expect(b.bars[0]!.h).toBeGreaterThan(b.bars[1]!.h);
  });
});
