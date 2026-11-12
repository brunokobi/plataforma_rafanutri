import { z } from 'zod';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentType = 'first' | 'return';
export type AppointmentMode = 'in_person' | 'online';

export interface Appointment {
  id: string;
  patient_id: { id: string; full_name: string } | null;
  starts_at: string; // ISO (UTC)
  ends_at: string;
  type: AppointmentType;
  mode: AppointmentMode;
  status: AppointmentStatus;
  meeting_url: string | null;
  notes: string | null;
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  no_show: 'Faltou',
};
export const TYPE_LABEL: Record<AppointmentType, string> = { first: 'Primeira consulta', return: 'Retorno' };
export const MODE_LABEL: Record<AppointmentMode, string> = { in_person: 'Presencial', online: 'Online' };
/** Duração padrão em minutos por tipo de consulta. */
export const DEFAULT_DURATION: Record<AppointmentType, number> = { first: 60, return: 45 };
/** Cancelada e falta não ocupam o horário (como a restrição do banco). */
export const FREES_SLOT: AppointmentStatus[] = ['cancelled', 'no_show'];
/** Situações em que ainda dá para confirmar, concluir, remarcar etc. */
export const OPEN_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed'];

// ── Fuso do consultório ────────────────────────────────────────────────────────
// America/Sao_Paulo não tem horário de verão desde 2019: o deslocamento é fixo em -03:00.
// Quando houver consultórios em outros fusos, trocar por Intl com organizations.timezone.
export const TZ_OFFSET = '-03:00';
const OFFSET_MS = -3 * 60 * 60 * 1000;

/** "2026-11-13" + "09:30" (horário de Brasília) → ISO em UTC. */
export function toInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00${TZ_OFFSET}`).toISOString();
}
/** ISO → data local "AAAA-MM-DD". */
export function localDate(iso: string): string {
  return new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(0, 10);
}
/** ISO → hora local "HH:MM". */
export function localTime(iso: string): string {
  return new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(11, 16);
}
/** Hoje no fuso do consultório. */
export function today(now = new Date()): string {
  return localDate(now.toISOString());
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Segunda-feira da semana da data. */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}
export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Horários livres de um dia para uma consulta de `duration` minutos, dentro do expediente,
 * de `step` em `step` minutos, sem sobrepor consultas que ocupam horário.
 * Expediente padrão 08:00–18:00 (a configuração por nutricionista entra depois).
 */
export function freeSlots(
  date: string,
  appointments: Pick<Appointment, 'starts_at' | 'ends_at' | 'status'>[],
  duration: number,
  { start = '08:00', end = '18:00', step = 30, now }: { start?: string; end?: string; step?: number; now?: Date } = {},
): string[] {
  const busy = appointments
    .filter((a) => !FREES_SLOT.includes(a.status) && localDate(a.starts_at) === date)
    .map((a) => [minutes(localTime(a.starts_at)), minutes(localTime(a.ends_at))] as const);
  const isToday = now && today(now) === date;
  const nowMin = isToday ? minutes(localTime(now.toISOString())) : -1;
  const out: string[] = [];
  for (let m = minutes(start); m + duration <= minutes(end); m += step) {
    if (m <= nowMin) continue;
    if (busy.some(([b0, b1]) => m < b1 && m + duration > b0)) continue;
    out.push(hhmm(m));
  }
  return out;
}

const optional = (s: unknown) => (typeof s === 'string' && s.trim() === '' ? undefined : s);

export const appointmentFormSchema = z.object({
  patient_id: z.string().uuid('Escolha o paciente.'),
  date: z.string().refine(isDate, 'Data inválida.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido.'),
  duration: z.coerce.number().int().min(15, 'Mínimo de 15 minutos.').max(240, 'Máximo de 4 horas.'),
  type: z.enum(['first', 'return']),
  mode: z.enum(['in_person', 'online']),
  meeting_url: z.preprocess(optional, z.string().trim().url('Link inválido.').regex(/^https?:\/\//i, 'Use um link http(s).').optional()),
  notes: z.preprocess(optional, z.string().trim().max(500, 'Use no máximo 500 caracteres.').optional()),
});
export type AppointmentFormInput = z.input<typeof appointmentFormSchema>;

export const rescheduleSchema = z.object({
  date: z.string().refine(isDate, 'Data inválida.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido.'),
  duration: z.coerce.number().int().min(15).max(240),
});
export type RescheduleInput = z.input<typeof rescheduleSchema>;

/** Duração em minutos de uma consulta salva. */
export const durationOf = (a: Pick<Appointment, 'starts_at' | 'ends_at'>) => Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60_000);
