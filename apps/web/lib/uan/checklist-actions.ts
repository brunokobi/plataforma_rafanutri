'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { AnswerValue, ChecklistAnswer, ChecklistCategory, Frequency, RunDetail, RunSummary, TemplateDetail, UnitChecklists } from '@/lib/uan/checklists';

type Json = { data?: unknown; errors?: Array<{ message: string; extensions?: { code?: string; fields?: Record<string, string> } }> } | null;

async function call(path: string, method = 'GET', body?: unknown): Promise<{ status: number; json: Json }> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { status: 401, json: null };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Json };
}
const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const errMsg = (r: { status: number; json: Json }, fallback: string) =>
  r.status === 401 ? 'Sua sessão expirou. Entre novamente.' : (r.json?.errors?.[0]?.message ?? fallback);
const FAIL = 'Sem conexão com o servidor. Tente de novo em instantes.';

/** Modelos, últimas execuções e não conformidades abertas da unidade; undefined = sem acesso; null = falha. */
export async function getUnitChecklists(unitId: string): Promise<UnitChecklists | null | undefined> {
  if (!isUuid(unitId)) return undefined;
  try {
    const r = await call(`/uan/units/${unitId}/checklists`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as UnitChecklists) : null;
  } catch {
    return null;
  }
}

export async function getChecklistRun(runId: string): Promise<RunDetail | null | undefined> {
  if (!isUuid(runId)) return undefined;
  try {
    const r = await call(`/uan/checklist-runs/${runId}`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as RunDetail) : null;
  } catch {
    return null;
  }
}

export async function startChecklist(
  unitId: string,
  templateId: string,
  clientId: string,
  geo: { lat: number; lng: number; accuracy: number } | null,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!isUuid(unitId) || !isUuid(templateId) || !isUuid(clientId)) return { ok: false, message: 'Checklist inválido.' };
  try {
    const r = await call(`/uan/units/${unitId}/checklist-runs`, 'POST', {
      template_id: templateId,
      client_id: clientId,
      ...(geo ? { geo_lat: geo.lat, geo_lng: geo.lng, geo_accuracy_m: geo.accuracy } : {}),
    });
    if (r.status === 201) {
      revalidatePath(`/app/uan/unidades/${unitId}`);
      return { ok: true, id: (r.json?.data as { id: string }).id };
    }
    return { ok: false, message: errMsg(r, 'Não foi possível iniciar o checklist.') };
  } catch {
    return { ok: false, message: FAIL };
  }
}

type SavedAnswer = Pick<ChecklistAnswer, 'position' | 'value' | 'number_value' | 'comment' | 'has_photo'>;
export type AnswerResult = { ok: true; answer: SavedAnswer } | { ok: false; message: string };

