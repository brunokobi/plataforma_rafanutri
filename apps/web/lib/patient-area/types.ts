export interface PatientMealSummary { id: string; name: string; time: string | null; items: number }

/** Um registro do paciente num consultório, como a área do paciente vê (GET /rafanutri/me/patient). */
export interface PatientRecordView {
  patient_id: string;
  first_name: string | null;
  practice: { id: string; name: string; brand_color: string | null; has_logo?: boolean };
  professional: { name: string | null; crn: string | null };
  plan: { id: string; title: string; published_at: string | null; meals: PatientMealSummary[] } | null;
  recommendations_unread?: number;
}

export interface PatientArea { patient_account: boolean; records: PatientRecordView[] }

export interface AppAccess {
  linked: boolean;
  email: string | null;
  activated_at: string | null;
  invite: { email: string; expires_at: string; date_created: string } | null;
  patient_email: string | null;
  active: boolean;
  /** Menor de 18 anos: o convite vai para um responsável com consentimento (RN-118). */
  minor?: boolean;
  guardians?: Guardian[];
}

export interface InvitePreview {
  practice: { name: string; brand_color: string | null } | null;
  professional: { name: string | null; crn: string | null } | null;
  patient_first_name: string | null;
  email: string;
  email_masked: string;
  account_exists: boolean;
  expires_at: string;
}

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; message: string; field?: string };

import type { Guardian } from '@/lib/maternal/types';

/** O que o paciente vê (RN-210). */
export interface ShareSettings { show_kcal: boolean; show_macros: boolean; show_weight_history: boolean; show_maternal: boolean }
export const SHARE_LABEL: Record<keyof ShareSettings, string> = {
  show_kcal: 'Calorias do plano',
  show_macros: 'Macronutrientes (proteínas, carboidratos e gorduras)',
  show_weight_history: 'Histórico de peso (gráfico)',
  show_maternal: 'Materno-infantil: curvas de crescimento, gestação, lactação e introdução alimentar',
};
export interface WeightPoint { date: string; weight_kg: number }

/** Plano publicado completo (GET /rafanutri/me/patient/plan), com alimentos e preparações resolvidos no servidor. */
export interface PatientPlanPayload {
  patient_id: string;
  share?: ShareSettings;
  /** Cabeçalho do PDF (RN-209). */
  document?: {
    practice_name: string;
    brand_color: string | null;
    professional_name: string | null;
    crn: string;
    crn_region: string;
    contact: string;
    patient_name: string;
    objective: string;
  };
  plan: {
    id: string;
    title: string;
    mode: 'quantitative' | 'qualitative';
    status?: 'published' | 'archived';
    published_at: string | null;
    valid_until: string | null;
    guidelines: string | null;
    meals: Array<{ id: string; name: string; time: string | null; items: Array<{ foodId: string; quantityG: number; subs: Array<{ foodId: string; quantityG: number }> }> }>;
  };
  foods: Record<string, { name: string; household_measures: Array<{ label: string; grams: number }>; per100g?: Record<string, number | null> }>;
  recipes: Record<string, { yield_g: number | null; servings: number | null; instructions: string | null; items: Array<{ name: string | null; quantityG: number }> }>;
}

/** Plano que o paciente pode baixar (vigente ou anterior). */
export interface PatientPlanDocument {
  id: string;
  title: string;
  status: 'published' | 'archived';
  published_at: string;
  valid_until: string | null;
}
