import { addDays, localDate } from '@/lib/appointments/schema';

export interface DashPatient {
  id: string;
  full_name: string;
  birth_date: string | null;
  status: string;
}
export interface DashAppointment {
  patient_id: string;
  starts_at: string;
  status: string;
}

/** Aniversariantes nos próximos `days` dias a partir de hoje (inclui hoje; vira o ano). Só pacientes ativos. */
export function birthdaysAhead(patients: DashPatient[], today: string, days = 7): Array<DashPatient & { date: string; age: number }> {
  const window = Array.from({ length: days }, (_, i) => addDays(today, i));
  const out: Array<DashPatient & { date: string; age: number }> = [];
  for (const p of patients) {
    if (p.status !== 'active' || !p.birth_date) continue;
    const md = p.birth_date.slice(5); // MM-DD
    // 29/02 em ano não bissexto: comemora em 28/02
    const hit = window.find((d) => d.slice(5) === md || (md === '02-29' && d.slice(5) === '02-28' && !isLeap(Number(d.slice(0, 4)))));
    if (hit) out.push({ ...p, date: hit, age: Number(hit.slice(0, 4)) - Number(p.birth_date.slice(0, 4)) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.full_name.localeCompare(b.full_name, 'pt-BR'));
}
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Pacientes ativos cuja última consulta concluída foi há mais de `days` dias e que não têm
 * consulta futura marcada. Quem nunca teve consulta concluída não entra (ainda não é retorno).
 */
export function withoutReturn(
  patients: DashPatient[],
  appointments: DashAppointment[],
  now: Date,
  days = 60,
): Array<DashPatient & { lastVisit: string; daysSince: number }> {
  const nowMs = now.getTime();
  const last = new Map<string, number>();
  const hasFuture = new Set<string>();
  for (const a of appointments) {
    const t = Date.parse(a.starts_at);
    if (a.status === 'completed' && t <= nowMs) last.set(a.patient_id, Math.max(last.get(a.patient_id) ?? 0, t));
    if ((a.status === 'scheduled' || a.status === 'confirmed') && t > nowMs) hasFuture.add(a.patient_id);
  }
  const out: Array<DashPatient & { lastVisit: string; daysSince: number }> = [];
  for (const p of patients) {
    const t = last.get(p.id);
    if (p.status !== 'active' || t === undefined || hasFuture.has(p.id)) continue;
    const daysSince = Math.floor((nowMs - t) / 86_400_000);
    if (daysSince > days) out.push({ ...p, lastVisit: localDate(new Date(t).toISOString()), daysSince });
  }
  return out.sort((a, b) => b.daysSince - a.daysSince);
}
