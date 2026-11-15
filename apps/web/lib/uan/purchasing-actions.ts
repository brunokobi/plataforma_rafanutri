'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { NeedsData, PoDetail, PoListItem } from '@/lib/uan/purchasing';

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
const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
export type Result = { ok: true; id?: string; ids?: string[] } | { ok: false; message: string };
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
    const data = r.json?.data as { id?: string; ids?: string[] } | undefined;
    return { ok: true, id: data?.id, ids: data?.ids };
  } catch {
    return { ok: false, message: 'Sem conexão com o servidor. Tente de novo em instantes.' };
  }
}

export async function getNeeds(unitId: string, from?: string, to?: string): Promise<NeedsData | null | undefined> {
  if (!isUuid(unitId)) return undefined;
  const q = new URLSearchParams();
  if (isDate(from)) q.set('from', from);
  if (isDate(to)) q.set('to', to);
  return get<NeedsData>(`/uan/units/${unitId}/purchase-needs?${q}`);
}
export async function getOrders(unitId: string): Promise<{ unit: { id: string; name: string }; items: PoListItem[] } | null | undefined> {
  return isUuid(unitId) ? get(`/uan/units/${unitId}/purchase-orders`) : undefined;
}
export async function getOrder(id: string): Promise<PoDetail | null | undefined> {
  return isUuid(id) ? get<PoDetail>(`/uan/purchase-orders/${id}`) : undefined;
}
export async function createOrders(unitId: string, orders: Array<{ supplier_id: string | null; expected_on?: string | null; items: Array<{ ingredient_id: string; quantity_units: number }> }>): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  return send(`/uan/units/${unitId}/purchase-orders`, 'POST', { orders }, 'Não foi possível gerar os pedidos.', [`/app/uan/unidades/${unitId}/compras`]);
}
export async function saveOrder(id: string, input: { supplier_id: string; expected_on: string; notes: string; items: Array<{ ingredient_id: string; quantity_units: string; unit_price: string }> }): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  return send(`/uan/purchase-orders/${id}`, 'PUT', input, 'Não foi possível salvar o pedido.', [`/app/uan/pedidos/${id}`]);
}
export async function orderAction(id: string, action: 'send' | 'cancel'): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  return send(`/uan/purchase-orders/${id}/${action}`, 'POST', {}, 'Não foi possível concluir.', [`/app/uan/pedidos/${id}`]);
}
export async function receiveOrder(id: string, input: { invoice_number: string; notes: string; items: Array<Record<string, unknown>> }): Promise<Result> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  return send(`/uan/purchase-orders/${id}/receive`, 'POST', input, 'Não foi possível registrar o recebimento.', [`/app/uan/pedidos/${id}`]);
}
