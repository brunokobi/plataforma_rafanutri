export interface PatientMealSummary { id: string; name: string; time: string | null; items: number }

/** Um registro do paciente num consultório, como a área do paciente vê (GET /rafanutri/me/patient). */
export interface PatientRecordView {
  patient_id: string;
  first_name: string | null;
  practice: { id: string; name: string; brand_color: string | null };
  professional: { name: string | null; crn: string | null };
  plan: { id: string; title: string; published_at: string | null; meals: PatientMealSummary[] } | null;
}

export interface PatientArea { patient_account: boolean; records: PatientRecordView[] }

export interface AppAccess {
  linked: boolean;
  email: string | null;
  activated_at: string | null;
  invite: { email: string; expires_at: string; date_created: string } | null;
  patient_email: string | null;
  active: boolean;
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

/** Plano publicado completo (GET /rafanutri/me/patient/plan), com alimentos e preparações resolvidos no servidor. */
export interface PatientPlanPayload {
  patient_id: string;
  plan: {
    id: string;
    title: string;
    mode: 'quantitative' | 'qualitative';
    published_at: string | null;
    valid_until: string | null;
    guidelines: string | null;
    meals: Array<{ id: string; name: string; time: string | null; items: Array<{ foodId: string; quantityG: number; subs: Array<{ foodId: string; quantityG: number }> }> }>;
  };
  foods: Record<string, { name: string; household_measures: Array<{ label: string; grams: number }> }>;
  recipes: Record<string, { yield_g: number | null; servings: number | null; instructions: string | null; items: Array<{ name: string | null; quantityG: number }> }>;
}
