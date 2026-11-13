'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

export interface CustomFoodInput {
  name: string;
  food_group?: string;
  basis: '100g' | 'portion';
  portion_g?: number | string;
  nutrients: Record<string, number | string | null>;
  household_measures?: Array<{ label: string; grams: number | string }>;
}
export interface RecipeInput {
  name: string;
  food_group?: string;
  yield_g: number | string;
  servings?: number | string | null;
  instructions?: string;
  items: Array<{ foodId: string; quantityG: number | string }>;
  household_measures?: Array<{ label: string; grams: number | string }>;
}
export type CustomFoodResult =
  | { ok: true; id: string; per100g?: Record<string, number | null>; incomplete?: string[] }
  | { ok: false; message: string; fields?: Record<string, string> };

/** Chama o endpoint da extensão com o token do usuário (o consultório é resolvido no servidor do Directus). */
async function call(path: string, method: 'POST' | 'PUT', body: unknown): Promise<CustomFoodResult> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
      method,
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { id: string; per100g?: Record<string, number | null>; incomplete?: string[] };
      errors?: Array<{ message: string; extensions?: { fields?: Record<string, string> } }>;
    } | null;
    if (res.ok && json?.data) {
      revalidatePath('/app/alimentos');
      return { ok: true, id: json.data.id, per100g: json.data.per100g, incomplete: json.data.incomplete };
    }
    if (res.status === 400) return { ok: false, message: json?.errors?.[0]?.message ?? 'Revise os campos.', fields: json?.errors?.[0]?.extensions?.fields };
    if (res.status === 404) return { ok: false, message: 'Alimento não encontrado.' };
    if (res.status === 403) return { ok: false, message: 'Você não tem permissão para cadastrar alimentos neste consultório.' };
    if (res.status === 429) return { ok: false, message: 'Muitas tentativas seguidas. Aguarde um minuto.' };
    return { ok: false, message: 'Não foi possível salvar agora. Tente novamente em instantes.' };
  } catch {
    return { ok: false, message: 'Não foi possível salvar agora. Tente novamente em instantes.' };
  }
}

const isId = (id: unknown): id is string => typeof id === 'string' && /^\d+$/.test(id);

export async function saveCustomFood(input: CustomFoodInput, id?: string): Promise<CustomFoodResult> {
  if (id !== undefined && !isId(id)) return { ok: false, message: 'Pedido inválido.' };
  return id ? call(`/foods/${id}`, 'PUT', input) : call('/foods', 'POST', input);
}

export async function saveRecipe(input: RecipeInput, id?: string): Promise<CustomFoodResult> {
  if (id !== undefined && !isId(id)) return { ok: false, message: 'Pedido inválido.' };
  return id ? call(`/recipes/${id}`, 'PUT', input) : call('/recipes', 'POST', input);
}

export async function setFoodArchived(id: string, archived: boolean): Promise<CustomFoodResult> {
  if (!isId(id)) return { ok: false, message: 'Pedido inválido.' };
  return call(`/foods/${id}/archive`, 'POST', { archived });
}
