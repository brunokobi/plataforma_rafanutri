import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus, directusErrorInfo } from '@/lib/auth/directus';
import { env } from '@/lib/env';
import { FOOD_DEEP, FOOD_FIELDS, mapDirectusFood, type DirectusFood, type Food } from './food';

export interface CustomFood extends Food {
  archived: boolean;
}

export interface RecipeDetail {
  id: string;
  yield_g: number | null;
  servings: number | null;
  instructions: string | null;
  items: Array<{ foodId: string; quantityG: number; name: string | null }>;
}

async function token() {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

/** Alimentos e preparações do consultório (inclui arquivados), com o token do usuário. */
export async function listCustomFoods(organizationId: string): Promise<CustomFood[] | null> {
  const t = await token();
  if (!t) return null;
  try {
    const rows = await directus().request<Array<DirectusFood & { archived: boolean }>>(
      withToken(
        t,
        readItems('foods' as never, {
          fields: [...FOOD_FIELDS, 'archived'],
          deep: FOOD_DEEP,
          filter: { organization_id: { _eq: organizationId } },
          sort: ['name'],
          limit: 1000,
        } as never),
      ),
    );
    return rows.map((r) => ({ ...mapDirectusFood(r), archived: Boolean(r.archived) }));
  } catch (error) {
    console.error('foods: falha ao listar os do consultório', directusErrorInfo(error));
    return null;
  }
}

/** Detalhe de uma preparação (ingredientes com nome, rendimento, modo de preparo). */
export async function getRecipe(id: string): Promise<RecipeDetail | null> {
  const t = await token();
  if (!t || !/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/recipes/${id}`, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
    if (!res.ok) return null;
    return ((await res.json()) as { data: RecipeDetail }).data;
  } catch {
    return null;
  }
}
