'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { MaternalData, Result } from './types';

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
