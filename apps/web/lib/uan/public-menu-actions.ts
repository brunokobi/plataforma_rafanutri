'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { PublicMenu, PublicMenuSettings, SurveyQuestion } from '@/lib/uan/public-menu';

type Json = { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> } | null;
async function call(path: string, method = 'GET', body?: unknown, auth = true, extra: Record<string, string> = {}): Promise<{ status: number; json: Json }> {
  const t = auth ? (await cookies()).get(ACCESS_COOKIE)?.value : undefined;
  if (auth && !t) return { status: 401, json: null };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
    method,
    headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Json };
}
const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
const isToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(t);
const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
export type Result = { ok: true; token?: string | null } | { ok: false; message: string };
function fail(r: { json: Json }, fallback: string): { ok: false; message: string } {
  const e = r.json?.errors?.[0];
  const fields = e?.extensions?.fields;
  return { ok: false, message: (fields && Object.values(fields)[0]) || e?.message || fallback };
}

/** Público: cardápio do dia (ou da semana) publicado pela unidade; null se não existe ou não está publicado. */
export async function getPublicMenu(token: string, date?: string, week = false): Promise<PublicMenu | null> {
  if (!isToken(token)) return null;
  try {
    const q = new URLSearchParams();
    if (isDate(date)) q.set('date', date);
    if (week) q.set('week', '1');
    const r = await call(`/public/menus/${token}${q.size ? `?${q}` : ''}`, 'GET', undefined, false);
    return r.status === 200 ? (r.json?.data as PublicMenu) : null;
  } catch {
    return null;
  }
}

/** Público: resposta da pesquisa (uma por aparelho, dia e prato). */
export async function sendSatisfaction(token: string, v: { served_on: string; sheet_root_id: string | null; device_id: string; answers: Array<number | boolean>; comment: string; website?: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isToken(token)) return { ok: false, message: 'Cardápio inválido.' };
  try {
    const ip = ((await headers()).get('x-forwarded-for') ?? '').split(',')[0]!.trim();
    const r = await call(`/public/menus/${token}/responses`, 'POST', v, false, ip ? { 'X-Client-IP': ip } : {});
    return r.status === 201 ? { ok: true } : fail(r, 'Não foi possível enviar.');
  } catch {
    return { ok: false, message: 'Não foi possível enviar agora.' };
  }
}

export async function getPublicMenuSettings(unitId: string): Promise<PublicMenuSettings | null | undefined> {
  if (!isUuid(unitId)) return undefined;
  try {
    const r = await call(`/uan/units/${unitId}/public-menu`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as PublicMenuSettings) : null;
  } catch {
    return null;
  }
}
export async function setPublicMenu(unitId: string, enabled: boolean, rotate = false): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  try {
    const r = await call(`/uan/units/${unitId}/public-menu`, 'POST', { enabled, rotate });
    if (r.status !== 200) return fail(r, 'Não foi possível salvar.');
    revalidatePath(`/app/uan/unidades/${unitId}/cardapio-publico`);
    return { ok: true, token: (r.json?.data as { token: string | null }).token };
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora.' };
  }
}
export async function saveSurvey(unitId: string, v: { title: string; questions: SurveyQuestion[]; per_dish: boolean } | { close: true }): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  try {
    const r = await call(`/uan/units/${unitId}/surveys`, 'POST', v);
    if (r.status !== 201 && r.status !== 200) return fail(r, 'Não foi possível salvar a pesquisa.');
    revalidatePath(`/app/uan/unidades/${unitId}/cardapio-publico`);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora.' };
  }
}
