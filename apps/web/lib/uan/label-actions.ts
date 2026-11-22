'use server';

import { revalidatePath } from 'next/cache';
import type { LabelRecord, LabelValues, SheetLabels } from '@/lib/uan/labels';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';

type Json = { data?: unknown; errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }> } | null;
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
  values: LabelValues; front_warnings: string[]; allergens: string[]; allergen_statement: string | null; layout: 'vertical' | 'horizontal' | 'linear';
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
