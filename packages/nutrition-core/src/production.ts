// U3 — Produção da UAN: porções pela adesão, lista de preparo, requisição consolidada e desperdício.
import { NutritionInputError } from './errors';
import type { SheetInput } from './techsheet';
import { computeSheet } from './techsheet';

/** Porções a produzir: comensais × adesão (0 a 1), arredondado para cima. 300 × 60% = 180. */
export function plannedPortions(diners: number, adhesion = 1): number {
  if (!Number.isFinite(diners) || diners < 0) throw new NutritionInputError('INVALID_INPUT', 'diners', 'Comensais inválidos.');
  if (!Number.isFinite(adhesion) || adhesion < 0 || adhesion > 1.5) throw new NutritionInputError('OUT_OF_RANGE', 'adhesion', 'Adesão entre 0 e 150%.');
  return Math.ceil(diners * adhesion - 1e-9);
}

/** Adesão média (porções servidas ÷ comensais) das últimas ocorrências; null sem histórico. */
export function averageAdhesion(history: Array<{ portionsServed: number; diners: number }>): number | null {
  const valid = history.filter((h) => h.diners > 0 && h.portionsServed >= 0);
  if (!valid.length) return null;
  const served = valid.reduce((s, h) => s + h.portionsServed, 0);
  const diners = valid.reduce((s, h) => s + h.diners, 0);
  return Math.round((served / diners) * 1000) / 1000;
}

export interface RequisitionLine {
  /** Id do insumo (ou o nome, se não houver id). */
  key: string;
  name: string;
  grossG: number;
  /** De quais preparações vem. */
  from: string[];
}

/**
 * Requisição do dia: para cada preparação (raiz da ficha) e as porções a produzir, escala a ficha
 * (porções ÷ porções da ficha) e soma os insumos, entrando nas sub-receitas pela fração do rendimento.
 * Mesmo insumo de pratos diferentes vira uma linha só. `marginPct` acrescenta a margem de segurança.
 * Os itens de insumo precisam de `key` no nome no formato "id|nome" (gerado por quem monta a entrada).
 */
