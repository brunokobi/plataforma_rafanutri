'use server';

import { revalidatePath } from 'next/cache';
import type { NcSeverity } from '@/lib/uan/checklists';
import type { NcBoard, NcDetail } from '@/lib/uan/nonconformities';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';

type Json = { data?: unknown; errors?: Array<{ message: string; extensions?: { code?: string; fields?: Record<string, string> } }> } | null;

const FAIL = 'Sem conexão com o servidor. Tente de novo em instantes.';
export type Result = { ok: true; id?: string } | { ok: false; message: string; fields?: Record<string, string> };
const fail = (r: { status: number; json: Json }, fallback: string): Result => ({
  ok: false,
  message: r.status === 401 ? 'Sua sessão expirou. Entre novamente.' : (r.json?.errors?.[0]?.message ?? fallback),
  fields: r.json?.errors?.[0]?.extensions?.fields,
});
const okImage = (s: unknown) => typeof s === 'string' && s.startsWith('data:image/') && s.length <= 900_000;

export async function getNcBoard(unitId: string): Promise<NcBoard | null | undefined> {
  if (!isUuid(unitId)) return undefined;
  try {
    const r = await call(`/uan/units/${unitId}/non-conformities`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as NcBoard) : null;
  } catch {
    return null;
  }
}

export async function getNc(id: string): Promise<NcDetail | null | undefined> {
  if (!isUuid(id)) return undefined;
  try {
    const r = await call(`/uan/non-conformities/${id}`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as NcDetail) : null;
  } catch {
    return null;
  }
}

export async function openNc(unitId: string, input: { title: string; description: string; severity: NcSeverity; image: string | null }): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  if (input.image !== null && !okImage(input.image)) return { ok: false, message: 'Foto inválida.' };
  try {
    const r = await call(`/uan/units/${unitId}/non-conformities`, 'POST', { ...input, description: input.description.trim() || null });
    if (r.status !== 201) return fail(r, 'Não foi possível registrar.');
    revalidatePath(`/app/uan/unidades/${unitId}`, 'layout');
    return { ok: true, id: (r.json?.data as { id: string }).id };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export interface PlanInput {
  what: string;
  why: string;
  where: string;
  due_date: string;
  who_user: string | null;
  who_text: string;
  how: string;
  how_much: string;
}

export async function addPlan(ncId: string, input: PlanInput): Promise<Result> {
  if (!isUuid(ncId)) return { ok: false, message: 'Não conformidade inválida.' };
  try {
    const r = await call(`/uan/non-conformities/${ncId}/plans`, 'POST', { ...input, who_user: input.who_user || null });
    if (r.status !== 201) return fail(r, 'Não foi possível salvar o plano.');
    revalidatePath(`/app/uan/nao-conformidades/${ncId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function completePlan(ncId: string, planId: string, note: string): Promise<Result> {
  if (!isUuid(planId)) return { ok: false, message: 'Plano inválido.' };
  try {
    const r = await call(`/uan/action-plans/${planId}/done`, 'POST', { note });
    if (r.status !== 200) return fail(r, 'Não foi possível concluir.');
    revalidatePath(`/app/uan/nao-conformidades/${ncId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function deletePlan(ncId: string, planId: string): Promise<Result> {
  if (!isUuid(planId)) return { ok: false, message: 'Plano inválido.' };
  try {
    const r = await call(`/uan/action-plans/${planId}`, 'DELETE');
    if (r.status !== 200) return fail(r, 'Não foi possível apagar.');
    revalidatePath(`/app/uan/nao-conformidades/${ncId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function closeNc(ncId: string, note: string, image: string | null): Promise<Result> {
  if (!isUuid(ncId)) return { ok: false, message: 'Não conformidade inválida.' };
  if (!image) return { ok: false, message: 'Anexe a foto da evidência para fechar.', fields: { image: 'Anexe a foto da evidência para fechar.' } };
  if (!okImage(image)) return { ok: false, message: 'Foto inválida.' };
  try {
    const r = await call(`/uan/non-conformities/${ncId}/close`, 'POST', { note, image });
    if (r.status !== 200) return fail(r, 'Não foi possível fechar.');
    revalidatePath(`/app/uan/nao-conformidades/${ncId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: FAIL };
  }
}
