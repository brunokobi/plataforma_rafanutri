'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { LabelRecord, LabelValues, SheetLabels } from '@/lib/uan/labels';

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

export async function getSheetLabels(sheetId: string) {
  return isUuid(sheetId) ? get<SheetLabels>(`/uan/tech-sheets/${sheetId}/labels`) : undefined;
}
export async function getLabel(id: string) {
  return isUuid(id) ? get<LabelRecord>(`/uan/labels/${id}`) : undefined;
}
export interface IssueLabelInput {
  product_name: string; physical_state: 'solid' | 'liquid'; portion_g: number; household_measure: string; servings_per_pack: number | null;
  values: LabelValues; front_warnings: string[]; allergens: string[]; allergen_statement: string | null; layout: 'vertical';
}
export async function issueLabel(sheetId: string, v: IssueLabelInput): Promise<Result> {
  if (!isUuid(sheetId)) return { ok: false, message: 'Ficha inválida.' };
  try {
    const r = await call(`/uan/tech-sheets/${sheetId}/labels`, 'POST', v);
    if (r.status !== 201) return fail(r, 'Não foi possível emitir o rótulo.');
    revalidatePath(`/app/uan/fichas/${sheetId}`);
    return { ok: true, id: (r.json?.data as { id: string }).id };
  } catch {
    return { ok: false, message: 'Não foi possível emitir agora.' };
  }
}
export async function archiveLabel(sheetId: string, id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Rótulo inválido.' };
  try {
    const r = await call(`/uan/labels/${id}/archive`, 'POST', {});
    if (r.status !== 200) return fail(r, 'Não foi possível arquivar.');
    revalidatePath(`/app/uan/fichas/${sheetId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível arquivar agora.' };
  }
}
