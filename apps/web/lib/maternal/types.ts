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

export type FeedingType = 'exclusive' | 'predominant' | 'complemented' | 'mixed';
export type Reaction = 'none' | 'mild' | 'moderate' | 'severe';
export type FeedingKind = 'allergen' | 'texture';

export interface Lactation {
  id: string;
  patient_id: string;
  baby_patient_id: string | null;
  started_on: string;
  feeding_type: FeedingType;
  status: 'active' | 'ended';
  ended_on: string | null;
  notes: string | null;
  mother_name: string;
  baby_name: string | null;
  /** Papel deste paciente no registro: mãe ou bebê. */
  role: 'mother' | 'baby';
}

export interface FeedingRecord {
  kind: FeedingKind;
  item: string;
  introduced_on: string;
  reaction: Reaction;
  notes: string | null;
  by_guardian: boolean;
}

export type Relationship = 'mother' | 'father' | 'grandparent' | 'legal_guardian' | 'other';
export type ConsentMethod = 'in_person' | 'signed_form' | 'other';

export interface Guardian {
  id: string;
  full_name: string;
  relationship: Relationship;
  email: string | null;
  phone: string | null;
  consent_at: string | null;
  consent_method: ConsentMethod | null;
  notes: string | null;
}

export type MaternalData =
  | { allowed: false; patient: { sex: 'female' | 'male' | null; birth_date: string | null } }
  | {
      allowed: true;
      patient: { sex: 'female' | 'male' | null; birth_date: string | null };
      measurements: MaternalMeasurement[];
      pregnancies: Pregnancy[];
      lactations: Lactation[];
      feeding: FeedingRecord[];
      guardians: Guardian[];
      baby_candidates: Array<{ id: string; full_name: string; birth_date: string | null }>;
    };

/** O que o app do paciente recebe (GET /me/patient/maternal). */
export type MyMaternal =
  | { visible: false }
  | {
      visible: true;
      patient: { id: string; first_name: string | null; sex: 'female' | 'male' | null; birth_date: string | null };
      measurements: Array<Omit<MaternalMeasurement, 'id' | 'notes'>>;
      pregnancy: { lmp_date: string; pre_pregnancy_weight_kg: number; height_cm: number } | null;
      lactation: Lactation | null;
      feeding: FeedingRecord[];
    };

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; message: string; fields?: Record<string, string> };

export const OUTCOME_LABEL: Record<NonNullable<Pregnancy['outcome']>, string> = { birth: 'Parto', loss: 'Perda gestacional', other: 'Outro motivo' };
