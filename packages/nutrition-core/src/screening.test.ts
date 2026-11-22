import { describe, expect, it } from 'vitest';
import { must, mustSteps, nrs2002, nrsNeedsFinal, sga, sgaSuggestion, weightLossPercent } from './screening';

describe('NRS-2002', () => {
  const base = { bmiBelow20_5: false, weightLoss3m: false, reducedIntakeLastWeek: false, severelyIll: false, ageYears: 50 };
  it('sem "sim" na triagem inicial: sem risco, reavaliar semanalmente', () => {
    expect(nrsNeedsFinal(base)).toBe(false);
    expect(nrs2002.validate(base)).toEqual({});
    expect(nrs2002.evaluate(base)).toMatchObject({ score: null, risk: 'low', classification: 'no_risk_initial' });
  });
  it('critério de aceite: 72 anos, estado 1 e gravidade 1 = 3, em risco', () => {
    const a = { ...base, weightLoss3m: true, ageYears: 72, nutritionalStatus: 1 as const, diseaseSeverity: 1 as const };
    expect(nrs2002.evaluate(a)).toMatchObject({ score: 3, classification: 'at_risk', risk: 'high' });
  });
  it('abaixo de 3 sem risco; triagem final exige as duas notas; só adultos', () => {
    const a = { ...base, severelyIll: true, nutritionalStatus: 1 as const, diseaseSeverity: 1 as const };
    expect(nrs2002.evaluate(a)).toMatchObject({ score: 2, classification: 'not_at_risk' });
    expect(Object.keys(nrs2002.validate({ ...base, severelyIll: true }))).toEqual(['nutritionalStatus', 'diseaseSeverity']);
    expect(nrs2002.validate({ ...base, ageYears: 15 }).ageYears).toBeTruthy();
  });
});

describe('MUST', () => {
  it('critério de aceite: IMC 19 e perda de 7% = 2, risco alto', () => {
    expect(must.evaluate({ bmi: 19, weightLossPct: 7, acuteDiseaseNoIntake: false })).toMatchObject({ score: 2, risk: 'high' });
  });
  it('limites de cada passo', () => {
    expect(mustSteps({ bmi: 20.1, weightLossPct: 4.9, acuteDiseaseNoIntake: false })).toEqual({ bmi: 0, loss: 0, acute: 0 });
    expect(mustSteps({ bmi: 20, weightLossPct: 5, acuteDiseaseNoIntake: false })).toEqual({ bmi: 1, loss: 1, acute: 0 });
    expect(mustSteps({ bmi: 18.5, weightLossPct: 10, acuteDiseaseNoIntake: true })).toEqual({ bmi: 1, loss: 1, acute: 2 });
    expect(mustSteps({ bmi: 18.4, weightLossPct: 10.1, acuteDiseaseNoIntake: false })).toEqual({ bmi: 2, loss: 2, acute: 0 });
  });
  it('total 0 baixo, 1 médio; obesidade registrada', () => {
    expect(must.evaluate({ bmi: 32, weightLossPct: 0, acuteDiseaseNoIntake: false })).toMatchObject({ score: 0, risk: 'low' });
    expect(must.evaluate({ bmi: 32, weightLossPct: 0, acuteDiseaseNoIntake: false }).conduct).toMatch(/obesidade/);
    expect(must.evaluate({ bmi: 22, weightLossPct: 6, acuteDiseaseNoIntake: false })).toMatchObject({ score: 1, risk: 'medium' });
    expect(must.validate({ bmi: Number.NaN, weightLossPct: 0, acuteDiseaseNoIntake: false }).bmi).toBeTruthy();
  });
});

describe('ASG', () => {
  const ok = { weightLossPct: 0, recentTrend: 'stable' as const, intake: 'normal' as const, giSymptoms: false, functional: 'full' as const, diseaseStress: 'none' as const, fatLoss: 0 as const, muscleWasting: 0 as const, edema: 0 as const, ascites: 0 as const };
  it('sugestão A, B e C', () => {
    expect(sgaSuggestion(ok)).toBe('A');
    expect(sgaSuggestion({ ...ok, weightLossPct: 7, intake: 'suboptimal_solid' })).toBe('B');
    expect(sgaSuggestion({ ...ok, weightLossPct: 12, muscleWasting: 3, fatLoss: 2, intake: 'liquid_only' })).toBe('C');
    // Perda de peso que já está se recuperando não conta
    expect(sgaSuggestion({ ...ok, weightLossPct: 7, recentTrend: 'gain' })).toBe('A');
  });
  it('a classe é a do profissional', () => {
    expect(sga.evaluate({ ...ok, finalClass: 'B' })).toMatchObject({ classification: 'B', risk: 'medium' });
    expect(sga.validate({ ...ok, finalClass: 'X' as 'A' }).finalClass).toBeTruthy();
  });
});

it('perda de peso em %', () => {
  expect(weightLossPercent(80, 74)).toBe(7.5);
  expect(weightLossPercent(70, 72)).toBe(0);
  expect(weightLossPercent(0, 72)).toBe(0);
});
