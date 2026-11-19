// U4b — Compras: necessidade do período, pedidos por fornecedor e regras do recebimento.
import { plannedPortions, purchaseRequirements, type PurchaseLine } from '@rafanutri/nutrition-core';
import type { MenuService, MenuSlot } from '@/lib/uan/menus';
import { sheetInputs, type ProductionDay } from '@/lib/uan/production';

export interface NeedsData {
  unit: { id: string; name: string };
  from: string;
  to: string;
  days: Array<{ day: string; items: Array<{ service: MenuService; slot: MenuSlot; sheet_root_id: string; sheet_id: string | null; name: string }> }>;
  diners: Array<{ day: string; service: MenuService; planned: number | null }>;
  graph: ProductionDay['graph'];
  adhesion: Array<{ sheet_root_id: string; rate: number | null }>;
  /** Ajuste local de per capita por ficha (RN-221). */
  adjustments?: Array<{ sheet_root_id: string; portion_factor: number }>;
  stock: Array<{ ingredient_id: string; quantity_g: number }>;
  open_orders: Array<{ ingredient_id: string; quantity_g: number }>;
  preferred: Array<{ ingredient_id: string; supplier_id: string | null; supplier_name: string | null; price_cents: number }>;
  suppliers: Array<{ id: string; name: string }>;
}

export interface NeedLine extends PurchaseLine { purchaseUnit: string; supplierId: string | null; supplierName: string | null; priceCents: number | null }

/** Necessidade do período: soma por dia (cardápio × comensais previstos × adesão), menos estoque e pedidos em aberto. */
export function computeNeeds(d: NeedsData, marginPct: number): NeedLine[] {
  const inputs = sheetInputs(d.graph);
  const adh = new Map(d.adhesion.map((a) => [a.sheet_root_id, a.rate]));
  const factor = new Map((d.adjustments ?? []).map((x) => [x.sheet_root_id, x.portion_factor]));
  const perDay = d.days.map((day) =>
    day.items
      .filter((i) => i.sheet_id && inputs.has(i.sheet_id))
      .map((i) => {
        const diners = d.diners.find((x) => x.day === day.day && x.service === i.service)?.planned ?? 0;
        return { sheetId: i.sheet_id!, portions: plannedPortions(diners, adh.get(i.sheet_root_id) ?? 1) * (factor.get(i.sheet_root_id) ?? 1), label: i.name };
      })
      .filter((p) => p.portions > 0),
  );
  const ing = new Map(d.graph.ingredients.map((i) => [i.id, i]));
  const pref = new Map(d.preferred.map((p) => [p.ingredient_id, p]));
  const lines = purchaseRequirements(
    perDay,
    inputs,
    new Map(d.stock.map((s) => [s.ingredient_id, s.quantity_g])),
    new Map(d.open_orders.map((s) => [s.ingredient_id, s.quantity_g])),
    new Map(d.graph.ingredients.map((i) => [i.id, i.grams_per_unit])),
    marginPct,
  );
  return lines.map((l) => ({
    ...l,
    purchaseUnit: ing.get(l.key)?.purchase_unit ?? 'kg',
    supplierId: pref.get(l.key)?.supplier_id ?? null,
    supplierName: pref.get(l.key)?.supplier_name ?? null,
    priceCents: pref.get(l.key)?.price_cents ?? null,
  }));
}

/** Pedidos em rascunho: um por fornecedor de preferência (último preço registrado), só com o que falta comprar. */
export function draftOrders(lines: NeedLine[]): Array<{ supplier_id: string | null; supplierName: string; items: Array<{ ingredient_id: string; quantity_units: number }> }> {
  const groups = new Map<string, { supplier_id: string | null; supplierName: string; items: Array<{ ingredient_id: string; quantity_units: number }> }>();
  for (const l of lines) {
    if (!l.toBuyUnits || l.toBuyUnits <= 0) continue;
    const k = l.supplierId ?? 'none';
    const g = groups.get(k) ?? { supplier_id: l.supplierId, supplierName: l.supplierName ?? 'Sem fornecedor', items: [] };
    g.items.push({ ingredient_id: l.key, quantity_units: l.toBuyUnits });
    groups.set(k, g);
  }
  return [...groups.values()];
}

/**
 * Temperatura máxima no recebimento pelo armazenamento do insumo (a validar com a RT):
 * refrigerado até 7 °C, congelado até −12 °C; ambiente sem limite.
 */
export function receivingLimit(storage: 'ambient' | 'chilled' | 'frozen'): number | null {
  return storage === 'chilled' ? 7 : storage === 'frozen' ? -12 : null;
}
export function temperatureRejects(storage: 'ambient' | 'chilled' | 'frozen', temp: number | null): boolean {
  const max = receivingLimit(storage);
  return max !== null && temp !== null && temp > max;
}

export type PoStatus = 'draft' | 'sent' | 'received' | 'cancelled';
export const PO_STATUS_LABEL: Record<PoStatus, string> = { draft: 'Rascunho', sent: 'Enviado', received: 'Recebido', cancelled: 'Cancelado' };
export interface PoListItem { id: string; supplier_name: string | null; status: PoStatus; expected_on: string | null; created_at: string; item_count: number; total_cents: number }
export interface PoDetail {
  order: { id: string; unit_id: string; supplier_id: string | null; status: PoStatus; expected_on: string | null; notes: string | null; created_at: string; sent_at: string | null; received_at: string | null };
  unit: { id: string; name: string };
  supplier: { id: string; name: string; phone: string | null; email: string | null } | null;
  suppliers: Array<{ id: string; name: string }>;
  catalog: Array<{ id: string; name: string; purchase_unit: string }>;
  items: Array<{ ingredient_id: string; name: string; storage: 'ambient' | 'chilled' | 'frozen'; category: string; purchase_unit: string; quantity_units: number; unit_price_cents: number | null; received_units: number }>;
  receipts: Array<{ id: string; invoice_number: string | null; received_at: string; received_by_name: string | null; items: Array<{ ingredient_id: string; quantity_units: number; accepted: boolean; lot_code: string | null; expires_on: string | null; temperature: number | null; reject_reason: string | null; non_conformity_id: string | null }> }>;
}
