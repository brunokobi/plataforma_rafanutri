'use server';

import { computePlanTotals } from '@rafanutri/nutrition-core';
import { createItem, deleteItem, isDirectusError, updateItem, withToken } from '@directus/sdk';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus } from '@/lib/auth/directus';
import { foodsByIdsRepo } from '@/lib/foods/repository';
import { getPatient } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';
import { getMealPlan } from './repository';
import { DEFAULT_MEALS, DEFAULT_TARGETS, planContentSchema, planFoodIds, type PlanContent } from './schema';

export type PlanActionResult = { ok: true; id?: string } | { ok: false; message: string };

async function authToken() {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

function failure(error: unknown, fallback: string): PlanActionResult {
  if (isDirectusError(error)) {
    const status = error.response?.status;
    const message = error.errors?.[0]?.message ?? '';
    if (/crie uma nova versão|não volta/.test(message)) return { ok: false, message: 'Este plano já foi publicado. Crie uma nova versão para alterar.' };
    if (status === 403) return { ok: false, message: 'Você não tem permissão para alterar planos deste consultório.' };
    if (status === 429) return { ok: false, message: 'Muitas tentativas seguidas. Aguarde um minuto.' };
    console.error('meal_plans: erro do Directus', { status, code: error.errors?.[0]?.extensions?.code });
  } else {
    console.error('meal_plans: erro inesperado', error);
  }
  return { ok: false, message: fallback };
}

function revalidate(patientId: string) {
  revalidatePath(`/app/pacientes/${patientId}`);
  revalidatePath(`/app/pacientes/${patientId}/planos`, 'layout');
}

/** Cria um rascunho: em branco ou como nova versão de um plano existente. */
export async function createMealPlan(patientId: string, fromPlanId?: string): Promise<PlanActionResult> {
  if (!isUuid(patientId) || (fromPlanId !== undefined && !isUuid(fromPlanId))) return { ok: false, message: 'Pedido inválido.' };
  const t = await authToken();
  if (!t) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  const patient = await getPatient(patientId);
  if (!patient?.organization_id) return { ok: false, message: 'Paciente não encontrado.' };

  let base = { title: 'Plano alimentar', mode: 'quantitative', targets: DEFAULT_TARGETS as object, meals: DEFAULT_MEALS as object, guidelines: null as string | null };
  if (fromPlanId) {
    const src = await getMealPlan(patientId, fromPlanId);
    if (!src || src === 'unavailable') return { ok: false, message: 'Plano de origem não encontrado.' };
    base = { title: `${src.title} (nova versão)`.slice(0, 120), mode: src.mode, targets: src.targets, meals: src.meals, guidelines: src.guidelines };
  }
  try {
    const created = await directus().request<{ id: string }>(
      withToken(t, createItem('meal_plans' as never, { organization_id: patient.organization_id, patient_id: patient.id, ...base } as never, { fields: ['id'] } as never)),
    );
    revalidate(patientId);
    return { ok: true, id: created.id };
  } catch (error) {
    return failure(error, 'Não foi possível criar o plano agora.');
  }
}

function validate(content: PlanContent) {
  const parsed = planContentSchema.safeParse(content);
  return parsed.success ? { data: parsed.data, message: null } : { data: null, message: parsed.error.issues[0]?.message ?? 'Plano inválido.' };
}

/** Salva o rascunho (o banco recusa se o plano já foi publicado). */
export async function saveMealPlan(patientId: string, planId: string, content: PlanContent): Promise<PlanActionResult> {
  if (!isUuid(patientId) || !isUuid(planId)) return { ok: false, message: 'Pedido inválido.' };
  const v = validate(content);
  if (!v.data) return { ok: false, message: v.message! };
  const t = await authToken();
  if (!t) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  try {
    await directus().request(withToken(t, updateItem('meal_plans' as never, planId, v.data as never)));
    revalidate(patientId);
    return { ok: true };
  } catch (error) {
    return failure(error, 'Não foi possível salvar o plano agora.');
  }
}

/** Salva e publica. Os totais do dia são recalculados aqui com a composição do banco. */
export async function publishMealPlan(patientId: string, planId: string, content: PlanContent): Promise<PlanActionResult> {
  if (!isUuid(patientId) || !isUuid(planId)) return { ok: false, message: 'Pedido inválido.' };
  const v = validate(content);
  if (!v.data) return { ok: false, message: v.message! };
  if (v.data.meals.every((m) => m.items.length === 0)) return { ok: false, message: 'Adicione alimentos antes de publicar.' };
  const t = await authToken();
  if (!t) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };

  const foods = await foodsByIdsRepo(planFoodIds(v.data.meals));
  if (!foods) return { ok: false, message: 'Não foi possível carregar a composição dos alimentos agora.' };
  const byId = new Map(foods.map((f) => [f.id, f]));
  const totals = computePlanTotals(
    v.data.meals.map((m) => ({ id: m.id, items: m.items.map((i) => ({ quantityG: i.quantityG, per100g: byId.get(i.foodId)?.per100g ?? {} })) })),
  ).day.totals;
  const round = (n?: number) => Math.round((n ?? 0) * 10) / 10;

  try {
    await directus().request(withToken(t, updateItem('meal_plans' as never, planId, v.data as never)));
    await directus().request(
      withToken(
        t,
        updateItem('meal_plans' as never, planId, {
          status: 'published',
          totals: { energy_kcal: round(totals.energy_kcal), protein_g: round(totals.protein_g), carbohydrate_g: round(totals.carbohydrate_g), lipid_g: round(totals.lipid_g), fiber_g: round(totals.fiber_g) },
        } as never),
      ),
    );
    revalidate(patientId);
    return { ok: true };
  } catch (error) {
    return failure(error, 'Não foi possível publicar o plano agora.');
  }
}

/** Apaga um rascunho (publicados e arquivados ficam no histórico). */
export async function deleteMealPlanDraft(patientId: string, planId: string): Promise<PlanActionResult> {
  if (!isUuid(patientId) || !isUuid(planId)) return { ok: false, message: 'Pedido inválido.' };
  const t = await authToken();
  if (!t) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  try {
    await directus().request(withToken(t, deleteItem('meal_plans' as never, planId)));
    revalidate(patientId);
    return { ok: true };
  } catch (error) {
    return failure(error, 'Não foi possível apagar o rascunho agora.');
  }
}
