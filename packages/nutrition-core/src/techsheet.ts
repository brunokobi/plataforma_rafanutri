// RN-130 — Ficha técnica de preparação (UAN): pesos, rendimento, custo e nutrientes, com sub-receitas.
import { NutritionInputError } from './errors';
import type { NutrientValues } from './plan';

/** Item da ficha: insumo (peso bruto, FC, preço por kg, nutrientes por 100 g) ou sub-receita (peso da preparação pronta usada). */
export type SheetItem =
  | { kind: 'ingredient'; name: string; grossG: number; fc: number; pricePerKgCents: number | null; per100g: NutrientValues | null }
  | { kind: 'sub'; name: string; grossG: number; subId: string };

export interface SheetInput {
  id: string;
  items: SheetItem[];
  /** Peso pronto medido; tem prioridade sobre o IC. */
  cookedWeightG?: number | null;
  /** Índice de cocção (peso pronto ÷ peso líquido). */
  cookingIndex?: number | null;
  servings: number;
}

export interface SheetResult {
  grossG: number;
  netG: number;
  yieldG: number;
  /** IC efetivo (rendimento ÷ peso líquido). */
  cookingIndex: number;
  costCents: number;
  costPerServingCents: number;
  portionG: number;
  totals: Record<string, number>;
  per100g: Record<string, number>;
  perServing: Record<string, number>;
  /** Itens sem vínculo nutricional (o total é um mínimo). */
  missingNutrients: string[];
  /** Itens sem preço (o custo é um mínimo). */
  missingPrices: string[];
}

/** Peso líquido pelo FC: PB = 1000 g e FC = 1,25 → PL = 800 g. */
export function netWeight(grossG: number, fc: number): number {
  if (!Number.isFinite(fc) || fc < 1) throw new NutritionInputError('OUT_OF_RANGE', 'fc', 'O fator de correção é 1 ou mais.');
  if (!Number.isFinite(grossG) || grossG < 0) throw new NutritionInputError('INVALID_INPUT', 'grossG', 'Peso bruto inválido.');
  return grossG / fc;
}

/** FC = PB ÷ PL. */
export function correctionFactor(grossG: number, netG: number): number {
  if (!(netG > 0) || !(grossG >= netG)) throw new NutritionInputError('INVALID_INPUT', 'netG', 'O peso líquido precisa ser maior que zero e até o peso bruto.');
  return grossG / netG;
}

/** IC = peso pronto ÷ peso líquido: PL 800 g e pronto 640 g → 0,80. */
export function cookingIndex(netG: number, cookedG: number): number {
  if (!(netG > 0) || !(cookedG > 0)) throw new NutritionInputError('INVALID_INPUT', 'cookedG', 'Pesos precisam ser maiores que zero.');
  return cookedG / netG;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Calcula a ficha `id` com as sub-receitas de `sheets` (memoizado; ciclo gera erro).
 * Sub-receita: o peso usado é da preparação pronta; entra a fração (peso usado ÷ rendimento da sub) do custo e dos nutrientes.
 */
export function computeSheet(id: string, sheets: ReadonlyMap<string, SheetInput>, memo = new Map<string, SheetResult>(), path: string[] = []): SheetResult {
  const cached = memo.get(id);
  if (cached) return cached;
  if (path.includes(id)) throw new NutritionInputError('INVALID_INPUT', 'subId', 'Sub-receita em ciclo.');
  const sheet = sheets.get(id);
  if (!sheet) throw new NutritionInputError('MISSING_FIELD', 'subId', 'Sub-receita não encontrada.');
  if (!(sheet.servings > 0)) throw new NutritionInputError('OUT_OF_RANGE', 'servings', 'Informe as porções.');

  let grossG = 0;
  let netG = 0;
  let costCents = 0;
  const totals: Record<string, number> = {};
  const missingNutrients: string[] = [];
  const missingPrices: string[] = [];
  const add = (values: Record<string, number | null>, factor: number) => {
    for (const [k, v] of Object.entries(values)) if (v !== null && Number.isFinite(v)) totals[k] = (totals[k] ?? 0) + v * factor;
  };

  for (const item of sheet.items) {
    if (item.kind === 'ingredient') {
      const net = netWeight(item.grossG, item.fc);
      grossG += item.grossG;
      netG += net;
      if (item.pricePerKgCents === null) missingPrices.push(item.name);
      else costCents += (item.pricePerKgCents * item.grossG) / 1000;
      // Nutrientes pela parte comestível (peso líquido)
      if (item.per100g === null) missingNutrients.push(item.name);
      else add(item.per100g, net / 100);
    } else {
      const sub = computeSheet(item.subId, sheets, memo, [...path, id]);
      const fraction = sub.yieldG > 0 ? item.grossG / sub.yieldG : 0;
      grossG += item.grossG;
      netG += item.grossG;
      costCents += sub.costCents * fraction;
      add(sub.totals, fraction);
      for (const n of sub.missingNutrients) if (!missingNutrients.includes(n)) missingNutrients.push(n);
      for (const n of sub.missingPrices) if (!missingPrices.includes(n)) missingPrices.push(n);
    }
  }

  const yieldG = sheet.cookedWeightG && sheet.cookedWeightG > 0 ? sheet.cookedWeightG : netG * (sheet.cookingIndex && sheet.cookingIndex > 0 ? sheet.cookingIndex : 1);
  const per100g: Record<string, number> = {};
  const perServing: Record<string, number> = {};
  for (const [k, v] of Object.entries(totals)) {
    per100g[k] = yieldG > 0 ? round((v / yieldG) * 100) : 0;
    perServing[k] = round(v / sheet.servings);
    totals[k] = round(v);
  }
  const result: SheetResult = {
    grossG: round(grossG, 1),
    netG: round(netG, 1),
    yieldG: round(yieldG, 1),
    cookingIndex: netG > 0 ? round(yieldG / netG, 3) : 0,
    costCents: Math.round(costCents),
    costPerServingCents: Math.round(costCents / sheet.servings),
    portionG: round(yieldG / sheet.servings, 1),
    totals,
    per100g,
    perServing,
    missingNutrients,
    missingPrices,
  };
  memo.set(id, result);
  return result;
}

/** Fator para escalar a ficha de `from` para `to` porções (10 → 250 = 25). */
export function scaleFactor(from: number, to: number): number {
  if (!(from > 0) || !(to > 0)) throw new NutritionInputError('OUT_OF_RANGE', 'servings', 'Porções precisam ser maiores que zero.');
  return to / from;
}
