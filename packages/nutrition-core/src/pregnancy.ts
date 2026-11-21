import { assertRange } from './errors';

/**
 * Ganho de peso gestacional pelas curvas brasileiras (Kac et al., 2021; Carrilho et al., 2022), adotadas pelo
 * Ministério da Saúde em 2022 e pela Febrasgo (Rev Bras Ginecol Obstet 2023;45(2):104–108, Chart 1).
 * Faixas acumuladas recomendadas até 13, 27 e 40 semanas por IMC pré-gestacional; entre esses pontos o app
 * interpola linearmente a partir de zero na concepção. Vale para adultas com gestação única de baixo risco.
 * A validar pela RT antes do uso clínico.
 */

export type PrePregnancyBmiClass = 'underweight' | 'normal' | 'overweight' | 'obesity';

export const PRE_PREGNANCY_LABEL: Record<PrePregnancyBmiClass, string> = {
  underweight: 'Baixo peso',
  normal: 'Eutrofia',
  overweight: 'Sobrepeso',
  obesity: 'Obesidade',
};

/** [semana, mínimo, máximo] em kg, acumulado desde o peso pré-gestacional. */
const RANGES: Record<PrePregnancyBmiClass, Array<[number, number, number]>> = {
  underweight: [[0, 0, 0], [13, 0.2, 1.2], [27, 5.6, 7.2], [40, 9.7, 12.2]],
  normal: [[0, 0, 0], [13, -1.8, 0.7], [27, 3.1, 6.3], [40, 8.0, 12.0]],
  overweight: [[0, 0, 0], [13, -1.6, -0.05], [27, 2.3, 3.7], [40, 7.0, 9.0]],
  obesity: [[0, 0, 0], [13, -1.6, -0.05], [27, 1.1, 2.7], [40, 5.0, 7.2]],
};

export function classifyPrePregnancyBmi(bmiValue: number): PrePregnancyBmiClass {
  assertRange('bmi', bmiValue, 10, 80);
  if (bmiValue < 18.5) return 'underweight';
  if (bmiValue < 25) return 'normal';
  if (bmiValue < 30) return 'overweight';
  return 'obesity';
}

/** Semanas de gestação (decimal) pela data da última menstruação. */
export function gestationalWeeks(lmpDate: string, onDate: string): number {
  return (Date.parse(`${onDate}T12:00:00Z`) - Date.parse(`${lmpDate}T12:00:00Z`)) / (7 * 864e5);
}

/** Data provável do parto (regra de Naegele: DUM + 280 dias), AAAA-MM-DD. */
export function dueDate(lmpDate: string): string {
  return new Date(Date.parse(`${lmpDate}T12:00:00Z`) + 280 * 864e5).toISOString().slice(0, 10);
}

/** Faixa recomendada de ganho acumulado (kg) na semana. Depois de 40 semanas vale a faixa de 40. */
export function recommendedGain(cls: PrePregnancyBmiClass, weeks: number): { min: number; max: number } {
  assertRange('weeks', weeks, 0, 44);
  const pts = RANGES[cls];
  const w = Math.min(weeks, 40);
  for (let i = 1; i < pts.length; i += 1) {
    const [w1, a1, b1] = pts[i]!;
    const [w0, a0, b0] = pts[i - 1]!;
    if (w <= w1) {
      const f = (w - w0) / (w1 - w0);
      return { min: round2(a0 + (a1 - a0) * f), max: round2(b0 + (b1 - b0) * f) };
    }
  }
  const [, a, b] = pts.at(-1)!;
  return { min: a, max: b };
}

export type GainStatus = 'below' | 'adequate' | 'above';

export const GAIN_STATUS_LABEL: Record<GainStatus, string> = { below: 'Abaixo do recomendado', adequate: 'Dentro do recomendado', above: 'Acima do recomendado' };

export interface GainAssessment {
  weeks: number;
  gainKg: number;
  range: { min: number; max: number };
  status: GainStatus;
}

export function assessGestationalGain(input: { cls: PrePregnancyBmiClass; prePregnancyKg: number; currentKg: number; weeks: number }): GainAssessment {
  assertRange('prePregnancyKg', input.prePregnancyKg, 25, 250);
  assertRange('currentKg', input.currentKg, 25, 260);
  const gainKg = round2(input.currentKg - input.prePregnancyKg);
  const range = recommendedGain(input.cls, input.weeks);
  const status: GainStatus = gainKg < range.min ? 'below' : gainKg > range.max ? 'above' : 'adequate';
  return { weeks: Math.round(input.weeks * 10) / 10, gainKg, range, status };
}

/** Pontos da faixa recomendada para o gráfico (semana 0 a 40). */
export function gainBand(cls: PrePregnancyBmiClass): Array<{ week: number; min: number; max: number }> {
  return Array.from({ length: 41 }, (_, week) => ({ week, ...recommendedGain(cls, week) }));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
