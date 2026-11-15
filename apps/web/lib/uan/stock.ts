// U4a — Estoque: tipos e regras de tela (quantidades em gramas, exibidas na unidade de compra).
import { UNIT_LABEL } from '@/lib/uan/catalog';

export interface StockIngredient { id: string; name: string; category: string; purchase_unit: keyof typeof UNIT_LABEL; min_stock: number | null; active: boolean; grams_per_unit: number | null }
export interface StockLot { id: string; ingredient_id: string; lot_code: string | null; expires_on: string | null; quantity_g: number; received_at: string; supplier_name: string | null }
export interface StockMove { id: number; kind: 'in' | 'out_production' | 'out_loss' | 'adjustment'; quantity_g: number; reason: string | null; created_at: string; ingredient_name: string; ingredient_id: string; user_name: string | null }
export interface StockData {
  unit: { id: string; name: string };
  today: string;
  can_move: boolean;
  can_approve: boolean;
  open_inventory: { id: string; created_at: string } | null;
  suppliers: Array<{ id: string; name: string }>;
  ingredients: StockIngredient[];
  lots: StockLot[];
  movements: StockMove[];
}
export interface InventoryData {
  inventory: { id: string; unit_id: string; status: 'open' | 'approved' | 'cancelled'; created_at: string; approved_at: string | null };
  unit: { id: string; name: string };
  can_approve: boolean;
  counts: Array<{ ingredient_id: string; name: string; category: string; purchase_unit: keyof typeof UNIT_LABEL; grams_per_unit: number | null; system_g: number | null; counted_g: number | null; reason: string | null }>;
}

export const MOVE_LABEL: Record<StockMove['kind'], string> = { in: 'Entrada', out_production: 'Saída para produção', out_loss: 'Perda', adjustment: 'Ajuste de inventário' };

/** Quantidade na unidade de compra ("2,5 kg", "3 caixa"); em gramas se a unidade não tiver peso. */
export function qtyLabel(grams: number, ing: Pick<StockIngredient, 'purchase_unit' | 'grams_per_unit'>): string {
  if (!ing.grams_per_unit) return `${grams.toLocaleString('pt-BR')} g`;
  const q = Math.round((grams / ing.grams_per_unit) * 100) / 100;
  return `${q.toLocaleString('pt-BR')} ${UNIT_LABEL[ing.purchase_unit]}`;
}
export const toUnits = (grams: number, gpu: number | null) => (gpu ? Math.round((grams / gpu) * 100) / 100 : null);

/** Situação da validade: vencido, vence em até 3 dias, ok, sem validade. */
export function expiryStatus(expires: string | null, today: string): 'expired' | 'soon' | 'ok' | 'none' {
  if (!expires) return 'none';
  const days = Math.round((Date.parse(`${expires}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= 3) return 'soon';
  return 'ok';
}

export interface BalanceRow { ingredient: StockIngredient; quantityG: number; lots: StockLot[]; nextExpiry: string | null; belowMin: boolean }

/** Saldo por insumo (com lotes), abaixo do mínimo (mínimo em unidades de compra). Só insumos ativos ou com saldo. */
export function balances(d: Pick<StockData, 'ingredients' | 'lots'>): BalanceRow[] {
  return d.ingredients
    .map((ing) => {
      const lots = d.lots.filter((l) => l.ingredient_id === ing.id);
      const quantityG = lots.reduce((s, l) => s + l.quantity_g, 0);
      const minG = ing.min_stock !== null && ing.grams_per_unit ? ing.min_stock * ing.grams_per_unit : null;
      const nextExpiry = lots.map((l) => l.expires_on).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
      return { ingredient: ing, quantityG, lots, nextExpiry, belowMin: minG !== null && quantityG < minG };
    })
    .filter((r) => r.ingredient.active || r.quantityG > 0);
}

/** Alertas: lotes vencidos ou vencendo em até 3 dias e insumos abaixo do mínimo. */
export function stockAlerts(rows: BalanceRow[], today: string): { expired: number; soon: number; belowMin: number } {
  let expired = 0;
  let soon = 0;
  for (const r of rows) for (const l of r.lots) {
    const s = expiryStatus(l.expires_on, today);
    if (s === 'expired') expired++;
    else if (s === 'soon') soon++;
  }
  return { expired, soon, belowMin: rows.filter((r) => r.belowMin).length };
}
