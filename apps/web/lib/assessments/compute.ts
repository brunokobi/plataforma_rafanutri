import {
  CALC_VERSION,
  ISAK_SUM8_SITES,
  NutritionInputError,
  PROTOCOL_SITES,
  bmi,
  bodyComposition,
  classifyBmi,
  isakSkinfoldSums,
  waistHeightRatio,
  waistHipRatio,
  waistRisk,
  type DensityEquation,
  type Sex,
  type SkinfoldProtocol,
  type SkinfoldSite,
  type Skinfolds,
} from '@rafanutri/nutrition-core';

export type Protocol = SkinfoldProtocol | 'isak';
export { CALC_VERSION };

export interface AssessmentInput {
  assessed_at: string; // AAAA-MM-DD
  weight_kg: number | null;
  height_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  protocol: Protocol | null;
  density_equation: DensityEquation;
  skinfolds: Skinfolds;
  notes?: string | null;
}

export interface AssessmentResults {
  bmi?: number;
  bmi_class?: ReturnType<typeof classifyBmi>;
  body_fat_pct?: number;
  fat_mass_kg?: number;
  lean_mass_kg?: number;
  density?: number | null;
  skinfold_sum?: number;
  sum6?: number;
  sum8?: number;
  whr?: number;
  whtr?: number;
  waist_risk?: ReturnType<typeof waistRisk>;
}

export interface ComputedAssessment {
  results: AssessmentResults;
  /** Avisos (dado faltando, fora da faixa); não impedem salvar o que foi medido. */
  warnings: string[];
}

export const PROTOCOLS: Array<{ value: Protocol; label: string }> = [
  { value: 'jp3', label: 'Jackson & Pollock 3 dobras' },
  { value: 'jp7', label: 'Jackson & Pollock 7 dobras' },
  { value: 'durnin_womersley', label: 'Durnin & Womersley' },
  { value: 'faulkner', label: 'Faulkner' },
  { value: 'isak', label: 'Perfil restrito ISAK (somatórios)' },
];

/** Dobras exigidas pelo protocolo (para o sexo informado). */
export function protocolSites(protocol: Protocol, sex: Sex | null): SkinfoldSite[] {
  if (protocol === 'isak') return ISAK_SUM8_SITES;
  return PROTOCOL_SITES[protocol][sex ?? 'female'];
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

function attempt(warnings: string[], fn: () => void) {
  try {
    fn();
  } catch (e) {
    warnings.push(e instanceof NutritionInputError ? e.message : 'Valores inválidos.');
  }
}

/** Calcula os resultados de uma avaliação com o nutrition-core (mesma função no navegador e no servidor). */
export function computeAssessment(input: AssessmentInput, ctx: { sex: Sex | null; ageYears: number | null }): ComputedAssessment {
  const results: AssessmentResults = {};
  const warnings: string[] = [];
  const { weight_kg: w, height_cm: h, waist_cm: wa, hip_cm: hi } = input;

  if (w !== null && h !== null) {
    attempt(warnings, () => {
      results.bmi = round(bmi(w, h));
      if (ctx.ageYears !== null && ctx.ageYears >= 18) results.bmi_class = classifyBmi(results.bmi, ctx.ageYears);
    });
  }
  if (wa !== null) {
    if (ctx.sex) attempt(warnings, () => { results.waist_risk = waistRisk(wa, ctx.sex!); });
    if (hi !== null) attempt(warnings, () => { results.whr = round(waistHipRatio(wa, hi), 3); });
    if (h !== null) attempt(warnings, () => { results.whtr = round(waistHeightRatio(wa, h), 3); });
  }

  const hasFolds = Object.keys(input.skinfolds).length > 0;
  if (input.protocol && hasFolds) {
    if (input.protocol === 'isak') {
      attempt(warnings, () => {
        const s = isakSkinfoldSums(input.skinfolds);
        results.sum6 = round(s.sum6, 1);
        results.sum8 = round(s.sum8, 1);
      });
    } else if (!ctx.sex || ctx.ageYears === null) {
      warnings.push('Informe sexo e data de nascimento na ficha para calcular a composição corporal.');
    } else if (w === null) {
      warnings.push('Informe o peso para calcular a composição corporal.');
    } else {
      attempt(warnings, () => {
        const c = bodyComposition({
          protocol: input.protocol as SkinfoldProtocol,
          sex: ctx.sex!,
          ageYears: ctx.ageYears!,
          weightKg: w,
          skinfolds: input.skinfolds,
          densityEquation: input.density_equation,
        });
        results.body_fat_pct = round(c.bodyFatPct);
        results.fat_mass_kg = round(c.fatMassKg);
        results.lean_mass_kg = round(c.leanMassKg);
        results.density = c.density === null ? null : round(c.density, 5);
        results.skinfold_sum = round(c.skinfoldSum, 1);
      });
    }
  }
  return { results, warnings };
}
