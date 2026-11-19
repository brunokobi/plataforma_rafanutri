// U2b — Fichas técnicas: tipos, rótulos e montagem da entrada do cálculo (@rafanutri/nutrition-core).
import { computeSheet, type SheetInput, type SheetItem, type SheetResult } from '@rafanutri/nutrition-core';
import type { Allergen } from '@/lib/uan/catalog';

export type SheetCategory = 'main' | 'side' | 'garnish' | 'salad' | 'soup' | 'dessert' | 'bread' | 'beverage' | 'sauce' | 'base' | 'other';
export type SheetStatus = 'draft' | 'approved' | 'archived';

export const SHEET_CATEGORY_LABEL: Record<SheetCategory, string> = {
  main: 'Prato principal', side: 'Acompanhamento', garnish: 'Guarnição', salad: 'Salada', soup: 'Sopa', dessert: 'Sobremesa',
  bread: 'Pães', beverage: 'Bebida', sauce: 'Molho', base: 'Base / pré-preparo', other: 'Outro',
};
export const SHEET_STATUS_LABEL: Record<SheetStatus, string> = { draft: 'Rascunho', approved: 'Aprovada', archived: 'Arquivada' };

export const NUTRIENT_ROWS: Array<{ code: string; label: string; unit: string }> = [
  { code: 'energy_kcal', label: 'Energia', unit: 'kcal' },
  { code: 'protein_g', label: 'Proteína', unit: 'g' },
  { code: 'carbohydrate_g', label: 'Carboidrato', unit: 'g' },
  { code: 'lipid_g', label: 'Lipídeos', unit: 'g' },
  { code: 'saturated_fat_g', label: 'Gorduras saturadas', unit: 'g' },
  { code: 'fiber_g', label: 'Fibra', unit: 'g' },
  { code: 'sodium_mg', label: 'Sódio', unit: 'mg' },
  { code: 'calcium_mg', label: 'Cálcio', unit: 'mg' },
  { code: 'iron_mg', label: 'Ferro', unit: 'mg' },
  { code: 'vitamin_c_mg', label: 'Vitamina C', unit: 'mg' },
];

export interface IngredientInfo {
  id: string;
  name: string;
  default_fc: number;
  allergens: Allergen[];
  food_name: string | null;
  per100g: Record<string, number | null> | null;
  price_per_kg_cents: number | null;
}

export interface SheetItemRow { position: number; ingredient_id: string | null; sub_sheet_id: string | null; gross_g: number; fc: number | null; note: string | null }

export interface SheetData {
  id: string;
  organization_id: string;
  root_id: string;
  parent_id: string | null;
  version: number;
  name: string;
  category: SheetCategory;
  servings: number;
  cooked_weight_g: number | null;
  cooking_index: number | null;
  prep_minutes: number | null;
  equipment: string | null;
  notes: string | null;
  status: SheetStatus;
  computed: Record<string, unknown> | null;
  photo?: string | null;
  approved_at: string | null;
  updated_at: string | null;
  items: SheetItemRow[];
}

export interface SheetGraph { sheets: SheetData[]; ingredients: IngredientInfo[] }

export interface SheetDetail {
  sheet: Omit<SheetData, 'items'>;
  graph: SheetGraph;
  steps: Array<{ position: number; text: string; critical: boolean; target_temp: number | null }>;
  versions: Array<{ id: string; version: number; status: SheetStatus; approved_at: string | null; updated_at: string | null }>;
  can_edit: boolean;
  can_approve: boolean;
  can_new_version: boolean;
  can_see_cost: boolean;
  can_photo?: boolean;
  catalog: IngredientInfo[];
  sub_sheets: Array<{ id: string; name: string; version: number; status: SheetStatus }>;
}

export interface SheetListItem { id: string; root_id: string; version: number; name: string; category: SheetCategory; servings: number; status: SheetStatus; item_count: number; cost_per_serving_cents: number | null }
export interface SheetList { organization: { id: string; name: string }; can_edit: boolean; can_see_cost: boolean; items: SheetListItem[] }

/** Item editável (no editor, antes de salvar). */
export interface EditItem { ingredient_id: string | null; sub_sheet_id: string | null; gross: string; fc: string; note: string }
export interface EditSheet { servings: string; cooked_weight_g: string; cooking_index: string; items: EditItem[] }

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) ? n : null;
};

