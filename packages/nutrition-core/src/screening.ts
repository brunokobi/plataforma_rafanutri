/**
 * Triagens nutricionais (Fase 6, bloco A — RN-170 a RN-174).
 *
 * - NRS-2002: Kondrup J. et al. Clin Nutr 2003;22(3):321-336 (adultos hospitalizados).
 * - MUST: BAPEN, "The 'MUST' Explanatory Booklet", 2003, rev. 2011 (adultos na comunidade e no hospital).
 * - ASG (Avaliação Subjetiva Global): Detsky A. S. et al. JPEN 1987;11(1):8-13 — o profissional decide a classe;
 *   o sistema só sugere a partir das respostas.
 * A MNA fica de fora até a licença do formulário (marca da Nestlé) ser validada.
 */

export type ScreeningCode = 'nrs_2002' | 'must' | 'sga';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface ScreeningResult {
  score: number | null;
  /** Código da classificação (gravado no banco). */
  classification: string;
  /** Texto para a tela. */
  label: string;
  risk: RiskLevel;
  /** Conduta sugerida pela referência. */
  conduct: string;
}

export interface ScreeningTool<A> {
  code: ScreeningCode;
  version: string;
  name: string;
  population: string;
  reference: string;
  /** Erros por campo; vazio quando as respostas estão completas. */
  validate(a: A): Record<string, string>;
  evaluate(a: A): ScreeningResult;
}

export const RISK_LABEL: Record<RiskLevel, string> = { low: 'Risco baixo', medium: 'Risco médio', high: 'Risco alto' };

const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

// ── NRS-2002 ──────────────────────────────────────────────────────────────────────────────

export interface Nrs2002Answers {
  /** Triagem inicial. */
  bmiBelow20_5: boolean;
  weightLoss3m: boolean;
  reducedIntakeLastWeek: boolean;
  severelyIll: boolean;
  /** Triagem final (só quando há algum "sim" na inicial). */
  nutritionalStatus?: 0 | 1 | 2 | 3;
  diseaseSeverity?: 0 | 1 | 2 | 3;
  ageYears: number;
}

export const NRS_STATUS_OPTIONS = [
  'Ausente: estado nutricional normal',
  'Leve: perda de peso > 5% em 3 meses ou ingestão de 50 a 75% da necessidade na última semana',
  'Moderado: perda > 5% em 2 meses, ou IMC 18,5 a 20,5 com estado geral comprometido, ou ingestão de 25 a 50%',
  'Grave: perda > 5% em 1 mês (> 15% em 3 meses), ou IMC < 18,5 com estado geral comprometido, ou ingestão de 0 a 25%',
] as const;
export const NRS_SEVERITY_OPTIONS = [
  'Ausente: necessidade nutricional normal',
  'Leve: fratura de quadril, doença crônica com complicação aguda (cirrose, DPOC), hemodiálise, diabetes, câncer',
  'Moderada: cirurgia abdominal de grande porte, AVC, pneumonia grave, neoplasia hematológica',
  'Grave: traumatismo craniano, transplante de medula óssea, UTI (APACHE > 10)',
] as const;

export const nrs2002: ScreeningTool<Nrs2002Answers> = {
  code: 'nrs_2002',
  version: 'nrs_2002@kondrup2003',
  name: 'NRS-2002',
  population: 'Adultos hospitalizados',
  reference: 'Kondrup J. et al. Clin Nutr 2003;22(3):321-336',
  validate(a) {
    const e: Record<string, string> = {};
    if (!num(a.ageYears) || a.ageYears < 18 || a.ageYears > 120) e.ageYears = 'A NRS-2002 é para adultos (18 anos ou mais).';
    if (nrsNeedsFinal(a)) {
      if (!int(a.nutritionalStatus, 0, 3)) e.nutritionalStatus = 'Escolha o comprometimento do estado nutricional.';
      if (!int(a.diseaseSeverity, 0, 3)) e.diseaseSeverity = 'Escolha a gravidade da doença.';
    }
    return e;
  },
  evaluate(a) {
    if (!nrsNeedsFinal(a)) {
      return { score: null, classification: 'no_risk_initial', label: 'Sem risco na triagem inicial', risk: 'low', conduct: 'Repetir a triagem semanalmente durante a internação.' };
    }
    const score = (a.nutritionalStatus ?? 0) + (a.diseaseSeverity ?? 0) + (a.ageYears >= 70 ? 1 : 0);
    return score >= 3
      ? { score, classification: 'at_risk', label: 'Em risco nutricional', risk: 'high', conduct: 'Iniciar plano de cuidado nutricional.' }
      : { score, classification: 'not_at_risk', label: 'Sem risco nutricional no momento', risk: 'low', conduct: 'Repetir a triagem semanalmente; se houver cirurgia de grande porte prevista, considerar plano preventivo.' };
  },
};

