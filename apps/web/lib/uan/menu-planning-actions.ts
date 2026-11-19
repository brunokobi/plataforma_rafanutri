'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { MenuPlanningOrg } from '@/lib/uan/menu-planning';

type Json = { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> } | null;
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
export type Result = { ok: true; id?: string } | { ok: false; message: string };
function fail(r: { json: Json }, fallback: string): Result {
  const e = r.json?.errors?.[0];
  const fields = e?.extensions?.fields;
  return { ok: false, message: (fields && Object.values(fields)[0]) || e?.message || fallback };
}
async function send(path: string, method: string, body: unknown, ok: number[], fallback: string): Promise<Result> {
  try {
    const r = await call(path, method, body);
    if (!ok.includes(r.status)) return fail(r, fallback);
    revalidatePath('/app/uan/perfis');
    return { ok: true, id: (r.json?.data as { id?: string } | undefined)?.id };
  } catch {
    return { ok: false, message: `${fallback} agora.` };
  }
}

export async function getMenuPlanning(orgId: string): Promise<MenuPlanningOrg | null | undefined> {
  if (!isUuid(orgId)) return undefined;
  try {
    const r = await call(`/uan/organizations/${orgId}/menu-planning`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as MenuPlanningOrg) : null;
  } catch {
    return null;
  }
}
export async function copyProfile(orgId: string, profileId: string) {
  return isUuid(orgId) ? send(`/uan/organizations/${orgId}/diner-profiles`, 'POST', { copy_from: profileId }, [201], 'Não foi possível copiar o perfil') : { ok: false as const, message: 'Empresa inválida.' };
}
export async function createProfile(orgId: string, v: { name: string; segment: string }) {
  return isUuid(orgId) ? send(`/uan/organizations/${orgId}/diner-profiles`, 'POST', v, [201], 'Não foi possível criar o perfil') : { ok: false as const, message: 'Empresa inválida.' };
}
export async function saveProfile(id: string, v: { name: string; segment: string; stage: string; diet: string; services: string[]; targets: Record<string, { min?: string; max?: string; target?: string }>; reference: string; validated: boolean; active: boolean }) {
  return isUuid(id) ? send(`/uan/diner-profiles/${id}`, 'PUT', v, [200], 'Não foi possível salvar o perfil') : { ok: false as const, message: 'Perfil inválido.' };
}
export async function createRule(orgId: string, v: Record<string, string | null>) {
  return isUuid(orgId) ? send(`/uan/organizations/${orgId}/menu-rules`, 'POST', v, [201], 'Não foi possível criar a regra') : { ok: false as const, message: 'Empresa inválida.' };
}
export async function deactivateRule(id: string) {
  return isUuid(id) ? send(`/uan/menu-rules/${id}/deactivate`, 'POST', {}, [200], 'Não foi possível remover a regra') : { ok: false as const, message: 'Regra inválida.' };
}
