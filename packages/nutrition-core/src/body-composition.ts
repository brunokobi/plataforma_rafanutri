import { assertRange, NutritionInputError } from './errors';
import type { Sex } from './types';

export type SkinfoldSite =
  | 'triceps'
  | 'biceps'
  | 'subscapular'
  | 'suprailiac' // Jackson & Pollock / Durnin & Womersley / Faulkner
  | 'iliac_crest' // ISAK
  | 'supraspinale' // ISAK
  | 'abdominal'
  | 'chest'
  | 'midaxillary'
  | 'thigh'
  | 'calf';

/** Dobras cutâneas em milímetros. */
export type Skinfolds = Partial<Record<SkinfoldSite, number>>;

export type SkinfoldProtocol = 'jp3' | 'jp7' | 'durnin_womersley' | 'faulkner';
export type DensityEquation = 'siri' | 'brozek';

export const PROTOCOL_SITES: Record<SkinfoldProtocol, Record<Sex, SkinfoldSite[]>> = {
  jp3: { male: ['chest', 'abdominal', 'thigh'], female: ['triceps', 'suprailiac', 'thigh'] },
  jp7: {
    male: ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'thigh'],
    female: ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdominal', 'suprailiac', 'thigh'],
  },
  durnin_womersley: {
    male: ['biceps', 'triceps', 'subscapular', 'suprailiac'],
    female: ['biceps', 'triceps', 'subscapular', 'suprailiac'],
  },
  faulkner: {
    male: ['triceps', 'subscapular', 'suprailiac', 'abdominal'],
    female: ['triceps', 'subscapular', 'suprailiac', 'abdominal'],
  },
};

export function sumSkinfolds(skinfolds: Skinfolds, sites: readonly SkinfoldSite[]): number {
  return sites.reduce((acc, site) => {
    const v = skinfolds[site];
    if (v === undefined) {
      throw new NutritionInputError('MISSING_FIELD', site, `Dobra obrigatória ausente: ${site}`);
    }
    assertRange(site, v, 1, 80);
    return acc + v;
  }, 0);
}

/**
 * Coeficientes de Durnin & Womersley (1974): DC = c − m · log10(soma de 4 dobras).
 * A VALIDAR: conferir com a tabela original antes do uso clínico.
 */
const DURNIN_COEFFICIENTS: Record<Sex, Array<{ minAge: number; c: number; m: number }>> = {
  male: [
    { minAge: 50, c: 1.1715, m: 0.0779 },
    { minAge: 40, c: 1.162, m: 0.07 },
    { minAge: 30, c: 1.1422, m: 0.0544 },
    { minAge: 20, c: 1.1631, m: 0.0632 },
    { minAge: 17, c: 1.162, m: 0.063 },
  ],
  female: [
    { minAge: 50, c: 1.1339, m: 0.0645 },
    { minAge: 40, c: 1.1333, m: 0.0612 },
    { minAge: 30, c: 1.1423, m: 0.0632 },
    { minAge: 20, c: 1.1599, m: 0.0717 },
    { minAge: 16, c: 1.1549, m: 0.0678 },
  ],
};

/** Densidade corporal (g/cm³) pelos protocolos de Jackson & Pollock ou Durnin & Womersley. */
export function bodyDensity(
  protocol: Exclude<SkinfoldProtocol, 'faulkner'>,
  sex: Sex,
  ageYears: number,
  skinfolds: Skinfolds,
): number {
  assertRange('ageYears', ageYears, 16, 100);
  const s = sumSkinfolds(skinfolds, PROTOCOL_SITES[protocol][sex]);

  if (protocol === 'jp3') {
    // Homens: Jackson & Pollock (1978). Mulheres: Jackson, Pollock & Ward (1980).
    return sex === 'male'
      ? 1.10938 - 0.0008267 * s + 0.0000016 * s * s - 0.0002574 * ageYears
      : 1.0994921 - 0.0009929 * s + 0.0000023 * s * s - 0.0001392 * ageYears;
  }
  if (protocol === 'jp7') {
    return sex === 'male'
      ? 1.112 - 0.00043499 * s + 0.00000055 * s * s - 0.00028826 * ageYears
      : 1.097 - 0.00046971 * s + 0.00000056 * s * s - 0.00012828 * ageYears;
  }
  const band = DURNIN_COEFFICIENTS[sex].find((b) => ageYears >= b.minAge);
  if (!band) {
    throw new NutritionInputError('UNSUPPORTED_AGE', 'ageYears', 'Durnin & Womersley não cobre esta idade');
  }
  return band.c - band.m * Math.log10(s);
}

