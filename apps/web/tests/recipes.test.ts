import { describe, expect, it } from 'vitest';
import { allTags, filterRecipes, parseTags, recipeMeta } from '@/lib/recipes/filter';
import { DIFFICULTY_LABEL } from '@/lib/recipes/types';

const list = [
  { name: 'Panqueca de aveia', description: 'Café rápido', tags: ['café da manhã', 'sem lactose'] },
  { name: 'Escondidinho de mandioca', description: null, tags: ['almoço'] },
  { name: 'Pão de queijo fit', description: null, tags: ['lanche', 'café da manhã'] },
];

describe('RN-206/RN-207 — receitas', () => {
  it('lista as tags sem repetir, em ordem alfabética', () => {
    expect(allTags(list)).toEqual(['almoço', 'café da manhã', 'lanche', 'sem lactose']);
  });

  it('busca sem acento pelo nome, descrição e tags; filtra por tag', () => {
    expect(filterRecipes(list, 'pao', null).map((r) => r.name)).toEqual(['Pão de queijo fit']);
    expect(filterRecipes(list, 'RAPIDO', null).map((r) => r.name)).toEqual(['Panqueca de aveia']);
    expect(filterRecipes(list, '', 'café da manhã')).toHaveLength(2);
    expect(filterRecipes(list, 'mandioca', 'café da manhã')).toHaveLength(0);
  });

  it('resume porções, tempo e dificuldade', () => {
    expect(recipeMeta({ servings: 4, prep_minutes: 30, difficulty: 'easy' }, DIFFICULTY_LABEL)).toBe('4 porções · 30 min · Fácil');
    expect(recipeMeta({ servings: 1, prep_minutes: 90, difficulty: null }, DIFFICULTY_LABEL)).toBe('1 porção · 1 h 30 min');
    expect(recipeMeta({ servings: null, prep_minutes: 120, difficulty: 'hard' }, DIFFICULTY_LABEL)).toBe('2 h · Difícil');
    expect(recipeMeta({ servings: null, prep_minutes: null, difficulty: null }, DIFFICULTY_LABEL)).toBe('');
  });

  it('tags digitadas: minúsculas, sem repetir, até 10', () => {
    expect(parseTags(' Café da  Manhã, sem lactose,café da manhã ,, ')).toEqual(['café da manhã', 'sem lactose']);
    expect(parseTags(Array.from({ length: 12 }, (_, i) => `t${i}`).join(','))).toHaveLength(10);
  });
});
