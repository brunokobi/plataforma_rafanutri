'use server';

import { revalidatePath } from 'next/cache';
import { SCREENING_TOOLS, type ScreeningCode } from '@rafanutri/nutrition-core';
import type { Overview, ScreeningData } from './types';
import { call } from '@/lib/directus/rafanutri';
import { isUuid as isId } from '@/lib/validation/ids';



/** Triagens do paciente e dados de apoio. undefined: paciente não existe; null: falha. */
export async function getScreenings(patientId: string): Promise<ScreeningData | null | undefined> {
  if (!isId(patientId)) return undefined;
  try {
    const r = await call(`/patients/${patientId}/screenings`, 'GET');
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as ScreeningData) : null;
  } catch {
    return null;
  }
}

export type SaveResult = { ok: true } | { ok: false; message: string; fields?: Record<string, string> };

/** Calcula no servidor (nutrition-core) e grava. As respostas vêm do formulário guiado. */
export async function saveScreening(patientId: string, tool: ScreeningCode, answers: Record<string, unknown>, notes: string | null): Promise<SaveResult> {
  if (!isId(patientId) || !Object.hasOwn(SCREENING_TOOLS, tool)) return { ok: false, message: 'Pedido inválido.' };
  const t = SCREENING_TOOLS[tool] as { version: string; validate: (a: unknown) => Record<string, string>; evaluate: (a: unknown) => { score: number | null; classification: string; risk: string } };
  const errors = t.validate(answers);
  if (Object.keys(errors).length) return { ok: false, message: Object.values(errors)[0]!, fields: errors };
  const result = t.evaluate(answers);
  try {
    const r = await call(`/patients/${patientId}/screenings`, 'POST', {
      tool, tool_version: t.version, answers, score: result.score, classification: result.classification, risk_level: result.risk, notes,
    });
    if (r.status === 201) {
      revalidatePath(`/app/pacientes/${patientId}/triagens`);
      revalidatePath('/app/saude-publica');
      return { ok: true };
    }
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    const e = r.json?.errors?.[0];
    return { ok: false, message: e?.message ?? 'Não foi possível salvar a triagem agora.', fields: e?.extensions?.fields };
  } catch {
    return { ok: false, message: 'Não foi possível salvar a triagem agora.' };
  }
}

export async function getPublicHealthOverview(): Promise<Overview | null> {
  try {
    const r = await call('/public-health/overview', 'GET');
    return r.status === 200 ? (r.json?.data as Overview) : null;
  } catch {
    return null;
  }
}
