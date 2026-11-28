// Acompanhamento em casa (0072): tipos do painel e regras puras usadas pelas telas do paciente e do nutricionista.

export interface TrackingShare {
  show_body: boolean; self_weight: boolean; show_weight_history: boolean; water: boolean; goals: boolean; meal_checks: boolean;
  weight_neutral: boolean; ed_detected: boolean;
}

export interface Bmi { bmi: number; class: string | null; label: string }

export interface WeightLog { id: string; weight_kg: number; measured_at: string; note: string | null; by_patient: boolean }
export interface Goal {
  id: string; title: string; details: string | null; kind: 'habit' | 'weight'; frequency: 'daily' | 'weekly'; times_per_week: number | null;
  target_weight_kg: number | null; done_today: boolean; done_week: number; days: string[];
}

export interface Tracking {
  patient_id: string;
  share: TrackingShare;
  today: string;
  profile: { name: string; first_name: string; age: number | null; sex: 'female' | 'male' | null; birth_date: string | null; objective: string | null; care_profile: string | null };
  body: {
    height_cm: number | null;
    weight: { weight_kg: number; at: string; source: 'patient' | 'clinic' } | null;
    bmi: Bmi | null;
    last_assessment: { date: string; weight_kg: number | null; waist_cm: number | null; hip_cm: number | null; whtr: number | null; body_fat_pct: number | null; lean_mass_kg: number | null } | null;
  };
  weight: { logs: WeightLog[]; clinic: Array<{ date: string; weight_kg: number }>; target_kg: number | null };
  water: null | {
    goal_ml: number; goal_source: 'professional' | 'weight' | 'default'; professional_goal_ml: number | null; today_ml: number;
    today_logs: Array<{ id: string; amount_ml: number; logged_at: string }>;
    days: Array<{ day: string; ml: number }>; streak: number;
    reminders: { on: boolean; every_min: number; start: string; end: string };
  };
  goals: Goal[];
  meals: null | { plan_id: string; meals: Array<{ id: string; name: string; time: string | null }>; today: string[]; last14: Array<{ day: string; done: number; total: number }> };
  appointments: { next: { starts_at: string; mode: string } | null; last: string | null };
  last_activity_at: string | null;
}

export const TZ = 'America/Sao_Paulo';
export const kg = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
export const liters = (ml: number) => `${(ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`;
export const dayShort = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).replace('.', '');
export const dateTimeBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ });
export const localDay = (iso: string | Date) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });

export interface SeriesPoint { day: string; kg: number; source: 'patient' | 'clinic' }

/** Série do peso: pesagens de casa (a última de cada dia) e do consultório, em ordem de data. */
export function weightSeries(t: Pick<Tracking, 'weight'>): SeriesPoint[] {
  const home = new Map<string, SeriesPoint>();
  for (const l of t.weight.logs) home.set(localDay(l.measured_at), { day: localDay(l.measured_at), kg: l.weight_kg, source: 'patient' });
  const clinic = t.weight.clinic.map((c) => ({ day: c.date, kg: c.weight_kg, source: 'clinic' as const }));
  return [...home.values(), ...clinic].sort((a, b) => a.day.localeCompare(b.day) || (a.source === 'clinic' ? 1 : -1));
}

/** Posição (0 a 1) do IMC na régua de 15 a 40, para o marcador. */
export const bmiPosition = (bmi: number) => Math.min(1, Math.max(0, (bmi - 15) / 25));

/** Faixas da régua do IMC (adulto). */
export const BMI_BANDS = [
  { from: 15, to: 18.5, label: 'Baixo peso' },
  { from: 18.5, to: 25, label: 'Adequado' },
  { from: 25, to: 30, label: 'Sobrepeso' },
  { from: 30, to: 40, label: 'Obesidade' },
] as const;

/** Variação entre a primeira e a última pesagem da série (null com menos de duas). */
export function weightChange(series: SeriesPoint[]): { kg: number; since: string } | null {
  if (series.length < 2) return null;
  const first = series[0]!, last = series.at(-1)!;
  return { kg: Math.round((last.kg - first.kg) * 10) / 10, since: first.day };
}

/** Quanto falta para o peso-alvo (positivo = perder, negativo = ganhar). */
export const toTarget = (current: number | null | undefined, target: number | null | undefined) =>
  current && target ? Math.round((current - target) * 10) / 10 : null;

/** Adesão às refeições nos últimos 14 dias (só dias com plano), em %. */
export function mealAdherence(last14: Array<{ done: number; total: number }>): number | null {
  const total = last14.reduce((s, d) => s + d.total, 0);
  return total ? Math.round((last14.reduce((s, d) => s + Math.min(d.done, d.total), 0) / total) * 100) : null;
}

/** Progresso da meta na semana (diária: dias marcados / 7; semanal: marcados / vezes). */
export function goalProgress(g: Pick<Goal, 'frequency' | 'times_per_week' | 'done_week'>): { done: number; of: number; pct: number } {
  const of = g.frequency === 'weekly' ? (g.times_per_week ?? 1) : 7;
  const done = Math.min(g.done_week, of);
  return { done, of, pct: Math.round((done / of) * 100) };
}

/** Dias sem nenhum registro do paciente (null se nunca registrou). */
export function daysSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 864e5);
}

/** Valor de data e hora para <input type="datetime-local"> no fuso de São Paulo. */
export function localDateTimeValue(d = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "2026-11-28T07:30" (horário de São Paulo, UTC−3, sem horário de verão) → ISO UTC. */
export function fromLocalDateTime(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
