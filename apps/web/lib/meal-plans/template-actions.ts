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
import { parseTags, scaleFactor, scaleMeals } from './scale';
import { DEFAULT_TARGETS, planFoodIds, type PlanMeal } from './schema';
import { getPlanTemplate } from './templates';

export type TemplateResult = { ok: true; id?: string } | { ok: false; message: string };

function failure(error: unknown, fallback: string): TemplateResult {
  if (isDirectusError(error)) {
    const status = error.response?.status;
    const message = error.errors?.[0]?.message ?? '';
    if (/Etiqueta muito longa/.test(message)) return { ok: false, message: 'Cada etiqueta pode ter até 30 caracteres.' };
    if (status === 403) return { ok: false, message: 'Você não tem permissão para alterar este modelo. Modelos da biblioteca só podem ser aplicados.' };
    if (status === 429) return { ok: false, message: 'Muitas tentativas seguidas. Aguarde um minuto.' };
    console.error('meal_plan_templates: erro do Directus', { status, code: error.errors?.[0]?.extensions?.code });
  } else {
    console.error('meal_plan_templates: erro inesperado', error);
  }
  return { ok: false, message: fallback };
}

async function authToken() {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

/** Energia total do dia de um conjunto de refeições, com a composição do banco. */
async function energyOf(meals: PlanMeal[]): Promise<number | null> {
  const foods = await foodsByIdsRepo(planFoodIds(meals));
  if (!foods) return null;
  const byId = new Map(foods.map((f) => [f.id, f]));
  const totals = computePlanTotals(meals.map((m) => ({ id: m.id, items: m.items.map((i) => ({ quantityG: i.quantityG, per100g: byId.get(i.foodId)?.per100g ?? {} })) }))).day.totals;
  return totals.energy_kcal ? Math.round(totals.energy_kcal * 10) / 10 : null;
}

/** Salva o conteúdo de um plano do paciente como modelo do consultório. */
export async function saveAsTemplate(patientId: string, planId: string, input: { name: string; description?: string; tags?: string }): Promise<TemplateResult> {
  if (!isUuid(patientId) || !isUuid(planId)) return { ok: false, message: 'Pedido inválido.' };
  const name = (input?.name ?? '').trim();
  if (name.length < 2 || name.length > 120) return { ok: false, message: 'Dê um nome ao modelo (2 a 120 caracteres).' };
  const t = await authToken();
  if (!t) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  const [patient, plan] = await Promise.all([getPatient(patientId), getMealPlan(patientId, planId)]);
  if (!patient?.organization_id || !plan || plan === 'unavailable') return { ok: false, message: 'Plano não encontrado.' };
  if (plan.meals.every((m) => m.items.length === 0)) return { ok: false, message: 'O plano está vazio: adicione alimentos antes de salvar como modelo.' };

  try {
    const created = await directus().request<{ id: string }>(
      withToken(
        t,
        createItem('meal_plan_templates' as never, {
          organization_id: patient.organization_id,
          source_plan_id: plan.id,
          name,
          description: input.description?.trim().slice(0, 500) || null,
          tags: parseTags(input.tags ?? ''),
          mode: plan.mode,
          targets: plan.targets,
          meals: plan.meals,
          guidelines: plan.guidelines,
          energy_kcal: await energyOf(plan.meals),
        } as never, { fields: ['id'] } as never),
      ),
    );
    revalidatePath('/app/modelos-de-plano');
    return { ok: true, id: created.id };
  } catch (error) {
    return failure(error, 'Não foi possível salvar o modelo agora.');
  }
}

/**
 * Cria um rascunho de plano para o paciente a partir de um modelo. Com `targetKcal`, as
 * quantidades são escaladas proporcionalmente (e arredondadas) para a meta.
 */
export async function applyTemplate(patientId: string, templateId: string, targetKcal?: number | null): Promise<TemplateResult> {
  if (!isUuid(patientId) || !isUuid(templateId)) return { ok: false, message: 'Pedido inválido.' };
  if (targetKcal != null && !(Number.isFinite(targetKcal) && targetKcal >= 600 && targetKcal <= 6000)) {
    return { ok: false, message: 'A meta deve ficar entre 600 e 6.000 kcal.' };
  }
  const t = await authToken();
  if (!t) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  const [patient, template] = await Promise.all([getPatient(patientId), getPlanTemplate(templateId)]);
  if (!patient?.organization_id) return { ok: false, message: 'Paciente não encontrado.' };
  if (!template) return { ok: false, message: 'Modelo não encontrado.' };

  const factor = targetKcal ? scaleFactor(template.energy_kcal, targetKcal) : null;
  const meals = factor ? scaleMeals(template.meals, factor) : template.meals;
  const targets = { ...DEFAULT_TARGETS, ...template.targets, ...(targetKcal ? { manualKcal: Math.round(targetKcal) } : {}) };
  const title = `${template.name}${factor ? ` (${Math.round(targetKcal!).toLocaleString('pt-BR')} kcal)` : ''}`.slice(0, 120);
  try {
    const created = await directus().request<{ id: string }>(
      withToken(
        t,
        createItem('meal_plans' as never, {
          organization_id: patient.organization_id,
          patient_id: patient.id,
          title,
          mode: template.mode,
          targets,
          meals,
          guidelines: template.guidelines,
        } as never, { fields: ['id'] } as never),
      ),
    );
    revalidatePath(`/app/pacientes/${patientId}/planos`, 'layout');
    return { ok: true, id: created.id };
  } catch (error) {
    return failure(error, 'Não foi possível criar o plano a partir do modelo agora.');
  }
}

export async function updateTemplateInfo(id: string, input: { name: string; description?: string; tags?: string }): Promise<TemplateResult> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  const name = (input?.name ?? '').trim();
  if (name.length < 2 || name.length > 120) return { ok: false, message: 'Dê um nome ao modelo (2 a 120 caracteres).' };
  const t = await authToken();
  if (!t) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  try {
    await directus().request(
      withToken(t, updateItem('meal_plan_templates' as never, id, { name, description: input.description?.trim().slice(0, 500) || null, tags: parseTags(input.tags ?? '') } as never)),
    );
    revalidatePath('/app/modelos-de-plano');
    return { ok: true };
  } catch (error) {
    return failure(error, 'Não foi possível salvar agora.');
  }
}

export async function deletePlanTemplate(id: string): Promise<TemplateResult> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  const t = await authToken();
  if (!t) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  try {
    // Planos já criados a partir do modelo são cópias: apagar o modelo não os afeta.
    await directus().request(withToken(t, deleteItem('meal_plan_templates' as never, id)));
    revalidatePath('/app/modelos-de-plano');
    return { ok: true };
  } catch (error) {
    return failure(error, 'Não foi possível apagar agora.');
  }
}
