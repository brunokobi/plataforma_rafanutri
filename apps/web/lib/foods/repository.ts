import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus, directusErrorInfo } from '@/lib/auth/directus';
import { FOOD_DEEP, FOOD_FIELDS, foodSearchFilter, mapDirectusFood, rankFoods, type DirectusFood, type Food } from './food';

/**
 * Leitura da base de alimentos no Directus, sempre com o token do usuário logado
 * (as permissões do papel Profissional limitam à base pública e ao próprio consultório).
 * Devolve null quando não há sessão ou o Directus falha.
 */
async function query(params: Record<string, unknown>): Promise<Food[] | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const items = await directus().request<DirectusFood[]>(
      withToken(token, readItems('foods' as never, { fields: FOOD_FIELDS, deep: FOOD_DEEP, ...params } as never)),
    );
    return items.map(mapDirectusFood);
  } catch (error) {
    console.error('foods: falha ao consultar o Directus', directusErrorInfo(error));
    return null;
  }
}

export async function searchFoodsRepo(text: string, limit = 12): Promise<Food[] | null> {
  const filter = foodSearchFilter(text);
  if (!filter) return [];
  const found = await query({ filter, limit: 40, sort: ['name'] });
  return found ? rankFoods(found, text).slice(0, limit) : null;
}

export async function foodsInGroupRepo(group: string, limit = 120): Promise<Food[] | null> {
  return query({ filter: { _and: [{ food_group: { _eq: group } }, { archived: { _eq: false } }] }, limit, sort: ['name'] });
}

/** Alimentos da TACO pelo código da tabela (ex.: "561" = feijão carioca cozido). */
export async function tacoFoodsByCodeRepo(codes: string[]): Promise<Map<string, Food> | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token || codes.length === 0) return token ? new Map() : null;
  try {
    const items = await directus().request<Array<DirectusFood & { source_code: string }>>(
      withToken(
        token,
        readItems('foods' as never, {
          fields: [...FOOD_FIELDS, 'source_code'],
          deep: FOOD_DEEP,
          filter: { _and: [{ source_code: { _in: codes } }, { source_id: { code: { _eq: 'TACO' } } }] },
          limit: codes.length,
        } as never),
      ),
    );
    return new Map(items.map((i) => [i.source_code, mapDirectusFood(i)]));
  } catch (error) {
    console.error('foods: falha ao carregar alimentos da TACO', directusErrorInfo(error));
    return null;
  }
}

/** Alimentos pelo id do banco (para abrir um plano salvo). */
export async function foodsByIdsRepo(ids: string[]): Promise<Food[] | null> {
  const numeric = ids.filter((id) => /^\d+$/.test(id));
  if (numeric.length === 0) return [];
  return query({ filter: { id: { _in: numeric.map(Number) } }, limit: numeric.length });
}
