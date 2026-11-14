'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { AgendaPackages, PackageInput, PackageResult, PatientPackage, SaleInput, ServicePackage } from './types';

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
async function mutate(path: string, method: string, body: unknown, ok: number[], paths: string[], fallback: string): Promise<PackageResult> {
  try {
    const r = await call(path, method, body);
    if (ok.includes(r.status)) {
      for (const p of paths) revalidatePath(p);
      return { ok: true };
    }
    if (r.status === 401) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
    const e = r.json?.errors?.[0];
    return { ok: false, message: (e?.extensions?.fields ? Object.values(e.extensions.fields)[0] : null) ?? e?.message ?? fallback };
  } catch {
    return { ok: false, message: fallback };
  }
}

export async function listPackages(): Promise<ServicePackage[] | null> {
  return get<ServicePackage[]>('/packages');
}
export async function savePackage(id: string | null, input: PackageInput): Promise<PackageResult> {
  if (id !== null && !isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  return mutate(id ? `/packages/${id}` : '/packages', id ? 'PUT' : 'POST', input, [200, 201], ['/app/financeiro/pacotes'], 'Não foi possível salvar o pacote agora.');
}
export async function listPatientPackages(patientId: string): Promise<PatientPackage[] | null> {
  return isUuid(patientId) ? get<PatientPackage[]>(`/patients/${patientId}/packages`) : null;
}
export async function sellPackage(patientId: string, input: SaleInput): Promise<PackageResult> {
  if (!isUuid(patientId)) return { ok: false, message: 'Pedido inválido.' };
  return mutate(`/patients/${patientId}/packages`, 'POST', input, [201], [`/app/pacientes/${patientId}`, '/app/financeiro'], 'Não foi possível vender o pacote agora.');
}
export async function cancelPatientPackage(patientId: string, id: string): Promise<PackageResult> {
  if (!isUuid(patientId) || !isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  return mutate(`/patient-packages/${id}/cancel`, 'POST', {}, [200], [`/app/pacientes/${patientId}`, '/app/financeiro'], 'Não foi possível cancelar agora.');
}
export async function getAgendaPackages(patientIds: string[]): Promise<AgendaPackages> {
  const ids = [...new Set(patientIds.filter(isUuid))].slice(0, 200);
  if (!ids.length) return {};
  return (await get<AgendaPackages>(`/packages/agenda?patients=${ids.join(',')}`)) ?? {};
}
