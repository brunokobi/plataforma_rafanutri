import { describe, expect, it } from 'vitest';
import { ageInDays, growthAlerts, growthCurveValue, growthIndicators, lmsZ, zToPercentile } from './growth';

describe('crescimento (OMS)', () => {
  it('menino ao nascer: mediana 3,3 kg = escore-z 0; 2,5 kg ≈ -2 e 4,4 kg ≈ +2 (tabela da OMS)', () => {
    const at = (w: number) => growthIndicators({ sex: 'male', ageDays: 0, weightKg: w }).find((r) => r.indicator === 'wfa')!;
    expect(at(3.3464).z).toBeCloseTo(0, 2);
    expect(at(2.5).z).toBeCloseTo(-2, 0);
    expect(at(4.4).z).toBeCloseTo(2, 0);
    expect(at(2.3).classification).toBe('Baixo peso para a idade');
  });

  it('linhas da curva voltam o escore-z de onde saíram', () => {
    for (const [age, z] of [[100, -2], [900, 1], [3000, 2.5]] as const) {
      const w = growthCurveValue('wfa', 'female', age, z)!;
      expect(growthIndicators({ sex: 'female', ageDays: age, weightKg: w })[0]!.z).toBeCloseTo(z, 1);
    }
  });

  it('ajuste da OMS acima de +3 (indicador de peso)', () => {
    const lms: [number, number, number] = [-0.35, 10, 0.12];
    const sd = (k: number) => 10 * (1 + -0.35 * 0.12 * k) ** (1 / -0.35);
    expect(lmsZ(sd(3) + (sd(3) - sd(2)), lms, true)).toBeCloseTo(4, 5);
    expect(lmsZ(sd(-3) - (sd(-2) - sd(-3)), lms, true)).toBeCloseTo(-4, 5);
  });

  it('criança até 5 anos: quatro indicadores e correção deitado/em pé', () => {
    const r = growthIndicators({ sex: 'female', ageDays: 400, weightKg: 9.5, heightCm: 76, headCm: 45 });
    expect(r.map((x) => x.indicator).sort()).toEqual(['bfa', 'hcfa', 'hfa', 'wfa', 'wfh']);
    const lying = growthIndicators({ sex: 'female', ageDays: 400, heightCm: 76 })[0]!.value;
    const standing = growthIndicators({ sex: 'female', ageDays: 400, heightCm: 76, measuredLying: false })[0]!.value;
    expect(standing - lying).toBeCloseTo(0.7, 5);
  });

  it('adolescente: IMC e estatura pela referência 2007; sem peso para idade depois dos 10 anos', () => {
    const days = ageInDays('2012-01-01', '2026-01-01');
    const r = growthIndicators({ sex: 'male', ageDays: days, weightKg: 75, heightCm: 165 });
    expect(r.map((x) => x.indicator).sort()).toEqual(['bfa', 'hfa']);
    expect(r.find((x) => x.indicator === 'bfa')!.classification).toMatch(/Obesidade|Sobrepeso/);
  });

  it('percentil', () => {
    expect(zToPercentile(0)).toBeCloseTo(50, 3);
    expect(zToPercentile(-2)).toBeCloseTo(2.28, 1);
  });

  it('alertas: fora da faixa e cruzamento de linhas', () => {
    const p = (date: string, z: number) => ({ date, results: [{ indicator: 'wfa' as const, label: 'Peso para a idade', value: 1, z, percentile: 50, classification: z < -2 ? 'Baixo peso para a idade' : 'Peso adequado para a idade', level: z < -2 ? ('alert' as const) : ('ok' as const) }] });
    const a = growthAlerts([p('2026-01-01', 0.5), p('2026-04-01', -0.8)]);
    expect(a).toHaveLength(1);
    expect(a[0]!.message).toMatch(/queda/);
    expect(growthAlerts([p('2026-01-01', -2.5)])[0]!.level).toBe('alert');
  });
});
