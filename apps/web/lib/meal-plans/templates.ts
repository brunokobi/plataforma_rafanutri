import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus, directusErrorInfo } from '@/lib/auth/directus';
import type { PlanMeal, PlanMode, PlanTargets } from './schema';

export interface MealPlanTemplate {
  id: string;
  organization_id: string | null; // null = biblioteca da plataforma
  name: string;
  description: string | null;
  tags: string[];
  mode: PlanMode;
  targets: Partial<PlanTargets>;
  meals: PlanMeal[];
  guidelines: string | null;
  energy_kcal: number | null;
  date_created: string;
}

const FIELDS = ['id', 'organization_id', 'name', 'description', 'tags', 'mode', 'targets', 'meals', 'guidelines', 'energy_kcal', 'date_created'];

/** Modelos de plano do consultório + biblioteca da plataforma. `unavailable` enquanto a coleção não estiver liberada. */
export async function listPlanTemplates(): Promise<MealPlanTemplate[] | null | 'unavailable'> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const rows = await directus().request<MealPlanTemplate[]>(
      withToken(token, readItems('meal_plan_templates' as never, { fields: FIELDS, sort: ['name'], limit: 300 } as never)),
    );
    return rows.map((r) => ({ ...r, energy_kcal: r.energy_kcal === null ? null : Number(r.energy_kcal) }));
  } catch (error) {
    const info = directusErrorInfo(error);
    if (info.status === 403) return 'unavailable';
    console.error('meal_plan_templates: falha ao listar', info);
    return null;
  }
}

export async function getPlanTemplate(id: string): Promise<MealPlanTemplate | null | undefined> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const rows = await directus().request<MealPlanTemplate[]>(
      withToken(token, readItems('meal_plan_templates' as never, { fields: FIELDS, filter: { id: { _eq: id } }, limit: 1 } as never)),
    );
    const r = rows[0];
    return r ? { ...r, energy_kcal: r.energy_kcal === null ? null : Number(r.energy_kcal) } : undefined;
  } catch (error) {
    console.error('meal_plan_templates: falha ao ler', directusErrorInfo(error));
    return null;
  }
}
