import { NOTIFICATION_KINDS, REMINDER_HOURS as CAT_REMINDER_HOURS, type NotificationKind } from '@rafanutri/catalogs';
// Avisos ao paciente (0058): Telegram primeiro para tudo; e-mail só para os avisos importantes.

export type { NotificationKind };

/** Rótulos dos tipos de aviso: catálogo compartilhado com a extensão (packages/catalogs). */
export const KIND_LABEL: Record<NotificationKind, string> = Object.fromEntries(Object.entries(NOTIFICATION_KINDS).map(([k, v]) => [k, v.label])) as Record<NotificationKind, string>;

/** Rótulo de um tipo vindo do servidor; tipo novo ainda sem rótulo aparece pelo código, nunca "undefined". */
export const kindLabel = (k: string) => KIND_LABEL[k as NotificationKind] ?? k;

export type NotificationStatus = 'queued' | 'sent' | 'failed' | 'skipped';
export const STATUS_LABEL: Record<NotificationStatus, string> = { queued: 'Na fila', sent: 'Enviado', failed: 'Falhou', skipped: 'Não enviado' };
export const CHANNEL_LABEL = { telegram: 'Telegram', email: 'E-mail' } as const;

/** Horários de lembrete permitidos (iguais ao banco). */
export const REMINDER_HOURS = CAT_REMINDER_HOURS;
export const hoursLabel = (h: number) => (h >= 24 ? (h === 24 ? '1 dia antes' : `${h / 24} dias antes`) : h === 1 ? '1 hora antes' : `${h} horas antes`);

export interface NotificationSettings {
  reminders_enabled: boolean;
  reminder_hours: number[];
  scheduled_enabled: boolean;
  plan_enabled: boolean;
  reminder_note: string | null;
}

export interface NotificationOverview {
  settings: NotificationSettings;
  can_edit: boolean;
  telegram_ready: boolean;
  telegram_bot: string | null;
  stats: { telegram_patients: number; last30: Array<{ channel: 'telegram' | 'email'; status: NotificationStatus; n: number }> };
}

export interface NotificationLogItem {
  id: string;
  kind: NotificationKind;
  channel: 'telegram' | 'email';
  subject: string;
  status: NotificationStatus;
  attempts: number;
  last_error: string | null;
  date_created: string;
  sent_at: string | null;
  patient_id: string | null;
  patient_name: string | null;
}

export interface ContactPrefs {
  email: string | null;
  email_opt_in: boolean;
  telegram_opt_in: boolean;
  telegram_linked: boolean;
  telegram_name: string | null;
  telegram_linked_at: string | null;
  telegram_ready: boolean;
  recent?: NotificationLogItem[];
}

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; message: string; fields?: Record<string, string> };
