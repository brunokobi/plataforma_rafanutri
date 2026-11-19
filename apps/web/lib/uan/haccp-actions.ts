'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { PlanDetail, Step, UnitHaccp } from '@/lib/uan/haccp';

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
async function get<T>(path: string): Promise<T | null | undefined> {
  try {
    const r = await call(path);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as T) : null;
  } catch {
    return null;
  }
}
function fail(r: { json: Json }, fallback: string): Result {
  const e = r.json?.errors?.[0];
  const fields = e?.extensions?.fields;
  return { ok: false, message: (fields && Object.values(fields)[0]) || e?.message || fallback };
}
async function send(path: string, method: string, body: unknown, ok: number, fallback: string, revalidate?: string): Promise<Result> {
  try {
    const r = await call(path, method, body);
    if (r.status !== ok) return fail(r, fallback);
    if (revalidate) revalidatePath(revalidate);
    return { ok: true, id: (r.json?.data as { id?: string } | undefined)?.id };
  } catch {
    return { ok: false, message: `${fallback} agora.` };
  }
}

export async function getUnitHaccp(unitId: string) {
  return isUuid(unitId) ? get<UnitHaccp>(`/uan/units/${unitId}/haccp`) : undefined;
}
export async function getHaccpPlan(id: string) {
  return isUuid(id) ? get<PlanDetail>(`/uan/haccp/${id}`) : undefined;
}
export async function createHaccpPlan(unitId: string, v: { title: string; scope?: string; sheet_root_id?: string | null }): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  return send(`/uan/units/${unitId}/haccp`, 'POST', v, 201, 'Não foi possível criar o plano', `/app/uan/unidades/${unitId}/appcc`);
}
export async function saveHaccpPlan(id: string, v: { title: string; scope: string | null; steps: Step[] }): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Plano inválido.' };
  return send(`/uan/haccp/${id}`, 'PUT', v, 200, 'Não foi possível salvar o plano', `/app/uan/appcc/${id}`);
}
export async function importStepsFromSheet(id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Plano inválido.' };
  return send(`/uan/haccp/${id}/from-sheet`, 'POST', {}, 200, 'Não foi possível importar as etapas', `/app/uan/appcc/${id}`);
}
export async function approveHaccpPlan(id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Plano inválido.' };
  return send(`/uan/haccp/${id}/approve`, 'POST', {}, 200, 'Não foi possível aprovar', `/app/uan/appcc/${id}`);
}
export async function newHaccpVersion(id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Plano inválido.' };
  return send(`/uan/haccp/${id}/new-version`, 'POST', {}, 201, 'Não foi possível criar a nova versão');
}
