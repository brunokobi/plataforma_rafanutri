import { assertRange } from './errors';

/** IMC = peso (kg) / altura (m)². */
export function bmi(weightKg: number, heightCm: number): number {
  assertRange('weightKg', weightKg, 1, 400);
  assertRange('heightCm', heightCm, 30, 250);
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export type BmiClass =
  | 'underweight'
  | 'normal'
  | 'overweight'
  | 'obesity_1'
  | 'obesity_2'
  | 'obesity_3';

/**
 * Classificação do IMC.
 * Adultos (< 60 anos): OMS (2000). Idosos (>= 60 anos): Lipschitz (1994).
 * Crianças e adolescentes usam curvas da OMS (Fase 4) e não são tratados aqui.
 */
export function classifyBmi(value: number, ageYears: number): BmiClass {
  assertRange('ageYears', ageYears, 18, 130);
  if (ageYears >= 60) {
    if (value < 22) return 'underweight';
    if (value <= 27) return 'normal';
    return 'overweight';
  }
  if (value < 18.5) return 'underweight';
  if (value < 25) return 'normal';
  if (value < 30) return 'overweight';
  if (value < 35) return 'obesity_1';
  if (value < 40) return 'obesity_2';
  return 'obesity_3';
}

export type WaistRisk = 'low' | 'increased' | 'substantially_increased';

/** Risco metabólico pela circunferência da cintura (OMS, 2000). */
export function waistRisk(waistCm: number, sex: 'female' | 'male'): WaistRisk {
  assertRange('waistCm', waistCm, 30, 250);
  const [increased, substantially] = sex === 'male' ? [94, 102] : [80, 88];
  if (waistCm >= substantially) return 'substantially_increased';
  if (waistCm >= increased) return 'increased';
  return 'low';
}

export function waistHipRatio(waistCm: number, hipCm: number): number {
  assertRange('waistCm', waistCm, 30, 250);
  assertRange('hipCm', hipCm, 30, 250);
  return waistCm / hipCm;
}

/** Relação cintura/estatura; alerta a partir de 0,5. */
export function waistHeightRatio(waistCm: number, heightCm: number): number {
  assertRange('waistCm', waistCm, 30, 250);
  assertRange('heightCm', heightCm, 30, 250);
  return waistCm / heightCm;
}

/** Peso de referência para um IMC alvo: IMC × altura (m)². */
export function weightForBmi(targetBmi: number, heightCm: number): number {
  assertRange('targetBmi', targetBmi, 10, 60);
  assertRange('heightCm', heightCm, 30, 250);
  const m = heightCm / 100;
  return targetBmi * m * m;
}

/**
 * Peso ajustado = (peso atual − peso ideal) × fator + peso ideal.
 * Fator padrão 0,25 (prática clínica; A VALIDAR com a nutricionista responsável).
 */
export function adjustedWeight(currentKg: number, idealKg: number, factor = 0.25): number {
  assertRange('currentKg', currentKg, 1, 400);
  assertRange('idealKg', idealKg, 1, 400);
  assertRange('factor', factor, 0, 1);
  return (currentKg - idealKg) * factor + idealKg;
}

/** Percentual de perda (positivo) ou ganho (negativo) de peso em relação ao habitual. */
export function weightChangePct(usualKg: number, currentKg: number): number {
  assertRange('usualKg', usualKg, 1, 400);
  assertRange('currentKg', currentKg, 1, 400);
  return ((usualKg - currentKg) / usualKg) * 100;
}
