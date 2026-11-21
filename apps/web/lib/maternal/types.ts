export interface MaternalMeasurement {
  id: string;
  assessed_at: string;
  weight_kg: number | null;
  height_cm: number | null;
  head_circumference_cm: number | null;
  measured_lying: boolean | null;
  notes: string | null;
}

export interface Pregnancy {
  id: string;
  lmp_date: string;
  pre_pregnancy_weight_kg: number;
  height_cm: number;
  status: 'active' | 'ended';
  ended_on: string | null;
  outcome: 'birth' | 'loss' | 'other' | null;
  notes: string | null;
}

export type MaternalData =
  | { allowed: false; patient: { sex: 'female' | 'male' | null; birth_date: string | null } }
  | { allowed: true; patient: { sex: 'female' | 'male' | null; birth_date: string | null }; measurements: MaternalMeasurement[]; pregnancies: Pregnancy[] };

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; message: string; fields?: Record<string, string> };

export const OUTCOME_LABEL: Record<NonNullable<Pregnancy['outcome']>, string> = { birth: 'Parto', loss: 'Perda gestacional', other: 'Outro motivo' };
