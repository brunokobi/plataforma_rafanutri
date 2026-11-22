import type { RiskLevel, ScreeningCode } from '@rafanutri/nutrition-core';

export interface ScreeningRow {
  id: string;
  tool: ScreeningCode;
  tool_version: string;
  answers: Record<string, unknown>;
  score: number | null;
  classification: string;
  risk_level: RiskLevel;
  screened_at: string;
  notes: string | null;
}

export interface ScreeningPrefill {
  weight_kg: number | null;
  weighed_on: string | null;
  height_cm: number | null;
  bmi: number | null;
  loss_3_6m: number | null;
  loss_3m: number | null;
  loss_6m: number | null;
}

export type ScreeningData =
  | { allowed: false }
  | { allowed: true; patient: { sex: 'female' | 'male' | null; birth_date: string | null }; prefill: ScreeningPrefill; screenings: ScreeningRow[] };

export type Overview =
  | { allowed: false }
  | {
      allowed: true;
      active_patients: number;
      screened_patients: number;
      screenings_30d: number;
      by_risk: Record<RiskLevel, number>;
      at_risk: Array<{ patient_id: string; full_name: string; birth_date: string | null; tool: ScreeningCode; classification: string; risk_level: RiskLevel; score: number | null; screened_at: string }>;
    };

export const TOOL_LABEL: Record<ScreeningCode, string> = { nrs_2002: 'NRS-2002', must: 'MUST', sga: 'ASG' };

/** Texto da classificação gravada. */
export const CLASSIFICATION_LABEL: Record<string, string> = {
  no_risk_initial: 'Sem risco na triagem inicial',
  at_risk: 'Em risco nutricional',
  not_at_risk: 'Sem risco nutricional',
  low: 'Risco baixo',
  medium: 'Risco médio',
  high: 'Risco alto',
  A: 'A — Bem nutrido',
  B: 'B — Moderadamente desnutrido',
  C: 'C — Gravemente desnutrido',
};
