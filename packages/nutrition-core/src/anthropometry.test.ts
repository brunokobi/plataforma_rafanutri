import { describe, expect, it } from 'vitest';
import {
  adjustedWeight, bmi, classifyBmi, waistHeightRatio, waistHipRatio, waistRisk, weightChangePct, weightForBmi,
} from './anthropometry';
import { NutritionInputError } from './errors';

describe('IMC', () => {
  it('calcula peso / altura²', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.857, 3);
  });
  it('rejeita valores implausíveis', () => {
    expect(() => bmi(0, 175)).toThrow(NutritionInputError);
    expect(() => bmi(70, 10)).toThrow(NutritionInputError);
  });
  it('classifica adultos pela OMS', () => {
    expect(classifyBmi(18.4, 30)).toBe('underweight');
    expect(classifyBmi(24.99, 30)).toBe('normal');
    expect(classifyBmi(25, 30)).toBe('overweight');
    expect(classifyBmi(30, 30)).toBe('obesity_1');
    expect(classifyBmi(35, 30)).toBe('obesity_2');
    expect(classifyBmi(40, 30)).toBe('obesity_3');
  });
  it('classifica idosos por Lipschitz', () => {
    expect(classifyBmi(21.9, 65)).toBe('underweight');
    expect(classifyBmi(27, 65)).toBe('normal');
    expect(classifyBmi(27.1, 65)).toBe('overweight');
  });
});

describe('circunferências', () => {
  it('risco pela cintura (OMS)', () => {
    expect(waistRisk(93.9, 'male')).toBe('low');
    expect(waistRisk(94, 'male')).toBe('increased');
    expect(waistRisk(102, 'male')).toBe('substantially_increased');
    expect(waistRisk(79.9, 'female')).toBe('low');
    expect(waistRisk(80, 'female')).toBe('increased');
    expect(waistRisk(88, 'female')).toBe('substantially_increased');
  });
  it('relações cintura/quadril e cintura/estatura', () => {
    expect(waistHipRatio(80, 100)).toBeCloseTo(0.8, 5);
    expect(waistHeightRatio(85, 170)).toBeCloseTo(0.5, 5);
  });
});

describe('pesos de referência', () => {
  it('peso para IMC alvo', () => expect(weightForBmi(25, 180)).toBeCloseTo(81, 5));
  it('peso ajustado com fator 0,25', () => expect(adjustedWeight(100, 70)).toBeCloseTo(77.5, 5));
  it('percentual de perda de peso', () => expect(weightChangePct(80, 72)).toBeCloseTo(10, 5));
});
