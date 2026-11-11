import type { HouseholdMeasure, NutrientValues } from '@rafanutri/nutrition-core';

/** Alimento como o editor de plano usa: composição por 100 g e medidas caseiras. */
export interface Food {
  id: string;
  name: string;
  group: string;
  /** Fonte dos dados (ex.: "TACO", "EXEMPLO"). */
  source: string;
  per100g: NutrientValues;
  householdMeasures: HouseholdMeasure[];
}

/** Nutrientes que o editor e o PDF mostram e somam. */
export const PLAN_NUTRIENTS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'lipid_g', 'fiber_g'] as const;

/** Minúsculo e sem acento, como a coluna `foods.search_name` do banco. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Palavras da busca (até 5, com 2 letras ou mais), já normalizadas. */
export function searchWords(query: string): string[] {
  return normalizeSearch(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2)
    .slice(0, 5);
}

/** Filtro do Directus: `search_name` contém todas as palavras. Null quando não há o que buscar. */
export function foodSearchFilter(query: string): Record<string, unknown> | null {
  const words = searchWords(query);
  if (words.length === 0) return null;
  return { _and: words.map((w) => ({ search_name: { _contains: w } })) };
}

/** Item de `foods` como vem da API do Directus (campos pedidos em `FOOD_FIELDS`). */
export interface DirectusFood {
  id: number;
  name: string;
  food_group: string | null;
  source_id?: { code?: string } | null;
  household_measures?: HouseholdMeasure[] | null;
  nutrients?: Array<{ amount_per_100g: string | number | null; is_trace?: boolean; nutrient_id?: { code?: string } | null }>;
}

export const FOOD_FIELDS = [
  'id',
  'name',
  'food_group',
  'source_id.code',
  'household_measures',
  'nutrients.amount_per_100g',
  'nutrients.is_trace',
  'nutrients.nutrient_id.code',
];

/** Limita os nutrientes trazidos de cada alimento aos que o plano usa. */
export const FOOD_DEEP = { nutrients: { _filter: { nutrient_id: { code: { _in: [...PLAN_NUTRIENTS] } } }, _limit: PLAN_NUTRIENTS.length } };

/**
 * Converte o item do Directus. Nutriente ausente ou não analisado (NA) vira null, para o
 * total do plano saber que está incompleto; traço (Tr) vira 0.
 */
export function mapDirectusFood(item: DirectusFood): Food {
  const per100g: NutrientValues = Object.fromEntries(PLAN_NUTRIENTS.map((c) => [c, null]));
  for (const n of item.nutrients ?? []) {
    const code = n.nutrient_id?.code;
    if (!code || !(code in per100g)) continue;
    per100g[code] = n.amount_per_100g === null || n.amount_per_100g === undefined ? null : Number(n.amount_per_100g);
  }
  const measures = Array.isArray(item.household_measures)
    ? item.household_measures.filter((m) => m && typeof m.label === 'string' && Number(m.grams) > 0).map((m) => ({ label: m.label, grams: Number(m.grams) }))
    : [];
  return {
    id: String(item.id),
    name: item.name,
    group: item.food_group ?? 'Outros',
    source: item.source_id?.code ?? 'TACO',
    per100g,
    householdMeasures: measures,
  };
}

/**
 * Ordena resultados da busca: quem começa com a 1ª palavra vem antes, depois quem tem
 * medida caseira cadastrada (alimentos mais usados) e, por fim, o nome mais curto.
 */
export function rankFoods(foods: Food[], query: string): Food[] {
  const first = searchWords(query)[0] ?? '';
  const score = (f: Food) => {
    const name = normalizeSearch(f.name);
    return (name.startsWith(first) ? 0 : 2) + (f.householdMeasures.length > 0 ? 0 : 1);
  };
  return [...foods].sort((a, b) => score(a) - score(b) || a.name.length - b.name.length || a.name.localeCompare(b.name, 'pt-BR'));
}

const RAW = /\bcrua?\b/;

/**
 * Candidatos a substituto: mesmo grupo, sem o próprio alimento, e no mesmo estado de preparo
 * (cru com cru, cozido/grelhado com preparado), para não sugerir "arroz cru" no lugar de "arroz cozido".
 */
export function substituteCandidates(food: Food, pool: Food[]): Food[] {
  const raw = RAW.test(normalizeSearch(food.name));
  return pool.filter((f) => f.id !== food.id && f.group === food.group && RAW.test(normalizeSearch(f.name)) === raw && f.per100g.energy_kcal != null);
}
