// Base de alimentos DE EXEMPLO, com valores aproximados por 100 g.
// Não usar para fins clínicos: a base oficial (TACO/TBCA) entra com a importação do RN-011.
import type { HouseholdMeasure, NutrientValues } from '@rafanutri/nutrition-core';

export type FoodGroup = 'Cereais e tubérculos' | 'Leguminosas' | 'Carnes e ovos' | 'Laticínios' | 'Frutas' | 'Hortaliças' | 'Gorduras e oleaginosas';

export interface DemoFood {
  id: string;
  name: string;
  group: FoodGroup;
  per100g: NutrientValues;
  householdMeasures: HouseholdMeasure[];
}

const n = (energy_kcal: number, protein_g: number, carbohydrate_g: number, lipid_g: number, fiber_g: number | null): NutrientValues => ({
  energy_kcal, protein_g, carbohydrate_g, lipid_g, fiber_g,
});

export const DEMO_FOODS: DemoFood[] = [
  { id: 'arroz', name: 'Arroz branco, cozido', group: 'Cereais e tubérculos', per100g: n(128, 2.5, 28.1, 0.2, 1.6), householdMeasures: [{ label: 'colher de sopa', grams: 25 }, { label: 'escumadeira', grams: 45 }] },
  { id: 'arroz-integral', name: 'Arroz integral, cozido', group: 'Cereais e tubérculos', per100g: n(124, 2.6, 25.8, 1.0, 2.7), householdMeasures: [{ label: 'colher de sopa', grams: 25 }, { label: 'escumadeira', grams: 45 }] },
  { id: 'macarrao', name: 'Macarrão, cozido', group: 'Cereais e tubérculos', per100g: n(158, 5.8, 30.9, 0.9, 1.8), householdMeasures: [{ label: 'pegador', grams: 50 }] },
  { id: 'batata-doce', name: 'Batata-doce, cozida', group: 'Cereais e tubérculos', per100g: n(77, 0.6, 18.4, 0.1, 2.2), householdMeasures: [{ label: 'colher de sopa', grams: 30 }, { label: 'unidade média', grams: 150 }] },
  { id: 'pao-frances', name: 'Pão francês', group: 'Cereais e tubérculos', per100g: n(300, 8.0, 58.6, 3.1, 2.3), householdMeasures: [{ label: 'unidade', grams: 50 }] },
  { id: 'pao-integral', name: 'Pão de forma integral', group: 'Cereais e tubérculos', per100g: n(253, 9.4, 49.9, 3.7, 6.9), householdMeasures: [{ label: 'fatia', grams: 25 }] },
  { id: 'aveia', name: 'Aveia em flocos', group: 'Cereais e tubérculos', per100g: n(394, 13.9, 66.6, 8.5, 9.1), householdMeasures: [{ label: 'colher de sopa', grams: 15 }] },
  { id: 'tapioca', name: 'Tapioca (goma hidratada)', group: 'Cereais e tubérculos', per100g: n(240, 0.0, 60.0, 0.0, 0.5), householdMeasures: [{ label: 'colher de sopa', grams: 15 }] },
  { id: 'feijao', name: 'Feijão carioca, cozido', group: 'Leguminosas', per100g: n(76, 4.8, 13.6, 0.5, 8.5), householdMeasures: [{ label: 'concha média', grams: 80 }] },
  { id: 'lentilha', name: 'Lentilha, cozida', group: 'Leguminosas', per100g: n(93, 6.3, 16.3, 0.5, 7.9), householdMeasures: [{ label: 'concha média', grams: 80 }] },
  { id: 'grao-de-bico', name: 'Grão-de-bico, cozido', group: 'Leguminosas', per100g: n(164, 8.9, 27.4, 2.6, 7.6), householdMeasures: [{ label: 'colher de sopa', grams: 22 }] },
  { id: 'frango', name: 'Peito de frango, grelhado', group: 'Carnes e ovos', per100g: n(159, 32.0, 0.0, 2.5, null), householdMeasures: [{ label: 'filé médio', grams: 100 }] },
  { id: 'patinho', name: 'Patinho, grelhado', group: 'Carnes e ovos', per100g: n(219, 35.9, 0.0, 7.3, null), householdMeasures: [{ label: 'bife médio', grams: 100 }] },
  { id: 'tilapia', name: 'Tilápia, grelhada', group: 'Carnes e ovos', per100g: n(128, 26.0, 0.0, 2.7, null), householdMeasures: [{ label: 'filé médio', grams: 120 }] },
  { id: 'ovo', name: 'Ovo de galinha, cozido', group: 'Carnes e ovos', per100g: n(146, 13.3, 0.6, 9.5, null), householdMeasures: [{ label: 'unidade', grams: 50 }] },
  { id: 'iogurte-zero-lactose', name: 'Iogurte natural sem lactose', group: 'Laticínios', per100g: n(51, 4.1, 1.9, 3.0, null), householdMeasures: [{ label: 'pote', grams: 170 }] },
  { id: 'leite-zero-lactose', name: 'Leite semidesnatado sem lactose', group: 'Laticínios', per100g: n(43, 3.1, 4.8, 1.2, null), householdMeasures: [{ label: 'copo americano', grams: 190 }] },
  { id: 'queijo-minas', name: 'Queijo minas frescal', group: 'Laticínios', per100g: n(264, 17.4, 3.2, 20.2, null), householdMeasures: [{ label: 'fatia média', grams: 30 }] },
  { id: 'banana', name: 'Banana prata', group: 'Frutas', per100g: n(98, 1.3, 26.0, 0.1, 2.0), householdMeasures: [{ label: 'unidade média', grams: 70 }] },
  { id: 'maca', name: 'Maçã', group: 'Frutas', per100g: n(56, 0.3, 15.2, 0.0, 1.3), householdMeasures: [{ label: 'unidade média', grams: 130 }] },
  { id: 'mamao', name: 'Mamão papaia', group: 'Frutas', per100g: n(40, 0.5, 10.4, 0.1, 1.0), householdMeasures: [{ label: 'fatia média', grams: 100 }] },
  { id: 'morango', name: 'Morango', group: 'Frutas', per100g: n(30, 0.9, 6.8, 0.3, 1.7), householdMeasures: [{ label: 'unidade', grams: 12 }] },
  { id: 'brocolis', name: 'Brócolis, cozido', group: 'Hortaliças', per100g: n(25, 2.1, 4.4, 0.5, 3.4), householdMeasures: [{ label: 'colher de sopa', grams: 15 }] },
  { id: 'alface', name: 'Alface', group: 'Hortaliças', per100g: n(11, 1.3, 1.7, 0.2, 1.8), householdMeasures: [{ label: 'folha', grams: 10 }] },
  { id: 'tomate', name: 'Tomate', group: 'Hortaliças', per100g: n(15, 1.1, 3.1, 0.2, 1.2), householdMeasures: [{ label: 'rodela', grams: 15 }] },
  { id: 'cenoura', name: 'Cenoura crua', group: 'Hortaliças', per100g: n(34, 1.3, 7.7, 0.2, 3.2), householdMeasures: [{ label: 'colher de sopa ralada', grams: 12 }] },
  { id: 'azeite', name: 'Azeite de oliva', group: 'Gorduras e oleaginosas', per100g: n(884, 0.0, 0.0, 100.0, null), householdMeasures: [{ label: 'colher de chá', grams: 4 }, { label: 'colher de sopa', grams: 8 }] },
  { id: 'castanha', name: 'Castanha-do-pará', group: 'Gorduras e oleaginosas', per100g: n(643, 14.5, 15.1, 63.5, 7.9), householdMeasures: [{ label: 'unidade', grams: 4 }] },
  { id: 'pasta-amendoim', name: 'Pasta de amendoim', group: 'Gorduras e oleaginosas', per100g: n(588, 25.0, 20.0, 50.0, 6.0), householdMeasures: [{ label: 'colher de sopa', grams: 15 }] },
];

