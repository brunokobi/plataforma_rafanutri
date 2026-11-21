import { describe, expect, it } from 'vitest';
import { assessGestationalGain, classifyPrePregnancyBmi, dueDate, gainBand, gestationalWeeks, recommendedGain } from './pregnancy';

describe('ganho de peso gestacional (curvas brasileiras)', () => {
  it('faixas nos pontos da tabela', () => {
    expect(recommendedGain('normal', 40)).toEqual({ min: 8, max: 12 });
    expect(recommendedGain('underweight', 27)).toEqual({ min: 5.6, max: 7.2 });
    expect(recommendedGain('obesity', 13)).toEqual({ min: -1.6, max: -0.05 });
    expect(recommendedGain('overweight', 42)).toEqual({ min: 7, max: 9 });
    expect(recommendedGain('normal', 20)).toEqual({ min: 0.65, max: 3.5 });
  });
  it('classificação e avaliação', () => {
    expect(classifyPrePregnancyBmi(24.9)).toBe('normal');
    expect(classifyPrePregnancyBmi(30)).toBe('obesity');
    const a = assessGestationalGain({ cls: 'normal', prePregnancyKg: 60, currentKg: 68, weeks: 27 });
    expect(a.gainKg).toBe(8);
    expect(a.status).toBe('above');
    expect(assessGestationalGain({ cls: 'normal', prePregnancyKg: 60, currentKg: 64, weeks: 27 }).status).toBe('adequate');
  });
  it('idade gestacional e DPP', () => {
    expect(gestationalWeeks('2026-01-01', '2026-01-15')).toBe(2);
    expect(dueDate('2026-01-01')).toBe('2026-10-08');
    expect(gainBand('normal')).toHaveLength(41);
  });
});
