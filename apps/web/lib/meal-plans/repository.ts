import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus, directusErrorInfo } from '@/lib/auth/directus';
import type { MealPlanRow, MealPlanSummary } from './schema';

const SUMMARY = ['id', 'title', 'status', 'mode', 'published_at', 'valid_until', 'date_created', 'date_updated', 'totals'];

async function token() {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

/** Planos do paciente (mais recentes primeiro). `unavailable` enquanto a coleção não estiver liberada. */
export async function listMealPlans(patientId: string): Promise<MealPlanSummary[] | null | 'unavailable'> {
  const t = await token();
  if (!t) return null;
  try {
    return await directus().request<MealPlanSummary[]>(
      withToken(t, readItems('meal_plans' as never, { fields: SUMMARY, filter: { patient_id: { _eq: patientId } }, sort: ['-date_created'], limit: 100 } as never)),
    );
  } catch (error) {
    const info = directusErrorInfo(error);
    if (info.status === 403) return 'unavailable';
    console.error('meal_plans: falha ao listar', info);
    return null;
  }
}

/** Um plano completo do paciente. `undefined` = não existe (ou não é do paciente/consultório). */
export async function getMealPlan(patientId: string, planId: string): Promise<MealPlanRow | null | undefined | 'unavailable'> {
  const t = await token();
  if (!t) return null;
  try {
    const rows = await directus().request<MealPlanRow[]>(
      withToken(
        t,
        readItems('meal_plans' as never, {
          fields: [...SUMMARY, 'patient_id', 'targets', 'meals', 'guidelines'],
          filter: { _and: [{ id: { _eq: planId } }, { patient_id: { _eq: patientId } }] },
          limit: 1,
        } as never),
      ),
    );
    return rows[0];
  } catch (error) {
    const info = directusErrorInfo(error);
    if (info.status === 403) return 'unavailable';
    console.error('meal_plans: falha ao ler', info);
    return null;
  }
}
