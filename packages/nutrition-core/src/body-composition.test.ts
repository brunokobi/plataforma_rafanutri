import { describe, expect, it } from 'vitest';
import { bodyComposition, bodyDensity, brozek, isakSiteValue, isakSkinfoldSums, siri } from './body-composition';
import { NutritionInputError } from './errors';

describe('Jackson & Pollock 3 dobras', () => {
  it('homem: S=50 mm, 30 anos → DC 1,064323 e 15,08% (Siri)', () => {
    const d = bodyDensity('jp3', 'male', 30, { chest: 15, abdominal: 20, thigh: 15 });
    expect(d).toBeCloseTo(1.064323, 6);
    expect(siri(d)).toBeCloseTo(15.084, 2);
  });
  it('mulher: S=60 mm, 25 anos → DC 1,044718 e 23,81% (Siri)', () => {
    const d = bodyDensity('jp3', 'female', 25, { triceps: 20, suprailiac: 15, thigh: 25 });
    expect(d).toBeCloseTo(1.0447181, 6);
    expect(siri(d)).toBeCloseTo(23.81, 1);
  });
  it('exige as dobras do protocolo', () => {
    expect(() => bodyDensity('jp3', 'male', 30, { chest: 15, abdominal: 20 })).toThrow(NutritionInputError);
  });
});

describe('Durnin & Womersley', () => {
  it('homem 25 anos, S=50 mm → DC 1,055725 e 18,87%', () => {
    const d = bodyDensity('durnin_womersley', 'male', 25, { biceps: 5, triceps: 10, subscapular: 15, suprailiac: 20 });
    expect(d).toBeCloseTo(1.0557251, 5);
    expect(siri(d)).toBeCloseTo(18.87, 1);
  });
});

describe('equações de conversão', () => {
  it('Brozek', () => expect(brozek(1.05)).toBeCloseTo(21.038, 2));
});

describe('bodyComposition', () => {
  it('calcula massa gorda e magra', () => {
    const r = bodyComposition({
      protocol: 'jp3', sex: 'male', ageYears: 30, weightKg: 80, skinfolds: { chest: 15, abdominal: 20, thigh: 15 },
    });
    expect(r.skinfoldSum).toBe(50);
    expect(r.fatMassKg).toBeCloseTo(12.067, 2);
    expect(r.leanMassKg).toBeCloseTo(67.933, 2);
  });
  it('Faulkner: %G = 0,153 × S + 5,783', () => {
    const r = bodyComposition({
      protocol: 'faulkner', sex: 'female', ageYears: 30, weightKg: 60,
      skinfolds: { triceps: 10, subscapular: 12, suprailiac: 14, abdominal: 20 },
    });
    expect(r.density).toBeNull();
    expect(r.bodyFatPct).toBeCloseTo(14.351, 3);
  });
});

describe('ISAK', () => {
  it('média de duplicata dentro de 5%', () => {
    expect(isakSiteValue([10, 10.4])).toEqual({ value: 10.2, needsThirdMeasurement: false });
  });
  it('pede terceira medida acima de 5%', () => {
    expect(isakSiteValue([10, 11])).toEqual({ value: null, needsThirdMeasurement: true });
  });
  it('mediana de triplicata', () => {
    expect(isakSiteValue([10, 11, 10.4]).value).toBe(10.4);
  });
  it('somatórios de 6 e 8 dobras', () => {
    const sums = isakSkinfoldSums({
      triceps: 10, subscapular: 12, supraspinale: 8, abdominal: 15, thigh: 14, calf: 7, biceps: 5, iliac_crest: 13,
    });
    expect(sums).toEqual({ sum6: 66, sum8: 84 });
  });
});
