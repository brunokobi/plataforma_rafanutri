'use server';

import { revalidatePath } from 'next/cache';
import type { IngredientDetail, IngredientList, SupplierList } from '@/lib/uan/catalog';
import { call } from '@/lib/directus/rafanutri';
import { isUuid } from '@/lib/validation/ids';

type Json = { data?: unknown; errors?: Array<{ message: string; extensions?: { code?: string; fields?: Record<string, string> } }> } | null;

const FAIL = 'Sem conexão com o servidor. Tente de novo em instantes.';
export type Result = { ok: true; id?: string } | { ok: false; message: string; fields?: Record<string, string> };
const fail = (r: { status: number; json: Json }, fallback: string): Result => {
  const e = r.json?.errors?.[0];
  const fields = e?.extensions?.fields;
  return { ok: false, message: r.status === 401 ? 'Sua sessão expirou. Entre novamente.' : ((fields && Object.values(fields)[0]) || e?.message || fallback), fields };
};
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
    if (r.status !== 200 && r.status !== 201) return fail(r, fallback);
    for (const p of revalidate) revalidatePath(p);
    return { ok: true, id: (r.json?.data as { id?: string } | undefined)?.id };
  } catch {
    return { ok: false, message: FAIL };
  }
}

export async function getIngredients(orgId: string, q = '', category = ''): Promise<IngredientList | null | undefined> {
  if (!isUuid(orgId)) return undefined;
  const qs = new URLSearchParams();
  if (q) qs.set('q', q.slice(0, 80));
  if (category) qs.set('category', category);
  return get<IngredientList>(`/uan/organizations/${orgId}/ingredients?${qs}`);
}
export async function getIngredient(id: string): Promise<IngredientDetail | null | undefined> {
  return isUuid(id) ? get<IngredientDetail>(`/uan/ingredients/${id}`) : undefined;
}
export async function getSuppliers(orgId: string): Promise<SupplierList | null | undefined> {
  return isUuid(orgId) ? get<SupplierList>(`/uan/organizations/${orgId}/suppliers`) : undefined;
}

export async function searchUanFoods(q: string): Promise<Array<{ id: number; name: string; food_group: string | null; source: string }>> {
  if (q.trim().length < 2) return [];
  return (await get<Array<{ id: number; name: string; food_group: string | null; source: string }>>(`/uan/foods?q=${encodeURIComponent(q.trim().slice(0, 80))}`)) ?? [];
}

export interface IngredientInput {
  name: string;
  category: string;
  purchase_unit: string;
  storage: string;
  default_fc: string;
  density_g_ml: string;
  unit_weight_g: string;
  pack_grams: string;
  min_stock: string;
  added_sugar_g_100g?: string;
  allergens: string[];
  food_id: number | null;
  active?: boolean;
}

export async function saveIngredient(orgId: string, id: string | null, input: IngredientInput): Promise<Result> {
  if (!isUuid(orgId) || (id !== null && !isUuid(id))) return { ok: false, message: 'Cadastro inválido.' };
  return id
    ? send(`/uan/ingredients/${id}`, 'PUT', input, 'Não foi possível salvar o insumo.', [`/app/uan/insumos/${id}`, '/app/uan/insumos'])
    : send(`/uan/organizations/${orgId}/ingredients`, 'POST', input, 'Não foi possível cadastrar o insumo.', ['/app/uan/insumos']);
}

export async function addPrice(ingredientId: string, input: { price: string; supplier_id: string; valid_from: string }): Promise<Result> {
  if (!isUuid(ingredientId)) return { ok: false, message: 'Insumo inválido.' };
  return send(`/uan/ingredients/${ingredientId}/prices`, 'POST', { ...input, supplier_id: input.supplier_id || null, valid_from: input.valid_from || null }, 'Não foi possível registrar o preço.', [`/app/uan/insumos/${ingredientId}`, '/app/uan/insumos']);
}

export interface SupplierInput { name: string; cnpj: string; contact_name: string; phone: string; email: string; notes: string; active?: boolean }

export async function saveSupplier(orgId: string, id: string | null, input: SupplierInput): Promise<Result> {
  if (!isUuid(orgId) || (id !== null && !isUuid(id))) return { ok: false, message: 'Cadastro inválido.' };
  return id
    ? send(`/uan/suppliers/${id}`, 'PUT', input, 'Não foi possível salvar o fornecedor.', ['/app/uan/fornecedores'])
    : send(`/uan/organizations/${orgId}/suppliers`, 'POST', input, 'Não foi possível cadastrar o fornecedor.', ['/app/uan/fornecedores']);
}
