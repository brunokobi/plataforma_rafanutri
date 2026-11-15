// RN-125 — Unidades de compra dos insumos da UAN: conversão para gramas e preço.
import { NutritionInputError } from './errors';

export type PurchaseUnit = 'kg' | 'g' | 'l' | 'ml' | 'un' | 'dz' | 'cx' | 'pct';

export const PURCHASE_UNIT_LABEL: Record<PurchaseUnit, string> = {
  kg: 'quilo (kg)', g: 'grama (g)', l: 'litro (L)', ml: 'mililitro (mL)', un: 'unidade', dz: 'dúzia', cx: 'caixa', pct: 'pacote',
};

/** Dados do insumo para converter: densidade (g/mL) para volume; peso da unidade; peso da embalagem (cx, pct). */
export interface UnitInfo {
  densityGMl?: number | null;
  unitWeightG?: number | null;
  packGrams?: number | null;
}

/**
 * Quantidade em gramas.
 * - kg/g: massa direta; l/ml: volume × densidade (padrão 1 g/mL);
 * - un: × peso da unidade; dz: 12 × peso da unidade; cx/pct: × peso da embalagem.
 * Ex.: 1 L de leite com densidade 1,03 = 1030 g.
 */
export function toGrams(quantity: number, unit: PurchaseUnit, info: UnitInfo = {}): number {
  if (!Number.isFinite(quantity) || quantity < 0) throw new NutritionInputError('INVALID_INPUT', 'quantity', 'Quantidade inválida.');
  const positive = (v: number | null | undefined, what: string) => {
    if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) throw new NutritionInputError('MISSING_FIELD', what, `Informe ${what}.`);
    return v;
  };
  switch (unit) {
    case 'kg': return quantity * 1000;
    case 'g': return quantity;
    case 'l': return quantity * 1000 * (info.densityGMl ?? 1);
    case 'ml': return quantity * (info.densityGMl ?? 1);
    case 'un': return quantity * positive(info.unitWeightG, 'o peso da unidade');
    case 'dz': return quantity * 12 * positive(info.unitWeightG, 'o peso da unidade');
    case 'cx':
    case 'pct': return quantity * positive(info.packGrams, 'o peso da embalagem');
  }
}

/** Preço por kg (centavos) a partir do preço da unidade de compra. */
export function pricePerKgCents(priceCents: number, unit: PurchaseUnit, info: UnitInfo = {}): number {
  const grams = toGrams(1, unit, info);
  if (grams <= 0) throw new NutritionInputError('INVALID_INPUT', 'unit', 'Unidade sem peso.');
  return Math.round((priceCents * 1000) / grams);
}

export interface PricePoint {
  valid_from: string; // AAAA-MM-DD
  price_cents: number;
  created_at?: string;
}

/** Preço vigente na data: o de maior `valid_from` até a data (empate: o registrado por último). */
export function currentPrice<T extends PricePoint>(prices: T[], date: string): T | null {
  let best: T | null = null;
  for (const p of prices) {
    if (p.valid_from > date) continue;
    if (!best || p.valid_from > best.valid_from || (p.valid_from === best.valid_from && (p.created_at ?? '') > (best.created_at ?? ''))) best = p;
  }
  return best;
}

/** Peso bruto a comprar para um peso líquido, pelo fator de correção (FC = bruto ÷ líquido, ≥ 1). */
export function grossFromNet(netGrams: number, fc: number): number {
  if (!Number.isFinite(fc) || fc < 1) throw new NutritionInputError('OUT_OF_RANGE', 'fc', 'O fator de correção é 1 ou mais.');
  return netGrams * fc;
}
