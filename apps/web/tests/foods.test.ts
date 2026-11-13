import { describe, expect, it } from 'vitest';
import { DEMO_PLAN } from '@/lib/demo/foods';
import { DEMO_TACO_CODES, DEMO_TO_TACO, demoPlanWithTaco } from '@/lib/demo/taco-plan';
import { foodSearchFilter, mapDirectusFood, normalizeSearch, rankFoods, searchWords, substituteCandidates, type Food } from '@/lib/foods/food';

const food = (id: string, name: string, group = 'G', measures: Food['householdMeasures'] = []): Food => ({
  id, name, group, source: 'TACO', householdMeasures: measures, per100g: { energy_kcal: 100 },
});

describe('busca de alimentos', () => {
  it('normaliza sem acento e em minúsculas', () => {
    expect(normalizeSearch('  FEIJÃO,  Carioca ')).toBe('feijão, carioca'.normalize('NFD').replace(/\p{Diacritic}/gu, ''));
    expect(searchWords('Feijão, carioca cozido!')).toEqual(['feijao', 'carioca', 'cozido']);
  });
  it('monta o filtro do Directus com todas as palavras', () => {
    expect(foodSearchFilter('feijão carioca')).toEqual({ _and: [{ archived: { _eq: false } }, { search_name: { _contains: 'feijao' } }, { search_name: { _contains: 'carioca' } }] });
  });
  it('não busca com texto vazio ou de 1 letra', () => {
    expect(foodSearchFilter('')).toBeNull();
    expect(foodSearchFilter(' a ')).toBeNull();
  });
  it('ordena: começa com a palavra, depois com medida caseira, depois nome curto', () => {
    const r = rankFoods(
      [food('1', 'Baião de dois, arroz e feijão'), food('2', 'Arroz, tipo 1, cru'), food('3', 'Arroz, tipo 1, cozido', 'G', [{ label: 'colher', grams: 25 }])],
      'arroz',
    );
    expect(r.map((f) => f.id)).toEqual(['3', '2', '1']);
  });
});

describe('mapDirectusFood', () => {
  it('converte nutrientes, mantém NA como null e valida medidas caseiras', () => {
    const f = mapDirectusFood({
      id: 561,
      name: 'Feijão, carioca, cozido',
      food_group: 'Leguminosas e derivados',
      source_id: { code: 'TACO' },
      household_measures: [{ label: 'concha média', grams: 80 }, { label: '', grams: 0 } as never],
      nutrients: [
        { amount_per_100g: '76.0000', nutrient_id: { code: 'energy_kcal' } },
        { amount_per_100g: '4.8000', nutrient_id: { code: 'protein_g' } },
        { amount_per_100g: null, nutrient_id: { code: 'fiber_g' } },
        { amount_per_100g: '1', nutrient_id: { code: 'sodium_mg' } },
      ],
    });
    expect(f).toMatchObject({ id: '561', group: 'Leguminosas e derivados', source: 'TACO', householdMeasures: [{ label: 'concha média', grams: 80 }] });
    expect(f.per100g).toEqual({ energy_kcal: 76, protein_g: 4.8, carbohydrate_g: null, lipid_g: null, fiber_g: null });
  });
});

describe('substituteCandidates', () => {
  it('mesmo grupo, mesmo estado de preparo, sem o próprio alimento', () => {
    const arroz = food('3', 'Arroz, tipo 1, cozido', 'Cereais');
    const pool = [arroz, food('4', 'Arroz, tipo 1, cru', 'Cereais'), food('5', 'Macarrão, cozido', 'Cereais'), food('6', 'Feijão, cozido', 'Leguminosas')];
    expect(substituteCandidates(arroz, pool).map((f) => f.id)).toEqual(['5']);
    const banana = food('182', 'Banana, prata, crua', 'Frutas');
    expect(substituteCandidates(banana, [banana, food('222', 'Maçã, Fuji, com casca, crua', 'Frutas')]).map((f) => f.id)).toEqual(['222']);
  });
});

describe('plano de exemplo com a TACO', () => {
  it('todo alimento do plano de exemplo tem um equivalente na TACO', () => {
    for (const m of DEMO_PLAN) for (const i of m.items) expect(DEMO_TO_TACO[i.foodId]).toBeDefined();
  });
  it('troca os ids e devolve null se faltar alimento', () => {
    const byCode = new Map(DEMO_TACO_CODES.map((c) => [c, food(`id-${c}`, `Alimento ${c}`)]));
    const r = demoPlanWithTaco(byCode)!;
    expect(r.plan[0]!.items[0]!.foodId).toBe(`id-${DEMO_TO_TACO[DEMO_PLAN[0]!.items[0]!.foodId]}`);
    byCode.delete(DEMO_TACO_CODES[0]!);
    expect(demoPlanWithTaco(byCode)).toBeNull();
  });
});
