'use server';

import { revalidatePath } from 'next/cache';
import type { PatientRecommendation, Recommendation, RecommendationInput, RecommendationResult, RecommendationStatus } from './types';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';

type Json = null | { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> };

function fail(r: { status: number; json: Json }, fallback: string): RecommendationResult {
  if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  if (r.status === 400) return { ok: false, message: r.json?.errors?.[0]?.message ?? 'Revise os campos.', fields: r.json?.errors?.[0]?.extensions?.fields };
  if (r.status === 404) return { ok: false, message: 'Recomendação ou paciente não encontrado.' };
  if (r.status === 409) return { ok: false, message: r.json?.errors?.[0]?.message ?? fallback };
  return { ok: false, message: fallback };
}
const path = (patientId: string) => `/app/pacientes/${patientId}/recomendacoes`;

// ── Nutricionista ─────────────────────────────────────────────────────────

/** undefined = paciente não encontrado; null = falhou. */
export async function listRecommendations(patientId: string): Promise<Recommendation[] | null | undefined> {
  if (!isUuid(patientId)) return undefined;
  try {
    const r = await call(`/patients/${patientId}/recommendations`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as Recommendation[]) : null;
  } catch {
    return null;
  }
}

/** Cria uma ou várias; `publish` publica todas de uma vez. */
export async function createRecommendations(patientId: string, items: RecommendationInput[], publish: boolean): Promise<RecommendationResult> {
  if (!isUuid(patientId) || !Array.isArray(items) || items.length === 0) return { ok: false, message: 'Nada para salvar.' };
  try {
    const r = await call(`/patients/${patientId}/recommendations`, 'POST', { items, publish: publish === true });
    if (r.status === 201) {
      revalidatePath(path(patientId));
      return { ok: true };
    }
    return fail(r, 'Não foi possível salvar agora.');
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora.' };
  }
}

export async function updateRecommendation(patientId: string, id: string, input: RecommendationInput & { status: RecommendationStatus }): Promise<RecommendationResult> {
  if (!isUuid(patientId) || !isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/recommendations/${id}`, 'PUT', input);
    if (r.status === 200) {
      revalidatePath(path(patientId));
      return { ok: true };
    }
    return fail(r, 'Não foi possível salvar agora.');
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora.' };
  }
}

export async function deleteRecommendation(patientId: string, id: string): Promise<RecommendationResult> {
  if (!isUuid(patientId) || !isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/recommendations/${id}`, 'DELETE');
    if (r.status === 200) {
      revalidatePath(path(patientId));
      return { ok: true };
    }
    return fail(r, 'Não foi possível excluir agora.');
  } catch {
    return { ok: false, message: 'Não foi possível excluir agora.' };
  }
}

// ── Paciente ──────────────────────────────────────────────────────────────

export async function getMyRecommendations(c?: string): Promise<{ patient_id: string | null; recommendations: PatientRecommendation[] } | null> {
  try {
    const r = await call(`/me/patient/recommendations${isUuid(c) ? `?c=${c}` : ''}`);
    return r.status === 200 ? (r.json?.data as { patient_id: string | null; recommendations: PatientRecommendation[] }) : null;
  } catch {
    return null;
  }
}

export async function markRecommendationRead(id: string): Promise<{ read_at: string | null } | null> {
  if (!isUuid(id)) return null;
  try {
    const r = await call(`/me/patient/recommendations/${id}/read`, 'POST');
    return r.status === 200 ? (r.json?.data as { read_at: string | null }) : null;
  } catch {
    return null;
  }
}
