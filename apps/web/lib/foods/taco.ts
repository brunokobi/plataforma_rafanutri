import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus, directusErrorInfo } from '@/lib/auth/directus';
import { FOOD_DEEP, FOOD_FIELDS, foodSearchFilter, mapDirectusFood, rankFoods, type DirectusFood, type Food } from './food';
import { type DirectusTacoDetail, type TacoFoodDetail, toDetail } from './taco-data';

const TACO = { source_id: { code: { _eq: 'TACO' } } };

async function token() {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

/** Busca na TACO por texto (todas as palavras) ou lista um grupo. Null se o Directus falhar. */
export async function listTaco(opts: { q?: string; group?: string }): Promise<Food[] | null> {
  const t = await token();
  if (!t) return null;
  const text = opts.q?.trim() ?? '';
  const search = text ? foodSearchFilter(text) : null;
  if (text && !search) return [];
  const filters: Record<string, unknown>[] = [TACO];
  if (search) filters.push(search);
  if (opts.group) filters.push({ food_group: { _eq: opts.group } });
  if (!search && !opts.group) return [];
  try {
    const items = await directus().request<DirectusFood[]>(
      withToken(t, readItems('foods' as never, { fields: FOOD_FIELDS, deep: FOOD_DEEP, filter: { _and: filters }, sort: ['name'], limit: search ? 80 : 200 } as never)),
    );
    const foods = items.map(mapDirectusFood);
    return search ? rankFoods(foods, text) : foods;
  } catch (error) {
    console.error('taco: falha ao listar', directusErrorInfo(error));
    return null;
  }
}

/** Ficha completa de um alimento da TACO (todos os nutrientes). Null = não existe ou falhou. */
export async function getTacoFood(id: string): Promise<TacoFoodDetail | null> {
  if (!/^\d{1,9}$/.test(id)) return null;
  const t = await token();
  if (!t) return null;
  try {
    const [item] = await directus().request<DirectusTacoDetail[]>(
      withToken(t, readItems('foods' as never, {
        fields: ['id', 'name', 'food_group', 'source_code', 'household_measures', 'source_id.name', 'source_id.version', 'source_id.citation',
          'nutrients.amount_per_100g', 'nutrients.is_trace', 'nutrients.nutrient_id.code', 'nutrients.nutrient_id.name', 'nutrients.nutrient_id.unit', 'nutrients.nutrient_id.position'],
        filter: { _and: [{ id: { _eq: Number(id) } }, TACO] },
        deep: { nutrients: { _limit: 100 } },
        limit: 1,
      } as never)),
    );
    if (!item) return null;
    return toDetail(item);
  } catch (error) {
    console.error('taco: falha ao abrir alimento', directusErrorInfo(error));
    return null;
  }
}