/** Monta a entrada do cálculo: a ficha editada (`edit`) por cima do grafo salvo. */
export function buildInputs(rootId: string, graph: SheetGraph, ingredients: IngredientInfo[], edit?: EditSheet): Map<string, SheetInput> {
  const ing = new Map(ingredients.map((i) => [i.id, i]));
  for (const i of graph.ingredients) if (!ing.has(i.id)) ing.set(i.id, i);
  const names = new Map(graph.sheets.map((s) => [s.id, s.name]));
  const map = new Map<string, SheetInput>();
  for (const s of graph.sheets) {
    const items: SheetItem[] = s.items.map((it) => toItem(it.ingredient_id, it.sub_sheet_id, it.gross_g, it.fc, ing, names));
    map.set(s.id, { id: s.id, items, cookedWeightG: s.cooked_weight_g, cookingIndex: s.cooking_index, servings: s.servings });
  }
  if (edit) {
    const items: SheetItem[] = edit.items
      .filter((it) => (it.ingredient_id || it.sub_sheet_id) && (num(it.gross) ?? 0) > 0)
      .map((it) => toItem(it.ingredient_id, it.sub_sheet_id, num(it.gross)!, num(it.fc), ing, names));
    map.set(rootId, { id: rootId, items, cookedWeightG: num(edit.cooked_weight_g), cookingIndex: num(edit.cooking_index), servings: Math.max(1, Math.round(num(edit.servings) ?? 1)) });
  }
  return map;
}

function toItem(ingredientId: string | null, subId: string | null, grossG: number, fc: number | null, ing: Map<string, IngredientInfo>, names: Map<string, string>): SheetItem {
  if (subId) return { kind: 'sub', name: names.get(subId) ?? 'Sub-receita', grossG, subId };
  const i = ing.get(ingredientId!);
  return {
    kind: 'ingredient',
    name: i?.name ?? 'Insumo',
    grossG,
    fc: fc !== null && fc >= 1 ? fc : (i?.default_fc ?? 1),
    pricePerKgCents: i?.price_per_kg_cents ?? null,
    per100g: i?.per100g ?? null,
  };
}

/** Calcula a ficha; null se faltar dado para o cálculo (ex.: sub-receita não carregada). */
export function calculate(rootId: string, inputs: Map<string, SheetInput>): SheetResult | null {
  try {
    return computeSheet(rootId, inputs);
  } catch {
    return null;
  }
}

/** Alergênicos da ficha: dos insumos, inclusive das sub-receitas (propagação calculada, RN-222). */
export function sheetAllergens(rootId: string, graph: SheetGraph, ingredients: IngredientInfo[], editItems?: EditItem[]): Allergen[] {
  const ing = new Map([...graph.ingredients, ...ingredients].map((i) => [i.id, i]));
  const sheets = new Map(graph.sheets.map((s) => [s.id, s]));
  const out = new Set<Allergen>();
  const seen = new Set<string>();
  const visit = (items: Array<{ ingredient_id: string | null; sub_sheet_id: string | null }>) => {
    for (const it of items) {
      if (it.ingredient_id) ing.get(it.ingredient_id)?.allergens.forEach((a) => out.add(a));
      if (it.sub_sheet_id && !seen.has(it.sub_sheet_id)) {
        seen.add(it.sub_sheet_id);
        visit(sheets.get(it.sub_sheet_id)?.items ?? []);
      }
    }
  };
  visit(editItems ?? sheets.get(rootId)?.items ?? []);
  return [...out];
}

/** Multiplica os pesos brutos (escalonamento para N porções). */
export function scaleItems(items: EditItem[], factor: number): EditItem[] {
  return items.map((it) => {
    const g = num(it.gross);
    return g === null ? it : { ...it, gross: String(Math.round(g * factor * 10) / 10).replace('.', ',') };
  });
}

/** Insumos ligados à base cujo dado de algum nutriente principal não foi analisado (NA na TACO). */
export function notAnalyzed(itemIds: Array<string | null>, ingredients: IngredientInfo[]): string[] {
  const main = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'lipid_g'];
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const out = new Set<string>();
  for (const id of itemIds) {
    const i = id ? byId.get(id) : undefined;
    if (i?.per100g && main.some((c) => i.per100g![c] === null || i.per100g![c] === undefined)) out.add(i.name);
  }
  return [...out];
}