export async function saveAnswer(
  runId: string,
  position: number,
  input: { value?: AnswerValue; number_value?: number | null; comment?: string | null },
): Promise<AnswerResult> {
  if (!isUuid(runId) || !Number.isInteger(position)) return { ok: false, message: 'Item inválido.' };
  try {
    const r = await call(`/uan/checklist-runs/${runId}/answers/${position}`, 'PUT', input);
    if (r.status === 200) return { ok: true, answer: r.json?.data as SavedAnswer };
    return { ok: false, message: errMsg(r, 'Não foi possível salvar a resposta.') };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function saveAnswerPhoto(runId: string, position: number, image: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isUuid(runId) || !Number.isInteger(position) || typeof image !== 'string' || !image.startsWith('data:image/') || image.length > 900_000) {
    return { ok: false, message: 'Foto inválida.' };
  }
  try {
    const r = await call(`/uan/checklist-runs/${runId}/answers/${position}/photo`, 'POST', { image });
    return r.status === 200 ? { ok: true } : { ok: false, message: errMsg(r, 'Não foi possível salvar a foto.') };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function completeChecklist(runId: string): Promise<{ ok: true; run: RunSummary & { non_conformities_opened: number } } | { ok: false; message: string }> {
  if (!isUuid(runId)) return { ok: false, message: 'Checklist inválido.' };
  try {
    const r = await call(`/uan/checklist-runs/${runId}/complete`, 'POST', {});
    if (r.status === 200) {
      const run = r.json?.data as RunSummary & { non_conformities_opened: number };
      revalidatePath(`/app/uan/unidades/${run.unit_id}`);
      revalidatePath(`/app/uan/checklists/${runId}`);
      return { ok: true, run };
    }
    return { ok: false, message: errMsg(r, 'Não foi possível concluir o checklist.') };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function cancelChecklist(runId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isUuid(runId)) return { ok: false, message: 'Checklist inválido.' };
  try {
    const r = await call(`/uan/checklist-runs/${runId}/cancel`, 'POST', {});
    return r.status === 200 ? { ok: true } : { ok: false, message: errMsg(r, 'Não foi possível cancelar.') };
  } catch {
    return { ok: false, message: FAIL };
  }
}

// ── Editor de modelos e agenda (RN-147, RN-150) ──────────────────────────

export async function copyTemplate(unitId: string, templateId: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!isUuid(unitId) || !isUuid(templateId)) return { ok: false, message: 'Modelo inválido.' };
  try {
    const r = await call(`/uan/units/${unitId}/checklist-templates/copy`, 'POST', { template_id: templateId });
    if (r.status !== 201) return { ok: false, message: errMsg(r, 'Não foi possível copiar o modelo.') };
    revalidatePath(`/app/uan/unidades/${unitId}`);
    return { ok: true, id: (r.json?.data as { id: string }).id };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function getTemplate(id: string): Promise<TemplateDetail | null | undefined> {
  if (!isUuid(id)) return undefined;
  try {
    const r = await call(`/uan/checklist-templates/${id}`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as TemplateDetail) : null;
  } catch {
    return null;
  }
}

export interface TemplateSave {
  name: string;
  description: string;
  category: ChecklistCategory;
  frequency_hint: Frequency;
  active: boolean;
  items: Array<{ section: string; prompt: string; help: string; kind: 'compliance' | 'number'; unit: string; min_value: string; max_value: string; critical: boolean }>;
}

export async function saveTemplate(id: string, input: TemplateSave): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isUuid(id)) return { ok: false, message: 'Modelo inválido.' };
  const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null);
  try {
    const r = await call(`/uan/checklist-templates/${id}`, 'PUT', {
      ...input,
      items: input.items.map((i) => ({ ...i, min_value: num(i.min_value), max_value: num(i.max_value) })),
    });
    if (r.status !== 200) {
      const fields = r.json?.errors?.[0]?.extensions?.fields;
      return { ok: false, message: (fields && Object.values(fields)[0]) || errMsg(r, 'Não foi possível salvar o modelo.') };
    }
    revalidatePath(`/app/uan/modelos/${id}`);
    return { ok: true };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function addSchedule(unitId: string, input: { template_id: string; weekdays: number[]; at_time: string; tolerance_minutes: number }): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isUuid(unitId) || !isUuid(input.template_id)) return { ok: false, message: 'Agenda inválida.' };
  try {
    const r = await call(`/uan/units/${unitId}/checklist-schedules`, 'POST', input);
    if (r.status !== 201) {
      const fields = r.json?.errors?.[0]?.extensions?.fields;
      return { ok: false, message: (fields && Object.values(fields)[0]) || errMsg(r, 'Não foi possível agendar.') };
    }
    revalidatePath(`/app/uan/unidades/${unitId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function removeSchedule(unitId: string, scheduleId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isUuid(scheduleId)) return { ok: false, message: 'Agenda inválida.' };
  try {
    const r = await call(`/uan/checklist-schedules/${scheduleId}`, 'DELETE');
    if (r.status !== 200) return { ok: false, message: errMsg(r, 'Não foi possível remover.') };
    revalidatePath(`/app/uan/unidades/${unitId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: FAIL };
  }
}

// ── Painel de conformidade (RN-165) ──────────────────────────────────────

export async function getCompliance(days = 30): Promise<import('@/lib/uan/compliance').ComplianceData | null> {
  try {
    const r = await call(`/uan/compliance?days=${Math.min(90, Math.max(7, Math.round(days)))}`);
    return r.status === 200 ? (r.json?.data as import('@/lib/uan/compliance').ComplianceData) : null;
  } catch {
    return null;
  }
}
