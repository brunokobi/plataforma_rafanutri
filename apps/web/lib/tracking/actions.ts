'use server';

import { revalidatePath } from 'next/cache';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';
import type { Tracking } from './types';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; message: string; field?: string };

type R = Awaited<ReturnType<typeof call>>;
function fail(r: R, fallback = 'Não foi possível salvar agora. Tente de novo.'): { ok: false; message: string; field?: string } {
  if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  const e = r.json?.errors?.[0];
  const fields = e?.extensions?.fields;
  const field = fields ? Object.keys(fields)[0] : undefined;
  return { ok: false, message: (field && fields?.[field]) || e?.message || fallback, field };
}
const cq = (c?: string | null) => (c && isUuid(c) ? `?c=${c}` : '');
const withC = (c: string | null | undefined, body: Record<string, unknown>) => (c && isUuid(c) ? { ...body, c } : body);

// ── Paciente ──────────────────────────────────────────────────────────────────────────────

export async function getMyTracking(c?: string | null): Promise<Tracking | null> {
  const r = await call(`/me/patient/tracking${cq(c)}`, 'GET', undefined, true, {}, 15_000);
  return r.status === 200 ? (r.json?.data as Tracking) : null;
}

export async function logMyWeight(c: string | null, weightKg: string, measuredAt: string | null, note: string): Promise<Result> {
  const r = await call('/me/patient/weight', 'POST', withC(c, { weight_kg: weightKg, measured_at: measuredAt, note }));
  if (r.status === 201) { revalidatePath('/p/acompanhar'); revalidatePath('/p'); return { ok: true }; }
  return fail(r);
}

export async function deleteMyWeight(c: string | null, id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  const r = await call(`/me/patient/weight/${id}${cq(c)}`, 'DELETE');
  if (r.status === 200) { revalidatePath('/p/acompanhar'); return { ok: true }; }
  return fail(r, 'Não foi possível apagar agora.');
}

export async function logMyWater(c: string | null, ml: number): Promise<Result<{ id: string }>> {
  const r = await call('/me/patient/water', 'POST', withC(c, { amount_ml: Math.round(ml) }));
  if (r.status === 201) return { ok: true, data: { id: String(r.json?.data?.id) } };
  return fail(r);
}

export async function undoMyWater(c: string | null, id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  const r = await call(`/me/patient/water/${id}${cq(c)}`, 'DELETE');
  return r.status === 200 ? { ok: true } : fail(r, 'Não foi possível desfazer.');
}

export async function saveWaterReminders(c: string | null, s: { on: boolean; every_min: number; start: string; end: string }): Promise<Result<{ telegram: boolean }>> {
  const r = await call('/me/patient/water/settings', 'PUT', withC(c, s));
  if (r.status === 200) return { ok: true, data: { telegram: r.json?.data?.telegram === true } };
  return fail(r);
}

export async function checkMyGoal(c: string | null, goalId: string, done: boolean, day?: string): Promise<Result> {
  if (!isUuid(goalId)) return { ok: false, message: 'Pedido inválido.' };
  const r = await call(`/me/patient/goals/${goalId}/check`, 'POST', withC(c, { done, ...(day ? { day } : {}) }));
  return r.status === 200 ? { ok: true } : fail(r);
}

export async function checkMyMeal(c: string | null, planId: string, mealId: string, done: boolean): Promise<Result> {
  if (!isUuid(planId)) return { ok: false, message: 'Pedido inválido.' };
  const r = await call('/me/patient/meals/check', 'POST', withC(c, { plan_id: planId, meal_id: mealId, done }));
  return r.status === 200 ? { ok: true } : fail(r);
}

// ── Nutricionista ─────────────────────────────────────────────────────────────────────────

export async function getPatientTracking(patientId: string): Promise<Tracking | null> {
  if (!isUuid(patientId)) return null;
  const r = await call(`/patients/${patientId}/tracking`, 'GET', undefined, true, {}, 15_000);
  return r.status === 200 ? (r.json?.data as Tracking) : null;
}

export async function createGoal(patientId: string, goal: { title: string; details?: string; kind: 'habit' | 'weight'; frequency: 'daily' | 'weekly'; times_per_week?: number | null; target_weight_kg?: string | null }): Promise<Result> {
  if (!isUuid(patientId)) return { ok: false, message: 'Pedido inválido.' };
  const r = await call(`/patients/${patientId}/goals`, 'POST', goal);
  if (r.status === 201) { revalidatePath(`/app/pacientes/${patientId}`); return { ok: true }; }
  return fail(r);
}

export async function archiveGoal(patientId: string, goalId: string): Promise<Result> {
  if (!isUuid(patientId) || !isUuid(goalId)) return { ok: false, message: 'Pedido inválido.' };
  const r = await call(`/patients/${patientId}/goals/${goalId}`, 'DELETE');
  if (r.status === 200) { revalidatePath(`/app/pacientes/${patientId}`); return { ok: true }; }
  return fail(r);
}

export async function setWaterGoal(patientId: string, ml: number | null): Promise<Result> {
  if (!isUuid(patientId)) return { ok: false, message: 'Pedido inválido.' };
  const r = await call(`/patients/${patientId}/water-goal`, 'PUT', { water_goal_ml: ml });
  if (r.status === 200) { revalidatePath(`/app/pacientes/${patientId}`); return { ok: true }; }
  return fail(r);
}