/** Algum "sim" na triagem inicial leva à triagem final. */
export function nrsNeedsFinal(a: Pick<Nrs2002Answers, 'bmiBelow20_5' | 'weightLoss3m' | 'reducedIntakeLastWeek' | 'severelyIll'>): boolean {
  return Boolean(a.bmiBelow20_5 || a.weightLoss3m || a.reducedIntakeLastWeek || a.severelyIll);
}

// ── MUST ──────────────────────────────────────────────────────────────────────────────────

export interface MustAnswers {
  bmi: number;
  /** Perda de peso não intencional nos últimos 3 a 6 meses, em % (0 se não perdeu). */
  weightLossPct: number;
  /** Doença aguda com ausência (ou provável ausência) de ingestão por mais de 5 dias. */
  acuteDiseaseNoIntake: boolean;
}

/** Pontos de cada passo do MUST. */
export function mustSteps(a: MustAnswers): { bmi: number; loss: number; acute: number } {
  const bmi = a.bmi > 20 ? 0 : a.bmi >= 18.5 ? 1 : 2;
  const loss = a.weightLossPct < 5 ? 0 : a.weightLossPct <= 10 ? 1 : 2;
  return { bmi, loss, acute: a.acuteDiseaseNoIntake ? 2 : 0 };
}

export const must: ScreeningTool<MustAnswers> = {
  code: 'must',
  version: 'must@bapen2011',
  name: 'MUST',
  population: 'Adultos na comunidade e no hospital',
  reference: "BAPEN. The 'MUST' Explanatory Booklet, 2003 (rev. 2011)",
  validate(a) {
    const e: Record<string, string> = {};
    if (!num(a.bmi) || a.bmi < 8 || a.bmi > 80) e.bmi = 'Informe o IMC (ou registre peso e altura).';
    if (!num(a.weightLossPct) || a.weightLossPct < 0 || a.weightLossPct > 60) e.weightLossPct = 'Perda de peso entre 0 e 60%.';
    return e;
  },
  evaluate(a) {
    const s = mustSteps(a);
    const score = s.bmi + s.loss + s.acute;
    const obese = a.bmi >= 30 ? ' IMC ≥ 30: registrar obesidade.' : '';
    if (score === 0) return { score, classification: 'low', label: 'Risco baixo', risk: 'low', conduct: `Cuidado de rotina; repetir a triagem (hospital: semanal; comunidade: anual; grupos de risco: mensal).${obese}` };
    if (score === 1) return { score, classification: 'medium', label: 'Risco médio', risk: 'medium', conduct: `Observar: registrar a ingestão por 3 dias; se melhorar, repetir a triagem; se não, seguir a conduta local.${obese}` };
    return { score, classification: 'high', label: 'Risco alto', risk: 'high', conduct: `Tratar: encaminhar ao nutricionista ou à equipe de terapia nutricional, aumentar a ingestão e monitorar o plano de cuidado.${obese}` };
  },
};

// ── ASG (Avaliação Subjetiva Global) ──────────────────────────────────────────────────────

