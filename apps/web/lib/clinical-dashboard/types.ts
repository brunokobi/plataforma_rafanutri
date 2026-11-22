import { ATTENTION_REASONS, type AttentionReason } from '@rafanutri/catalogs';

export type { AttentionReason };

/** Textos dos motivos: catálogo compartilhado com a extensão (packages/catalogs). */
export const REASON_LABEL: Record<AttentionReason, string> = ATTENTION_REASONS;
export const REASON_SHORT: Record<AttentionReason, string> = {
  no_return: 'Retorno atrasado', never_seen: 'Sem consulta', plan_expired: 'Plano vencido', plan_expiring: 'Plano vencendo',
  no_plan: 'Sem plano', no_assessment: 'Sem avaliação', risk_high: 'Risco alto', pending_anamnesis: 'Anamnese',
};
export const REASONS = Object.keys(REASON_LABEL) as AttentionReason[];

export interface PatientsDashboard {
  counts: { active: number; inactive: number; archived: number; new_30d: number; with_app: number; with_plan: number };
  weight: { tracked: number; mean_change_kg: number | null; losing: number; stable: number; gaining: number };
  bmi: { under: number; normal: number; over: number; obese: number };
  ages: { child: number; teen: number; adult: number; elderly: number; unknown: number };
  sex: { female: number; male: number; unknown: number };
  risk: { low: number; medium: number; high: number; none: number };
  visits: { completed_30d: number; next_7d: number; no_show_rate_90d: number | null };
  attention: Array<{ patient_id: string; full_name: string; reasons: AttentionReason[]; last_visit_at: string | null; next_visit_at: string | null }>;
  by_reason: Record<AttentionReason, number>;
}

export interface SeriesPoint { date: string; weight_kg: number | null; bmi: number | null; body_fat_pct: number | null; waist_cm: number | null }

export interface TimelineEvent { kind: 'assessment' | 'visit' | 'no_show' | 'plan' | 'note' | 'anamnesis' | 'screening' | 'document'; at: string; label: string }

export interface PatientDashboard {
  series: SeriesPoint[];
  weight: { first: SeriesPoint; last: SeriesPoint; change_kg: number | null } | null;
  visits: { completed: number; no_show: number; first_at: string | null; last_at: string | null; next_at: string | null; days_since_last: number | null };
  plan: { published: { id: string; title: string; published_at: string; valid_until: string | null; days_left: number | null; kcal: number | null } | null; versions: number; drafts: number };
  notes: { count: number; last_at: string | null };
  anamneses: { answered_pending: number; sent: number; total: number };
  recommendations: { published: number; unread: number };
  package: { name: string; remaining: number; total: number; expires_at: string | null } | null;
  app: { linked: boolean; activated_at: string | null };
  screening: { tool: string; classification: string; risk_level: 'low' | 'medium' | 'high'; screened_at: string } | null;
  documents: number;
  timeline: TimelineEvent[];
}
