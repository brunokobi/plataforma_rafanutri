// U3a — Produção do dia: tipos e montagem das entradas do cálculo (@rafanutri/nutrition-core).
import { computeSheet, plannedPortions, requisition, wasteIndicators, type SheetInput, type WasteIndicators } from '@rafanutri/nutrition-core';
import type { MenuService, MenuSlot } from '@/lib/uan/menus';
import type { IngredientInfo, SheetGraph } from '@/lib/uan/techsheets';

export type WasteReason = 'taste' | 'temperature' | 'portion' | 'presentation' | 'repeated' | 'overproduction' | 'other';
export const WASTE_REASON_LABEL: Record<WasteReason, string> = {
  taste: 'Sabor', temperature: 'Temperatura', portion: 'Porção grande', presentation: 'Apresentação', repeated: 'Cardápio repetido', overproduction: 'Excesso de produção', other: 'Outro',
};

export interface ProductionIngredient extends IngredientInfo { purchase_unit: string; grams_per_unit: number | null }
export interface WasteRow { service: MenuService; sheet_root_id: string | null; produced_g: number | null; leftover_g: number | null; plate_waste_g: number | null; prep_waste_g: number | null; portions_served: number | null; reason: WasteReason | null; notes: string | null; recorded_at: string }
export interface ProductionDay {
  unit: { id: string; name: string };
  day: string;
  can_plan: boolean;
  can_record: boolean;
  can_see_cost: boolean;
  diners: Array<{ service: MenuService; planned: number | null; actual: number | null }>;
  menu: Array<{ service: MenuService; slot: MenuSlot; sheet_root_id: string; sheet_id: string | null; name: string; cycle_name: string }>;
  graph: { sheets: SheetGraph['sheets']; ingredients: ProductionIngredient[] };
  adhesion: Array<{ sheet_root_id: string; rate: number | null }>;
  /** Ajuste local de per capita por ficha (RN-221). */
  adjustments?: Array<{ sheet_root_id: string; portion_factor: number }>;
  waste: WasteRow[];
  history: Array<{ day: string; service: MenuService; diners: number | null; produced_g: number; leftover_g: number; plate_waste_g: number }>;
}

/** Entradas do cálculo a partir do grafo; o nome do insumo leva o id ("id|nome") para a requisição somar por insumo. */
export function sheetInputs(graph: ProductionDay['graph']): Map<string, SheetInput> {
  const ing = new Map(graph.ingredients.map((i) => [i.id, i]));
  const names = new Map(graph.sheets.map((s) => [s.id, s.name]));
  return new Map(graph.sheets.map((s) => [s.id, {
    id: s.id,
    servings: s.servings,
    cookedWeightG: s.cooked_weight_g,
    cookingIndex: s.cooking_index,
    items: s.items.map((it) => it.sub_sheet_id
      ? { kind: 'sub' as const, name: names.get(it.sub_sheet_id) ?? 'Sub-receita', grossG: it.gross_g, subId: it.sub_sheet_id }
      : { kind: 'ingredient' as const, name: `${it.ingredient_id}|${ing.get(it.ingredient_id!)?.name ?? 'Insumo'}`, grossG: it.gross_g, fc: it.fc ?? ing.get(it.ingredient_id!)?.default_fc ?? 1, pricePerKgCents: ing.get(it.ingredient_id!)?.price_per_kg_cents ?? null, per100g: ing.get(it.ingredient_id!)?.per100g ?? null }),
  }]));
}

export interface PrepLine { service: MenuService; slot: MenuSlot; rootId: string; sheetId: string; name: string; portions: number; adhesion: number | null; yieldG: number | null; costPerKgCents: number | null; factor?: number }

/** Lista de preparo: porções = comensais previstos × adesão média (100% sem histórico). */
export function prepList(d: ProductionDay, inputs: Map<string, SheetInput>): PrepLine[] {
  const adh = new Map(d.adhesion.map((a) => [a.sheet_root_id, a.rate]));
  const factors = new Map((d.adjustments ?? []).map((x) => [x.sheet_root_id, x.portion_factor]));
  const out: PrepLine[] = [];
  for (const m of d.menu) {
    if (!m.sheet_id || !inputs.has(m.sheet_id)) continue;
    const diners = d.diners.find((x) => x.service === m.service)?.planned ?? 0;
    const rate = adh.get(m.sheet_root_id) ?? null;
    const portions = plannedPortions(diners, rate ?? 1);
    let yieldG: number | null = null;
    let cpk: number | null = null;
    try {
      const r = computeSheet(m.sheet_id, inputs);
      yieldG = Math.round((r.yieldG * portions * (factors.get(m.sheet_root_id) ?? 1)) / inputs.get(m.sheet_id)!.servings);
      cpk = r.yieldG > 0 && r.missingPrices.length === 0 ? Math.round((r.costCents / r.yieldG) * 1000) : null;
    } catch {
      /* ficha incompleta: segue sem rendimento */
    }
    out.push({ service: m.service, slot: m.slot, rootId: m.sheet_root_id, sheetId: m.sheet_id, name: m.name, portions, adhesion: rate, yieldG, costPerKgCents: cpk, factor: factors.get(m.sheet_root_id) ?? 1 });
  }
  return out;
}

export interface ReqLine { id: string; name: string; grossG: number; from: string[]; purchaseQty: number | null; purchaseUnit: string }

/** Requisição consolidada do dia (todas as preparações), com a quantidade na unidade de compra. */
export function dayRequisition(prep: PrepLine[], inputs: Map<string, SheetInput>, ingredients: ProductionIngredient[], marginPct = 0): ReqLine[] {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  return requisition(prep.map((p) => ({ sheetId: p.sheetId, portions: p.portions * (p.factor ?? 1), label: p.name })), inputs, marginPct).map((l) => {
    const i = byId.get(l.key);
    const gpu = i?.grams_per_unit ?? null;
    return { id: l.key, name: l.name, grossG: l.grossG, from: l.from, purchaseQty: gpu ? Math.ceil((l.grossG / gpu) * 100) / 100 : null, purchaseUnit: i?.purchase_unit ?? 'kg' };
  });
}

/** Indicadores do serviço no dia: produzido e sobra das preparações, resto do registro do serviço, comensais realizados. */
export function serviceIndicators(d: ProductionDay, service: MenuService, prep: PrepLine[]): (WasteIndicators & { producedG: number; leftoverG: number; plateWasteG: number }) | null {
  const rows = d.waste.filter((w) => w.service === service);
  const producedG = rows.reduce((s, w) => s + (w.produced_g ?? 0), 0);
  const leftoverG = rows.reduce((s, w) => s + (w.leftover_g ?? 0), 0);
  const plateWasteG = rows.find((w) => w.sheet_root_id === null)?.plate_waste_g ?? 0;
  if (!producedG && !plateWasteG) return null;
  // custo por kg médio, ponderado pelo produzido de cada preparação com custo conhecido
  let weight = 0;
  let sum = 0;
  for (const w of rows) {
    const p = prep.find((x) => x.rootId === w.sheet_root_id && x.service === service);
    if (p?.costPerKgCents != null && w.produced_g) {
      weight += w.produced_g;
      sum += w.produced_g * p.costPerKgCents;
    }
  }
  const diners = d.diners.find((x) => x.service === service)?.actual ?? 0;
  return { ...wasteIndicators({ producedG, leftoverG, plateWasteG, diners, costPerKgCents: weight > 0 ? sum / weight : null }), producedG, leftoverG, plateWasteG };
}

export const kg = (g: number) => `${(g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
