'use server';

import { revalidatePath } from 'next/cache';
import type { MenuDetail, UnitMenus } from '@/lib/uan/menus';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';


const FAIL = 'Sem conexão com o servidor. Tente de novo em instantes.';
export type Result = { ok: true; id?: string } | { ok: false; message: string; code?: string };
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
      return { ok: false, message: r.status === 401 ? 'Sua sessão expirou. Entre novamente.' : (e?.message ?? fallback), code: e?.extensions?.code };
    }
    for (const p of revalidate) revalidatePath(p);
    return { ok: true, id: (r.json?.data as { id?: string } | undefined)?.id };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function getUnitMenus(unitId: string): Promise<UnitMenus | null | undefined> {
  return isUuid(unitId) ? get<UnitMenus>(`/uan/units/${unitId}/menus`) : undefined;
}
export async function getMenu(id: string): Promise<MenuDetail | null | undefined> {
  return isUuid(id) ? get<MenuDetail>(`/uan/menus/${id}`) : undefined;
}

export interface CycleInput { name: string; starts_on: string; length_days: number; services: string[]; slots: string[]; cost_target: string; profile_id?: string | null; autonomy?: string }

export async function createMenu(unitId: string, input: CycleInput): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  return send(`/uan/units/${unitId}/menus`, 'POST', input, 'Não foi possível criar o cardápio.', [`/app/uan/unidades/${unitId}/cardapios`]);
}
export async function updateMenu(id: string, input: CycleInput): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Cardápio inválido.' };
  return send(`/uan/menus/${id}`, 'PUT', input, 'Não foi possível salvar.', [`/app/uan/cardapios/${id}`]);
}
export async function setMenuItem(id: string, item: { day_index: number; service: string; slot: string; sheet_root_id: string | null }): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Cardápio inválido.' };
  return send(`/uan/menus/${id}/items`, 'PUT', item, 'Não foi possível salvar o item.', [`/app/uan/cardapios/${id}`]);
}
export async function menuAction(id: string, action: 'submit' | 'approve' | 'return', note: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Cardápio inválido.' };
  return send(`/uan/menus/${id}/${action}`, 'POST', { note }, 'Não foi possível concluir.', [`/app/uan/cardapios/${id}`]);
}
export async function duplicateMenu(id: string): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Cardápio inválido.' };
  return send(`/uan/menus/${id}/duplicate`, 'POST', {}, 'Não foi possível duplicar.', []);
}
