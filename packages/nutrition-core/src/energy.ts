import { assertRange, NutritionInputError } from './errors';
import type { Sex } from './types';

export type EnergyFormula = 'harris_benedict_1919' | 'mifflin_st_jeor' | 'cunningham' | 'fao_who_1985';

export interface EnergyInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  /** Massa livre de gordura; obrigatória para Cunningham. */
  leanMassKg?: number;
}

function validate({ weightKg, heightCm, ageYears }: EnergyInput) {
  assertRange('weightKg', weightKg, 20, 400);
  assertRange('heightCm', heightCm, 100, 250);
  assertRange('ageYears', ageYears, 18, 120);
}

/** Harris & Benedict (1919). */
export function harrisBenedict(i: EnergyInput): number {
  validate(i);
  return i.sex === 'male'
    ? 66.47 + 13.75 * i.weightKg + 5.003 * i.heightCm - 6.755 * i.ageYears
    : 655.1 + 9.563 * i.weightKg + 1.85 * i.heightCm - 4.676 * i.ageYears;
}

/** Mifflin-St Jeor (1990). */
export function mifflinStJeor(i: EnergyInput): number {
  validate(i);
  const base = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.ageYears;
  return i.sex === 'male' ? base + 5 : base - 161;
}

/** Cunningham (1980): 500 + 22 × massa livre de gordura. */
export function cunningham(i: EnergyInput): number {
  validate(i);
  if (i.leanMassKg === undefined) {
    throw new NutritionInputError('MISSING_FIELD', 'leanMassKg', 'Cunningham exige a massa livre de gordura');
  }
  assertRange('leanMassKg', i.leanMassKg, 10, i.weightKg);
  return 500 + 22 * i.leanMassKg;
}

/** FAO/OMS (1985), adultos, por faixa etária. */
export function faoWho1985(i: EnergyInput): number {
  validate(i);
  const p = i.weightKg;
  if (i.sex === 'male') {
    if (i.ageYears < 30) return 15.3 * p + 679;
    if (i.ageYears <= 60) return 11.6 * p + 879;
    return 13.5 * p + 487;
  }
  if (i.ageYears < 30) return 14.7 * p + 496;
  if (i.ageYears <= 60) return 8.7 * p + 829;
  return 10.5 * p + 596;
}

export const ENERGY_FORMULAS: Record<EnergyFormula, (i: EnergyInput) => number> = {
  harris_benedict_1919: harrisBenedict,
  mifflin_st_jeor: mifflinStJeor,
  cunningham,
  fao_who_1985: faoWho1985,
};

/** Calcula todas as fórmulas aplicáveis (as que exigem dado ausente ficam como null). */
export function compareEnergyFormulas(i: EnergyInput): Record<EnergyFormula, number | null> {
  const out = {} as Record<EnergyFormula, number | null>;
  for (const [key, fn] of Object.entries(ENERGY_FORMULAS) as [EnergyFormula, (x: EnergyInput) => number][]) {
    try {
      out[key] = fn(i);
    } catch (e) {
      if (e instanceof NutritionInputError && e.code === 'MISSING_FIELD') out[key] = null;
      else throw e;
    }
  }
  return out;
}

/** GET = GER × fator de atividade. */
export function totalEnergyExpenditure(restingKcal: number, activityFactor: number): number {
  assertRange('restingKcal', restingKcal, 300, 6000);
  assertRange('activityFactor', activityFactor, 1, 2.5);
  return restingKcal * activityFactor;
}