export const foodById = (id: string) => DEMO_FOODS.find((f) => f.id === id);

export function searchDemoFoods(query: string, limit = 8): DemoFood[] {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = norm(query.trim());
  if (!q) return [];
  return DEMO_FOODS.filter((f) => norm(f.name).includes(q)).slice(0, limit);
}

export interface DemoPlanItem {
  key: string;
  foodId: string;
  quantityG: number;
}
export interface DemoMeal {
  id: string;
  name: string;
  time: string;
  items: DemoPlanItem[];
}

/** Plano inicial de exemplo para a paciente fictícia. */
export const DEMO_PLAN: DemoMeal[] = [
  { id: 'cafe', name: 'Café da manhã', time: '07:30', items: [
    { key: 'c1', foodId: 'pao-integral', quantityG: 75 },
    { key: 'c2', foodId: 'ovo', quantityG: 50 },
    { key: 'c3', foodId: 'mamao', quantityG: 100 },
    { key: 'c4', foodId: 'banana', quantityG: 70 },
  ] },
  { id: 'almoco', name: 'Almoço', time: '12:30', items: [
    { key: 'a1', foodId: 'arroz', quantityG: 150 },
    { key: 'a2', foodId: 'feijao', quantityG: 160 },
    { key: 'a3', foodId: 'frango', quantityG: 120 },
    { key: 'a4', foodId: 'brocolis', quantityG: 60 },
    { key: 'a5', foodId: 'azeite', quantityG: 4 },
  ] },
  { id: 'lanche', name: 'Lanche', time: '16:00', items: [
    { key: 'l1', foodId: 'iogurte-zero-lactose', quantityG: 170 },
    { key: 'l2', foodId: 'aveia', quantityG: 30 },
    { key: 'l3', foodId: 'morango', quantityG: 120 },
    { key: 'l4', foodId: 'castanha', quantityG: 12 },
  ] },
  { id: 'jantar', name: 'Jantar', time: '19:30', items: [
    { key: 'j1', foodId: 'batata-doce', quantityG: 150 },
    { key: 'j2', foodId: 'tilapia', quantityG: 120 },
    { key: 'j3', foodId: 'alface', quantityG: 30 },
    { key: 'j4', foodId: 'tomate', quantityG: 45 },
    { key: 'j5', foodId: 'azeite', quantityG: 8 },
  ] },
];
