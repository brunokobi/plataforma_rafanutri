import type { PatientMealSummary } from './types';

/** Minutos desde a meia-noite em Brasília (UTC-3, sem horário de verão). */
export function brasiliaMinutes(now: Date): number {
  const m = (now.getUTCHours() * 60 + now.getUTCMinutes() - 180 + 1440) % 1440;
  return m;
}

const toMin = (hhmm: string | null): number | null => {
  const m = hhmm ? /^(\d{1,2}):(\d{2})/.exec(hhmm) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Refeição do momento: a última cujo horário já chegou (até 90 min depois) ou, se nenhuma está em curso,
 * a próxima do dia. Depois da última refeição, mostra a primeira do dia seguinte.
 */
export function mealOfTheMoment(meals: PatientMealSummary[], now: Date): { meal: PatientMealSummary; when: 'now' | 'next' } | null {
  const timed = meals.map((meal) => ({ meal, t: toMin(meal.time) })).filter((x): x is { meal: PatientMealSummary; t: number } => x.t !== null).sort((a, b) => a.t - b.t);
  if (!timed.length) return meals[0] ? { meal: meals[0], when: 'next' } : null;
  const n = brasiliaMinutes(now);
  const current = [...timed].reverse().find((x) => x.t <= n && n - x.t <= 90);
  if (current) return { meal: current.meal, when: 'now' };
  const next = timed.find((x) => x.t > n) ?? timed[0]!;
  return { meal: next.meal, when: 'next' };
}
