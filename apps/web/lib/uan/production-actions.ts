'use server';

import { revalidatePath } from 'next/cache';
import type { ProductionDay } from '@/lib/uan/production';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';

export type Result = { ok: true; days?: number } | { ok: false; message: string };
async function send(unitId: string, path: string, method: string, body: unknown, fallback: string): Promise<Result> {
  if (!isUuid(unitId)) return { ok: false, message: 'Unidade inválida.' };
  try {
    const r = await call(path, method, body);
    if (r.status !== 200) {
      const e = r.json?.errors?.[0];
      const f = e?.extensions?.fields;
      return { ok: false, message: r.status === 401 ? 'Sua sessão expirou. Entre novamente.' : ((f && Object.values(f)[0]) || e?.message || fallback) };
    }
    revalidatePath(`/app/uan/unidades/${unitId}/producao`);
    return { ok: true, days: (r.json?.data as { days?: number } | undefined)?.days };
  } catch {
    return { ok: false, message: 'Sem conexão com o servidor. Tente de novo em instantes.' };
  }
}

export async function getProduction(unitId: string, date?: string): Promise<ProductionDay | null | undefined> {
  if (!isUuid(unitId)) return undefined;
  try {
    const r = await call(`/uan/units/${unitId}/production${date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `?date=${date}` : ''}`);
    if (r.status === 404) return undefined;
    return r.status === 200 ? (r.json?.data as ProductionDay) : null;
  } catch {
    return null;
  }
}
export async function saveDiners(unitId: string, input: { day: string; service: string; planned?: string; actual?: string }): Promise<Result> {
  return send(unitId, `/uan/units/${unitId}/diners`, 'POST', input, 'Não foi possível salvar os comensais.');
}
export async function applyPattern(unitId: string, input: { from: string; to: string; weekdays: number[]; service: string; planned: number }): Promise<Result> {
  return send(unitId, `/uan/units/${unitId}/diners/pattern`, 'POST', input, 'Não foi possível aplicar o padrão.');
}
export async function saveWaste(unitId: string, input: Record<string, unknown>): Promise<Result> {
  return send(unitId, `/uan/units/${unitId}/waste`, 'PUT', input, 'Não foi possível registrar a pesagem.');
}
