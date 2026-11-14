'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { Board, CrmResult, LeadInput, Metrics, Returns } from './types';

type Json = null | { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> };

async function call(path: string, method = 'GET', body?: unknown): Promise<{ status: number; json: Json }> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { status: 401, json: null };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await call(path);
    return r.status === 200 ? (r.json?.data as T) : null;
  } catch {
    return null;
  }
}
async function mutate(path: string, method: string, body: unknown, fallback: string): Promise<CrmResult & { data?: unknown }> {
  try {
    const r = await call(path, method, body);
    if (r.status === 200 || r.status === 201) {
      revalidatePath('/app/crm');
      return { ok: true, data: r.json?.data };
    }
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    const e = r.json?.errors?.[0];
    return { ok: false, message: (e?.extensions?.fields ? Object.values(e.extensions.fields)[0] : null) ?? e?.message ?? fallback };
  } catch {
    return { ok: false, message: fallback };
  }
}

export async function getBoard(): Promise<Board | null> {
  return get<Board>('/crm/board');
}
export async function getReturns(window: string): Promise<Returns | null> {
  return get<Returns>(`/crm/returns?window=${['overdue', '7', '30'].includes(window) ? window : ''}`);
}
export async function getMetrics(days: number): Promise<Metrics | null> {
  return get<Metrics>(`/crm/metrics?days=${days}`);
}
export async function createLead(input: LeadInput): Promise<CrmResult> {
  const r = await mutate('/crm/leads', 'POST', input, 'Não foi possível salvar o lead agora.');
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}
export async function moveLead(id: string, stage: 'new' | 'contacted' | 'lost', note?: string): Promise<CrmResult> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  const r = await mutate(`/crm/leads/${id}/stage`, 'POST', { stage, note }, 'Não foi possível mover agora.');
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}
export async function convertLead(id: string): Promise<{ ok: true; patientId: string } | { ok: false; message: string }> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  const r = await mutate(`/crm/leads/${id}/convert`, 'POST', {}, 'Não foi possível cadastrar o paciente agora.');
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath('/app/pacientes');
  return { ok: true, patientId: (r.data as { patient_id: string }).patient_id };
}
