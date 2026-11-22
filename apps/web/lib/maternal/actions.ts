'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { FeedingKind, MaternalData, MyMaternal, Result } from './types';

type Json = null | { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> };

const isId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

async function call(path: string, method: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { status: 401, json: null };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function send(patientId: string, path: string, method: string, body: unknown, fallback: string): Promise<Result<{ id?: string }>> {
  if (!isId(patientId)) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/patients/${patientId}${path}`, method, body);
    if (r.status === 200 || r.status === 201) {
      revalidatePath(`/app/pacientes/${patientId}/materno-infantil`);
      return { ok: true, data: (r.json?.data ?? {}) as { id?: string } };
    }
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    const e = r.json?.errors?.[0];
    return { ok: false, message: e?.message ?? fallback, fields: e?.extensions?.fields };
  } catch {
    return { ok: false, message: fallback };
  }
}

/** Dados do módulo para a ficha. Null se falhar; undefined se o paciente não existe. */
export async function getMaternalData(patientId: string): Promise<MaternalData | null | undefined> {
  if (!isId(patientId)) return undefined;
  try {
    const r = await call(`/patients/${patientId}/maternal`, 'GET');
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as MaternalData) : null;
  } catch {
    return null;
  }
}

export interface MeasurementInput {
  assessed_at: string;
  weight_kg: number | null;
  height_cm: number | null;
  head_circumference_cm: number | null;
  measured_lying: boolean | null;
  notes?: string | null;
}

export async function addMaternalMeasurement(patientId: string, input: MeasurementInput) {
  return send(patientId, '/maternal/measurements', 'POST', input, 'Não foi possível salvar a medida agora.');
}

export async function openPregnancy(patientId: string, input: { lmp_date: string; pre_pregnancy_weight_kg: number; height_cm: number; notes?: string | null }) {
  return send(patientId, '/pregnancies', 'POST', input, 'Não foi possível abrir o acompanhamento agora.');
}

export async function updatePregnancy(patientId: string, pregnancyId: string, input: Record<string, unknown>) {
  if (!isId(pregnancyId)) return { ok: false as const, message: 'Pedido inválido.' };
  return send(patientId, `/pregnancies/${pregnancyId}`, 'PUT', input, 'Não foi possível salvar agora.');
}

const isCode = (s: unknown): s is string => typeof s === 'string' && /^[a-z_]{2,30}$/.test(s);

export async function createLactation(patientId: string, input: { started_on: string; feeding_type: string; baby_patient_id?: string | null; notes?: string | null }) {
  return send(patientId, '/lactations', 'POST', input, 'Não foi possível registrar a lactação agora.');
}

export async function updateLactation(patientId: string, lactationId: string, input: Record<string, unknown>) {
  if (!isId(lactationId)) return { ok: false as const, message: 'Pedido inválido.' };
  return send(patientId, `/lactations/${lactationId}`, 'PUT', input, 'Não foi possível salvar a lactação agora.');
}

export async function saveFeeding(patientId: string, kind: FeedingKind, item: string, input: { introduced_on: string; reaction?: string; notes?: string | null }) {
  if (!isCode(item) || (kind !== 'allergen' && kind !== 'texture')) return { ok: false as const, message: 'Pedido inválido.' };
  return send(patientId, `/feeding/${kind}/${item}`, 'PUT', input, 'Não foi possível salvar agora.');
}

export async function deleteFeeding(patientId: string, kind: FeedingKind, item: string) {
  if (!isCode(item) || (kind !== 'allergen' && kind !== 'texture')) return { ok: false as const, message: 'Pedido inválido.' };
  return send(patientId, `/feeding/${kind}/${item}`, 'DELETE', undefined, 'Não foi possível apagar agora.');
}

export async function createGuardian(patientId: string, input: Record<string, unknown>) {
  return send(patientId, '/guardians', 'POST', input, 'Não foi possível cadastrar o responsável agora.');
}

export async function updateGuardian(patientId: string, guardianId: string, input: Record<string, unknown>) {
  if (!isId(guardianId)) return { ok: false as const, message: 'Pedido inválido.' };
  return send(patientId, `/guardians/${guardianId}`, 'PUT', input, 'Não foi possível salvar o responsável agora.');
}

export async function deleteGuardian(patientId: string, guardianId: string) {
  if (!isId(guardianId)) return { ok: false as const, message: 'Pedido inválido.' };
  return send(patientId, `/guardians/${guardianId}`, 'DELETE', undefined, 'Não foi possível remover agora.');
}

// ── App do paciente (RN-117) ─────────────────────────────────────────────────────────────────

/** Acompanhamento materno-infantil da conta (o paciente ou o filho do responsável). Null se falhar. */
export async function getMyMaternal(recordId?: string): Promise<MyMaternal | null> {
  try {
    const q = recordId && isId(recordId) ? `?c=${recordId}` : '';
    const r = await call(`/me/patient/maternal${q}`, 'GET');
    return r.status === 200 ? (r.json?.data as MyMaternal) : null;
  } catch {
    return null;
  }
}

/** O responsável registra pelo app a introdução de um alergênico ou de uma textura. */
export async function saveMyFeeding(recordId: string, kind: FeedingKind, item: string, input: { introduced_on: string; reaction?: string; notes?: string | null }): Promise<Result> {
  if (!isId(recordId) || !isCode(item) || (kind !== 'allergen' && kind !== 'texture')) return { ok: false, message: 'Pedido inválido.' };
  try {
    const r = await call(`/me/patient/feeding/${kind}/${item}?c=${recordId}`, 'PUT', input);
    if (r.status === 200) {
      revalidatePath('/p/acompanhamento');
      return { ok: true, data: r.json?.data };
    }
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    const e = r.json?.errors?.[0];
    return { ok: false, message: e?.message ?? 'Não foi possível salvar agora.', fields: e?.extensions?.fields };
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora.' };
  }
}

export type MaternalOverview =
  | { allowed: false }
  | {
      allowed: true;
      children: Array<{ id: string; full_name: string; sex: 'female' | 'male' | null; birth_date: string }>;
      pregnancies: Array<{ id: string; full_name: string; lmp_date: string }>;
      lactations: Array<{ id: string; full_name: string; started_on: string; feeding_type: string; baby_name: string | null }>;
      reactions: Array<{ id: string; full_name: string; item: string; reaction: 'moderate' | 'severe'; introduced_on: string; by_guardian: boolean }>;
    };

/** Entrada do módulo materno-infantil. Null se falhar. */
export async function getMaternalOverview(): Promise<MaternalOverview | null> {
  try {
    const r = await call('/maternal/overview', 'GET');
    return r.status === 200 ? (r.json?.data as MaternalOverview) : null;
  } catch {
    return null;
  }
}