export function requisition(
  preparations: Array<{ sheetId: string; portions: number; label: string }>,
  sheets: ReadonlyMap<string, SheetInput>,
  marginPct = 0,
): RequisitionLine[] {
  const lines = new Map<string, RequisitionLine>();
  const memo = new Map();
  const add = (sheetId: string, factor: number, label: string, path: string[]) => {
    if (path.includes(sheetId)) throw new NutritionInputError('INVALID_INPUT', 'subId', 'Sub-receita em ciclo.');
    const s = sheets.get(sheetId);
    if (!s) throw new NutritionInputError('MISSING_FIELD', 'subId', 'Ficha não encontrada.');
    for (const it of s.items) {
      if (it.kind === 'ingredient') {
        const [key, name] = it.name.includes('|') ? [it.name.split('|')[0]!, it.name.split('|').slice(1).join('|')] : [it.name, it.name];
        const cur = lines.get(key) ?? { key, name, grossG: 0, from: [] };
        cur.grossG += it.grossG * factor;
        if (!cur.from.includes(label)) cur.from.push(label);
        lines.set(key, cur);
      } else {
        const sub = computeSheet(it.subId, sheets, memo);
        if (sub.yieldG > 0) add(it.subId, (it.grossG * factor) / sub.yieldG, label, [...path, sheetId]);
      }
    }
  };
  for (const p of preparations) {
    const s = sheets.get(p.sheetId);
    if (!s || !(s.servings > 0) || p.portions <= 0) continue;
    add(p.sheetId, p.portions / s.servings, p.label, []);
  }
  const m = 1 + Math.max(0, marginPct) / 100;
  return [...lines.values()]
    .map((l) => ({ ...l, grossG: Math.round(l.grossG * m) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export interface WasteInput {
  producedG: number;
  leftoverG: number;
  plateWasteG: number;
  diners: number;
  /** Custo por kg das preparações (média ponderada), em centavos. */
  costPerKgCents?: number | null;
}

export interface WasteIndicators {
  distributedG: number;
  leftoverPct: number | null;
  plateWastePct: number | null;
  perCapitaWasteG: number | null;
  acceptancePct: number | null;
  wasteCostCents: number | null;
}

/**
 * Indicadores de desperdício (plano do módulo, seção 5):
 * distribuído = produzido − sobra; % sobra = sobra ÷ produzido; % resto = resto ÷ distribuído;
 * per capita de resto = resto ÷ comensais; aceitação = 100 − % resto; custo = (sobra + resto) × custo por kg.
 * 100 kg produzidos, 4 kg de sobra e 8 kg de resto → 4% de sobra e 8,3% de resto-ingesta.
 */
export function wasteIndicators(w: WasteInput): WasteIndicators {
  for (const [k, v] of Object.entries({ producedG: w.producedG, leftoverG: w.leftoverG, plateWasteG: w.plateWasteG, diners: w.diners })) {
    if (!Number.isFinite(v) || v < 0) throw new NutritionInputError('INVALID_INPUT', k, 'Valor inválido.');
  }
  if (w.leftoverG > w.producedG) throw new NutritionInputError('OUT_OF_RANGE', 'leftoverG', 'A sobra não pode passar do produzido.');
  const distributedG = w.producedG - w.leftoverG;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const leftoverPct = w.producedG > 0 ? r1((w.leftoverG / w.producedG) * 100) : null;
  const plateWastePct = distributedG > 0 ? r1((w.plateWasteG / distributedG) * 100) : null;
  return {
    distributedG,
    leftoverPct,
    plateWastePct,
    perCapitaWasteG: w.diners > 0 ? r1(w.plateWasteG / w.diners) : null,
    acceptancePct: plateWastePct === null ? null : r1(100 - plateWastePct),
    wasteCostCents: w.costPerKgCents === null || w.costPerKgCents === undefined ? null : Math.round(((w.leftoverG + w.plateWasteG) / 1000) * w.costPerKgCents),
  };
}

/** FC real medido no pré-preparo e a diferença para o FC da ficha (%). */
export function realCorrectionFactor(grossG: number, netG: number, sheetFc: number): { fc: number; diffPct: number } {
  if (!(netG > 0) || !(grossG >= netG)) throw new NutritionInputError('INVALID_INPUT', 'netG', 'Pesos inválidos.');
  const fc = Math.round((grossG / netG) * 1000) / 1000;
  return { fc, diffPct: Math.round(((fc - sheetFc) / sheetFc) * 1000) / 10 };
}

export interface PurchaseLine {
  key: string;
  name: string;
  /** Necessidade bruta do período (já com o FC e a margem). */
  needG: number;
  stockG: number;
  openOrdersG: number;
  /** A comprar em gramas (necessidade − estoque − pedidos em aberto; nunca negativo). */
  toBuyG: number;
  /** A comprar na unidade de compra, arredondado para cima (null se a unidade não tem peso). */
  toBuyUnits: number | null;
}

/**
 * RN-139 — Necessidade de compra do período: soma as requisições de cada dia (cardápio × porções × fichas,
 * com sub-receitas), aplica a margem, desconta estoque e pedidos em aberto e arredonda para a unidade de compra.
 */
export function purchaseRequirements(
  days: Array<Array<{ sheetId: string; portions: number; label: string }>>,
  sheets: ReadonlyMap<string, SheetInput>,
  stockG: ReadonlyMap<string, number>,
  openOrdersG: ReadonlyMap<string, number>,
  gramsPerUnit: ReadonlyMap<string, number | null>,
  marginPct = 0,
): PurchaseLine[] {
  const need = new Map<string, { name: string; g: number }>();
  for (const preps of days) {
    for (const l of requisition(preps, sheets, 0)) {
      const cur = need.get(l.key) ?? { name: l.name, g: 0 };
      cur.g += l.grossG;
      need.set(l.key, cur);
    }
  }
  const m = 1 + Math.max(0, marginPct) / 100;
  return [...need.entries()]
    .map(([key, v]) => {
      const needG = Math.round(v.g * m);
      const st = stockG.get(key) ?? 0;
      const oo = openOrdersG.get(key) ?? 0;
      const toBuyG = Math.max(0, needG - st - oo);
      const gpu = gramsPerUnit.get(key) ?? null;
      return { key, name: v.name, needG, stockG: st, openOrdersG: oo, toBuyG, toBuyUnits: gpu ? Math.ceil(toBuyG / gpu - 1e-9) : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