export type SgaClass = 'A' | 'B' | 'C';
export interface SgaAnswers {
  /** Perda de peso nos últimos 6 meses, em %. */
  weightLossPct: number;
  /** Peso nas últimas 2 semanas. */
  recentTrend: 'gain' | 'stable' | 'loss';
  intake: 'normal' | 'suboptimal_solid' | 'liquid_only' | 'hypocaloric_liquid' | 'starvation';
  /** Sintomas gastrointestinais por mais de 2 semanas (náusea, vômitos, diarreia, anorexia). */
  giSymptoms: boolean;
  functional: 'full' | 'reduced' | 'bedridden';
  diseaseStress: 'none' | 'low' | 'moderate' | 'high';
  /** Exame físico: 0 normal, 1 leve, 2 moderada, 3 grave. */
  fatLoss: 0 | 1 | 2 | 3;
  muscleWasting: 0 | 1 | 2 | 3;
  edema: 0 | 1 | 2 | 3;
  ascites: 0 | 1 | 2 | 3;
  /** Classe decidida pelo profissional. */
  finalClass: SgaClass;
}

export const SGA_CLASS_LABEL: Record<SgaClass, string> = {
  A: 'A — Bem nutrido',
  B: 'B — Moderadamente desnutrido (ou suspeita)',
  C: 'C — Gravemente desnutrido',
};

/** Sugestão de classe a partir das respostas (o profissional decide). */
export function sgaSuggestion(a: Omit<SgaAnswers, 'finalClass'>): SgaClass {
  const severePhysical = a.muscleWasting >= 3 || a.fatLoss >= 3 || (a.muscleWasting >= 2 && a.fatLoss >= 2);
  const lossNotRecovering = a.weightLossPct > 10 && a.recentTrend !== 'gain';
  if (severePhysical && (lossNotRecovering || a.intake === 'starvation')) return 'C';
  const moderateSigns = [
    a.weightLossPct >= 5 && a.recentTrend !== 'gain',
    a.intake !== 'normal',
    a.giSymptoms,
    a.functional !== 'full',
    a.muscleWasting >= 1 || a.fatLoss >= 1,
    a.edema >= 2 || a.ascites >= 2,
  ].filter(Boolean).length;
  return moderateSigns >= 2 ? 'B' : 'A';
}

export const sga: ScreeningTool<SgaAnswers> = {
  code: 'sga',
  version: 'sga@detsky1987',
  name: 'Avaliação Subjetiva Global (ASG)',
  population: 'Adultos (clínica e hospital)',
  reference: 'Detsky A. S. et al. JPEN 1987;11(1):8-13',
  validate(a) {
    const e: Record<string, string> = {};
    if (!num(a.weightLossPct) || a.weightLossPct < 0 || a.weightLossPct > 60) e.weightLossPct = 'Perda de peso entre 0 e 60%.';
    for (const k of ['fatLoss', 'muscleWasting', 'edema', 'ascites'] as const) if (!int(a[k], 0, 3)) e[k] = 'Escolha uma opção.';
    if (!['A', 'B', 'C'].includes(a.finalClass)) e.finalClass = 'Escolha a classificação final.';
    return e;
  },
  evaluate(a) {
    const risk: RiskLevel = a.finalClass === 'A' ? 'low' : a.finalClass === 'B' ? 'medium' : 'high';
    const conduct = a.finalClass === 'A' ? 'Manter o acompanhamento de rotina.' : a.finalClass === 'B' ? 'Intervenção nutricional e reavaliação em curto prazo.' : 'Terapia nutricional imediata e acompanhamento próximo.';
    return { score: null, classification: a.finalClass, label: SGA_CLASS_LABEL[a.finalClass], risk, conduct };
  },
};

export const SCREENING_TOOLS = { nrs_2002: nrs2002, must, sga } as const;

/** % de perda de peso entre um peso anterior e o atual (0 se ganhou). */
export function weightLossPercent(previousKg: number, currentKg: number): number {
  if (!(previousKg > 0) || !(currentKg > 0)) return 0;
  return Math.max(0, Math.round(((previousKg - currentKg) / previousKg) * 1000) / 10);
}
