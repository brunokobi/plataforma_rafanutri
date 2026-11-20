'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { IngredientImport, SheetImport, SupplierImport } from '@/lib/uan/import';

export interface ImportResult { line: number | null; status: 'created' | 'skipped' | 'error'; message?: string; food?: string | null }
type Out = { ok: true; results: ImportResult[] } | { ok: false; message: string };

async function post(path: string, body: unknown): Promise<{ status: number; json: { data?: unknown; errors?: Array<{ message: string }> } | null }> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { status: 401, json: null };
  const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

async function run(path: string, body: unknown, revalidate: string): Promise<Out> {
  try {
    const r = await post(path, body);
    if (r.status !== 200) return { ok: false, message: r.json?.errors?.[0]?.message ?? 'Não foi possível importar.' };
    revalidatePath(revalidate);
    return { ok: true, results: (r.json?.data as { results: ImportResult[] }).results };
  } catch {
    return { ok: false, message: 'Não foi possível importar agora.' };
  }
}

export async function matchFoods(orgId: string, names: string[]): Promise<Array<{ name: string; food: { id: number; name: string; score: number } | null }>> {
  if (!isUuid(orgId) || !names.length) return [];
  try {
    const r = await post(`/uan/organizations/${orgId}/import/foods-match`, { names: names.slice(0, 1000) });
    return r.status === 200 ? (r.json?.data as Array<{ name: string; food: { id: number; name: string; score: number } | null }>) : [];
  } catch {
    return [];
  }
}
export async function importIngredients(orgId: string, rows: IngredientImport[], useSuggestions: boolean) {
  if (!isUuid(orgId)) return { ok: false as const, message: 'Empresa inválida.' };
  return run(`/uan/organizations/${orgId}/import/ingredients`, { rows, use_suggestions: useSuggestions }, '/app/uan/insumos');
}
export async function importSuppliers(orgId: string, rows: SupplierImport[]) {
  if (!isUuid(orgId)) return { ok: false as const, message: 'Empresa inválida.' };
  return run(`/uan/organizations/${orgId}/import/suppliers`, { rows }, '/app/uan/fornecedores');
}
export async function importSheets(orgId: string, sheets: SheetImport[]) {
  if (!isUuid(orgId)) return { ok: false as const, message: 'Empresa inválida.' };
  return run(`/uan/organizations/${orgId}/import/sheets`, { sheets }, '/app/uan/fichas');
}
