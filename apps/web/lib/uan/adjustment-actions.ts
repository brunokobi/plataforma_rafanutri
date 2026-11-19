'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

export interface SheetAdjustments {
  can_edit: boolean;
  adjustments: Array<{ sheet_root_id: string; name: string; portion_factor: number; notes: string | null; updated_at: string }>;
  sheets: Array<{ root_id: string; name: string }>;
}
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

export async function getSheetAdjustments(unitId: string): Promise<SheetAdjustments | null> {
  if (!isUuid(unitId)) return null;
  try {
    const r = await call(`/uan/units/${unitId}/sheet-adjustments`);
    return r.status === 200 ? (r.json?.data as SheetAdjustments) : null;
  } catch {
    return null;
  }
}
export async function saveSheetAdjustment(unitId: string, v: { sheet_root_id: string; portion_factor: string | null; notes?: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  try {
    const r = await call(`/uan/units/${unitId}/sheet-adjustments`, 'PUT', v);
    if (r.status !== 200) {
      const e = r.json?.errors?.[0];
      return { ok: false, message: (e?.extensions?.fields && Object.values(e.extensions.fields)[0]) || e?.message || 'Não foi possível salvar.' };
    }
    revalidatePath(`/app/uan/unidades/${unitId}/cardapios`);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora.' };
  }
}
