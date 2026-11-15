import { describe, expect, it } from 'vitest';
import { EQUIPMENT_DEFAULT_LIMITS, equipmentStatus, FOOD_STAGE_LIMITS, limitsLabel, outOfRange, parseTemp, temperatureChart } from '@/lib/uan/temperatures';

describe('temperaturas (RN-151)', () => {
  it('limites padrão iguais aos do banco (RDC 216/2004)', () => {
    expect(EQUIPMENT_DEFAULT_LIMITS.refrigerator).toEqual({ min_temp: null, max_temp: 5 });
    expect(EQUIPMENT_DEFAULT_LIMITS.freezer).toEqual({ min_temp: null, max_temp: -18 });
    expect(EQUIPMENT_DEFAULT_LIMITS.hot_holding).toEqual({ min_temp: 60, max_temp: null });
    expect(FOOD_STAGE_LIMITS.cooking).toEqual({ min_temp: 70, max_temp: null });
    expect(FOOD_STAGE_LIMITS.cooling).toEqual({ min_temp: null, max_temp: 10 });
  });

  it('fora do limite', () => {
    expect(outOfRange(7, EQUIPMENT_DEFAULT_LIMITS.refrigerator)).toBe(true);
    expect(outOfRange(5, EQUIPMENT_DEFAULT_LIMITS.refrigerator)).toBe(false);
    expect(outOfRange(-10, EQUIPMENT_DEFAULT_LIMITS.freezer)).toBe(true);
    expect(outOfRange(-20, EQUIPMENT_DEFAULT_LIMITS.freezer)).toBe(false);
    expect(outOfRange(55, FOOD_STAGE_LIMITS.holding_hot)).toBe(true);
    expect(outOfRange(3, { min_temp: 0, max_temp: 4 })).toBe(false);
    expect(outOfRange(-1, { min_temp: 0, max_temp: 4 })).toBe(true);
  });

  it('lê temperaturas digitadas no celular', () => {
    expect(parseTemp('4,5')).toBe(4.5);
    expect(parseTemp('-18')).toBe(-18);
    expect(parseTemp('−18')).toBe(-18);
    expect(parseTemp(' 72 ')).toBe(72);
    expect(parseTemp('4,55')).toBeNull();
    expect(parseTemp('abc')).toBeNull();
    expect(parseTemp('')).toBeNull();
    expect(parseTemp('400')).toBeNull();
  });

  it('rótulos dos limites', () => {
    expect(limitsLabel({ min_temp: null, max_temp: 5 })).toBe('até 5 °C');
    expect(limitsLabel({ min_temp: 60, max_temp: null })).toBe('a partir de 60 °C');
    expect(limitsLabel({ min_temp: 0, max_temp: 4.5 })).toBe('de 0 °C a 4,5 °C');
  });

  it('situação do equipamento', () => {
    const last = { value: 4, out_of_range: false, recorded_at: '2026-11-15T10:00:00Z' };
    expect(equipmentStatus({ active: false, last, overdue: false })).toBe('inactive');
    expect(equipmentStatus({ active: true, last: null, overdue: true })).toBe('never');
    expect(equipmentStatus({ active: true, last: { ...last, out_of_range: true }, overdue: true })).toBe('out');
    expect(equipmentStatus({ active: true, last, overdue: true })).toBe('overdue');
    expect(equipmentStatus({ active: true, last, overdue: false })).toBe('ok');
  });

  it('gráfico: ordem do tempo, faixa do limite visível e pontos fora marcados', () => {
    const g = temperatureChart(
      [
        { value: 7, recorded_at: '2026-11-15T12:00:00Z', out_of_range: true },
        { value: 3, recorded_at: '2026-11-15T08:00:00Z', out_of_range: false },
      ],
      { min_temp: null, max_temp: 5 },
    )!;
    expect(g.points.map((p) => p.value)).toEqual([3, 7]);
    expect(g.points[0]!.x).toBeLessThan(g.points[1]!.x);
    expect(g.points[1]!.out).toBe(true);
    expect(g.limits).toHaveLength(1);
    const max = g.limits[0]!;
    expect(max.y).toBeGreaterThan(g.points[1]!.y); // 7 acima da linha de 5
    expect(max.y).toBeLessThan(g.points[0]!.y); // 3 abaixo
    expect(g.path.startsWith('M')).toBe(true);
    expect(temperatureChart([], { min_temp: null, max_temp: 5 })).toBeNull();
  });
});
