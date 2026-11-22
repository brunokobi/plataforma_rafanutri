'use server';

import { revalidatePath } from 'next/cache';
import type { SheetDetail, SheetGraph, SheetList } from '@/lib/uan/techsheets';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';


const FAIL = 'Sem conexão com o servidor. Tente de novo em instantes.';
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
async function send(path: string, method: string, body: unknown, fallback: string, revalidate: string[]): Promise<Result> {
  try {
    const r = await call(path, method, body);
    if (r.status !== 200 && r.status !== 201) {
      const e = r.json?.errors?.[0];
      const fields = e?.extensions?.fields;
      return { ok: false, message: r.status === 401 ? 'Sua sessão expirou. Entre novamente.' : ((fields && Object.values(fields)[0]) || e?.message || fallback) };
    }
    for (const p of revalidate) revalidatePath(p);
    return { ok: true, id: (r.json?.data as { id?: string } | undefined)?.id };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function getSheets(orgId: string, q = ''): Promise<SheetList | null | undefined> {
  if (!isUuid(orgId)) return undefined;
  return get<SheetList>(`/uan/organizations/${orgId}/tech-sheets${q ? `?q=${encodeURIComponent(q.slice(0, 80))}` : ''}`);
}
export async function getSheet(id: string): Promise<SheetDetail | null | undefined> {
  return isUuid(id) ? get<SheetDetail>(`/uan/tech-sheets/${id}`) : undefined;
}
export async function getSheetGraph(id: string): Promise<SheetGraph | null> {
  return isUuid(id) ? ((await get<SheetGraph>(`/uan/tech-sheets/${id}/graph`)) ?? null) : null;
}
export async function createSheet(orgId: string, input: { name: string; category: string; servings: number }): Promise<Result> {
  if (!isUuid(orgId)) return { ok: false, message: 'Empresa inválida.' };
  return send(`/uan/organizations/${orgId}/tech-sheets`, 'POST', input, 'Não foi possível criar a ficha.', ['/app/uan/fichas']);
}

export interface SheetSave {
  name: string;
  category: string;
  servings: string;
  cooked_weight_g: string;
  cooking_index: string;
  prep_minutes: string;
  equipment: string;
  notes: string;
  items: Array<{ ingredient_id: string | null; sub_sheet_id: string | null; gross: string; fc: string; note: string }>;
  steps: Array<{ text: string; critical: boolean; target_temp: string }>;
}

export async function saveSheet(id: string, input: SheetSave): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Ficha inválida.' };
  return send(`/uan/tech-sheets/${id}`, 'PUT', {
    ...input,
    servings: Number(input.servings),
    items: input.items.filter((i) => i.ingredient_id || i.sub_sheet_id).map((i) => ({ ingredient_id: i.ingredient_id, sub_sheet_id: i.sub_sheet_id, gross_g: i.gross, fc: i.sub_sheet_id ? null : i.fc || null, note: i.note })),
    steps: input.steps.filter((s) => s.text.trim()).map((s) => ({ text: s.text, critical: s.critical, target_temp: s.target_temp || null })),
  }, 'Não foi possível salvar a ficha.', [`/app/uan/fichas/${id}`, '/app/uan/fichas']);
}
export async function approveSheet(id: string, computed: Record<string, unknown>): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Ficha inválida.' };
  return send(`/uan/tech-sheets/${id}/approve`, 'POST', { computed }, 'Não foi possível aprovar.', [`/app/uan/fichas/${id}`, '/app/uan/fichas']);
}
export async function newSheetVersion(id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Ficha inválida.' };
  return send(`/uan/tech-sheets/${id}/new-version`, 'POST', {}, 'Não foi possível criar a nova versão.', ['/app/uan/fichas']);
}
export async function duplicateSheet(id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Ficha inválida.' };
  return send(`/uan/tech-sheets/${id}/duplicate`, 'POST', {}, 'Não foi possível duplicar.', ['/app/uan/fichas']);
}
export async function deleteSheet(id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Ficha inválida.' };
  return send(`/uan/tech-sheets/${id}`, 'DELETE', undefined, 'Não foi possível apagar.', ['/app/uan/fichas']);
}

/** RN-129 — Foto da preparação (data URL JPEG/PNG já reduzida no aparelho; null remove). */
export async function setSheetPhoto(id: string, image: string | null): Promise<Result> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: 'Ficha inválida.' };
  return send(`/uan/tech-sheets/${id}/photo`, 'POST', { image }, 'Não foi possível salvar a foto.', [`/app/uan/fichas/${id}`]);
}