/** Siri (1961): %G = (4,95 / DC − 4,50) × 100. */
export function siri(density: number): number {
  assertRange('density', density, 0.9, 1.2);
  return (4.95 / density - 4.5) * 100;
}

/** Brozek (1963): %G = (4,57 / DC − 4,142) × 100. */
export function brozek(density: number): number {
  assertRange('density', density, 0.9, 1.2);
  return (4.57 / density - 4.142) * 100;
}

export interface BodyCompositionInput {
  protocol: SkinfoldProtocol;
  sex: Sex;
  ageYears: number;
  weightKg: number;
  skinfolds: Skinfolds;
  densityEquation?: DensityEquation;
}

export interface BodyCompositionResult {
  skinfoldSum: number;
  density: number | null;
  bodyFatPct: number;
  fatMassKg: number;
  leanMassKg: number;
}

export function bodyComposition(input: BodyCompositionInput): BodyCompositionResult {
  const { protocol, sex, ageYears, weightKg, skinfolds, densityEquation = 'siri' } = input;
  assertRange('weightKg', weightKg, 1, 400);
  const skinfoldSum = sumSkinfolds(skinfolds, PROTOCOL_SITES[protocol][sex]);

  let density: number | null = null;
  let bodyFatPct: number;
  if (protocol === 'faulkner') {
    // Faulkner (1968): %G = 0,153 × soma + 5,783
    bodyFatPct = 0.153 * skinfoldSum + 5.783;
  } else {
    density = bodyDensity(protocol, sex, ageYears, skinfolds);
    bodyFatPct = densityEquation === 'siri' ? siri(density) : brozek(density);
  }

  const fatMassKg = (weightKg * bodyFatPct) / 100;
  return { skinfoldSum, density, bodyFatPct, fatMassKg, leanMassKg: weightKg - fatMassKg };
}

// ---------------------------------------------------------------------------
// ISAK (perfil restrito)
// ---------------------------------------------------------------------------

export const ISAK_SUM6_SITES: SkinfoldSite[] = ['triceps', 'subscapular', 'supraspinale', 'abdominal', 'thigh', 'calf'];
export const ISAK_SUM8_SITES: SkinfoldSite[] = [...ISAK_SUM6_SITES, 'biceps', 'iliac_crest'];

export interface IsakSiteResult {
  /** Valor final do ponto, ou null se ainda faltar a terceira medida. */
  value: number | null;
  needsThirdMeasurement: boolean;
}

/**
 * Valor de um ponto anatômico pelo procedimento ISAK:
 * duas medidas → média, se a diferença for de até 5% (senão, exige a terceira);
 * três medidas → mediana.
 */
export function isakSiteValue(measurements: readonly number[], tolerancePct = 5): IsakSiteResult {
  measurements.forEach((m, i) => assertRange(`measurement[${i}]`, m, 1, 80));
  if (measurements.length === 2) {
    const [a, b] = measurements as [number, number];
    const diffPct = (Math.abs(a - b) / Math.min(a, b)) * 100;
    if (diffPct > tolerancePct) return { value: null, needsThirdMeasurement: true };
    return { value: (a + b) / 2, needsThirdMeasurement: false };
  }
  if (measurements.length === 3) {
    const sorted = [...measurements].sort((x, y) => x - y);
    return { value: sorted[1]!, needsThirdMeasurement: false };
  }
  throw new NutritionInputError('INVALID_INPUT', 'measurements', 'Informe 2 ou 3 medidas por ponto');
}

export function isakSkinfoldSums(skinfolds: Skinfolds): { sum6: number; sum8: number } {
  return {
    sum6: sumSkinfolds(skinfolds, ISAK_SUM6_SITES),
    sum8: sumSkinfolds(skinfolds, ISAK_SUM8_SITES),
  };
}
