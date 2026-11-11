'use server';

import type { Food } from './food';
import { foodsInGroupRepo, searchFoodsRepo } from './repository';

export type FoodsResult = { ok: true; foods: Food[] } | { ok: false; message: string };

const UNAVAILABLE = 'A base de alimentos está indisponível agora. Tente de novo em instantes.';

/** Busca na base de alimentos (TACO + alimentos do consultório), sem acento. */
export async function searchFoods(text: string): Promise<FoodsResult> {
  if (typeof text !== 'string' || text.length > 80) return { ok: true, foods: [] };
  const foods = await searchFoodsRepo(text);
  return foods ? { ok: true, foods } : { ok: false, message: UNAVAILABLE };
}

/** Alimentos de um grupo, para sugerir substituições equivalentes. */
export async function foodsInGroup(group: string): Promise<FoodsResult> {
  if (typeof group !== 'string' || group.length === 0 || group.length > 80) return { ok: true, foods: [] };
  const foods = await foodsInGroupRepo(group);
  return foods ? { ok: true, foods } : { ok: false, message: UNAVAILABLE };
}
