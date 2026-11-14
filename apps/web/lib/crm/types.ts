export type LeadStage = 'new' | 'contacted' | 'lost' | 'converted';
export type LeadSource = 'instagram' | 'referral' | 'google' | 'site' | 'whatsapp' | 'other';
export type PatientStage = 'scheduled' | 'first_visit' | 'follow_up' | 'inactive';

export const SOURCE_LABEL: Record<LeadSource, string> = { instagram: 'Instagram', referral: 'Indicação', google: 'Google', site: 'Site', whatsapp: 'WhatsApp', other: 'Outro' };
export const LEAD_STAGE_LABEL: Record<Exclude<LeadStage, 'converted'>, string> = { new: 'Lead novo', contacted: 'Em contato', lost: 'Perdido' };
export const PATIENT_STAGE_LABEL: Record<PatientStage, string> = { scheduled: 'Agendado', first_visit: '1ª consulta feita', follow_up: 'Em acompanhamento', inactive: 'Inativo (90 dias)' };

export interface Lead {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  stage: LeadStage;
  lost_reason: string | null;
  notes: string | null;
  patient_id: string | null;
  date_created: string;
}
export interface BoardPatient { id: string; full_name: string; phone: string | null; crm_stage: PatientStage; lead_source: LeadSource | null; last_visit: string | null; next_visit: string | null }
export interface Board { leads: Lead[]; patients: BoardPatient[]; without_visit: number }
export interface LeadInput { full_name: string; phone: string; email: string; source: LeadSource; notes: string }
export interface ReturnRow { id: string; full_name: string; phone: string | null; return_interval_days: number; last_visit: string; due_date: string }
export interface Returns { today: string; returns: ReturnRow[] }
export interface MetricsRow { source: LeadSource; leads: number; converted: number; lost: number; first_visit: number }
export interface Metrics { days: number; by_source: MetricsRow[] }
export type CrmResult = { ok: true } | { ok: false; message: string };

/** Dias entre hoje e o retorno previsto (negativo = atrasado). */
export function daysUntil(due: string, today: string): number {
  return Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

/** "Atrasado há 3 dias" / "Hoje" / "Em 5 dias" */
export function dueLabel(due: string, today: string): string {
  const d = daysUntil(due, today);
  if (d === 0) return 'Hoje';
  if (d < 0) return `Atrasado há ${-d} ${d === -1 ? 'dia' : 'dias'}`;
  return `Em ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/** Link do WhatsApp com a mensagem de lembrete de retorno. */
export function returnReminderLink(phone: string, firstName: string, practice: string): string {
  const text = `Olá, ${firstName}! Aqui é do ${practice}. Já está na hora do seu retorno de nutrição. Quer agendar? Me diga o melhor dia e horário.`;
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** Totais dos indicadores e taxa de conversão (lead → 1ª consulta). */
export function metricsTotals(rows: MetricsRow[]) {
  const t = rows.reduce((a, r) => ({ leads: a.leads + r.leads, converted: a.converted + r.converted, lost: a.lost + r.lost, first_visit: a.first_visit + r.first_visit }), { leads: 0, converted: 0, lost: 0, first_visit: 0 });
  return { ...t, rate: t.leads ? Math.round((t.first_visit / t.leads) * 1000) / 10 : 0 };
}
