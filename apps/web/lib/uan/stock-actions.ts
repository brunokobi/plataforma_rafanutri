'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { InventoryData, StockData } from '@/lib/uan/stock';

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
export type Result = { ok: true; id?: string; data?: unknown } | { ok: false; message: string };
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
      const f = e?.extensions?.fields;
      return { ok: false, message: r.status === 401 ? 'Sua sessão expirou. Entre novamente.' : ((f && Object.values(f)[0]) || e?.message || fallback) };
    }
    for (const p of revalidate) revalidatePath(p);
    const data = r.json?.data as { id?: string } | undefined;
    return { ok: true, id: data?.id, data };
  } catch {
    return { ok: false, message: 'Sem conexão com o servidor. Tente de novo em instantes.' };
  }
}

export async function getStock(unitId: string): Promise<StockData | null | undefined> {
  return isUuid(unitId) ? get<StockData>(`/uan/units/${unitId}/stock`) : undefined;
}
export async function getInventory(id: string): Promise<InventoryData | null | undefined> {
  return isUuid(id) ? get<InventoryData>(`/uan/inventories/${id}`) : undefined;
}
export async function stockIn(unitId: string, input: { ingredient_id: string; quantity: string; lot_code: string; expires_on: string; supplier_id: string; cost: string }): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  return send(`/uan/units/${unitId}/stock/in`, 'POST', input, 'Não foi possível registrar a entrada.', [`/app/uan/unidades/${unitId}/estoque`]);
}
export async function stockOut(unitId: string, input: { kind: 'out_production' | 'out_loss'; reason?: string; lines: Array<{ ingredient_id: string; quantity?: string; quantity_g?: number }> }): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  return send(`/uan/units/${unitId}/stock/out`, 'POST', input, 'Não foi possível registrar a saída.', [`/app/uan/unidades/${unitId}/estoque`]);
}
export async function openInventory(unitId: string): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  return send(`/uan/units/${unitId}/inventories`, 'POST', {}, 'Não foi possível abrir o inventário.', [`/app/uan/unidades/${unitId}/estoque`]);
}
export async function saveCount(inventoryId: string, input: { ingredient_id: string; counted: string; reason: string }): Promise<Result> {
  if (!isUuid(inventoryId)) return { ok: false, message: 'Inventário inválido.' };
  return send(`/uan/inventories/${inventoryId}/counts`, 'PUT', input, 'Não foi possível salvar a contagem.', []);
}
export async function finishInventory(inventoryId: string, action: 'approve' | 'cancel'): Promise<Result> {
  if (!isUuid(inventoryId)) return { ok: false, message: 'Inventário inválido.' };
  return send(`/uan/inventories/${inventoryId}/${action}`, 'POST', {}, 'Não foi possível concluir.', [`/app/uan/inventarios/${inventoryId}`]);
}
