import { describe, expect, it } from 'vitest';
import { balances, expiryStatus, qtyLabel, stockAlerts, type StockIngredient, type StockLot } from '@/lib/uan/stock';

const ing = (id: string, p: Partial<StockIngredient> = {}): StockIngredient => ({ id, name: id, category: 'other', purchase_unit: 'kg', min_stock: null, active: true, grams_per_unit: 1000, ...p });
const lot = (id: string, ingredient_id: string, quantity_g: number, expires_on: string | null): StockLot => ({ id, ingredient_id, lot_code: null, expires_on, quantity_g, received_at: '2026-11-01', supplier_name: null });

describe('estoque (U4a)', () => {
  it('quantidade na unidade de compra', () => {
    expect(qtyLabel(2500, ing('a'))).toBe('2,5 kg');
    expect(qtyLabel(10000, ing('b', { purchase_unit: 'cx', grams_per_unit: 5000 }))).toBe('2 caixa');
    expect(qtyLabel(300, ing('c', { grams_per_unit: null }))).toBe('300 g');
  });

  it('validade: vencido, vence em até 3 dias, ok', () => {
    expect(expiryStatus('2026-11-14', '2026-11-15')).toBe('expired');
    expect(expiryStatus('2026-11-18', '2026-11-15')).toBe('soon');
    expect(expiryStatus('2026-11-19', '2026-11-15')).toBe('ok');
    expect(expiryStatus(null, '2026-11-15')).toBe('none');
  });

  it('saldo, próxima validade, abaixo do mínimo e alertas', () => {
    const rows = balances({
      ingredients: [ing('leite', { min_stock: 10 }), ing('arroz'), ing('velho', { active: false })],
      lots: [lot('1', 'leite', 3000, '2026-11-20'), lot('2', 'leite', 2000, '2026-11-16'), lot('3', 'arroz', 1000, '2026-11-10')],
    });
    expect(rows.map((r) => r.ingredient.id)).toEqual(['leite', 'arroz']);
    const leite = rows[0]!;
    expect([leite.quantityG, leite.nextExpiry, leite.belowMin]).toEqual([5000, '2026-11-16', true]);
    expect(stockAlerts(rows, '2026-11-15')).toEqual({ expired: 1, soon: 1, belowMin: 1 });
  });
});
