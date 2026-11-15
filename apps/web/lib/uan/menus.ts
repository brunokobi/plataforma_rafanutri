// U2c — Cardápio cíclico: tipos, rótulos e regras puras.
import type { SheetCategory } from '@/lib/uan/techsheets';

export type MenuService = 'breakfast' | 'morning_snack' | 'lunch' | 'afternoon_snack' | 'dinner' | 'supper';
export type MenuSlot = 'main' | 'side' | 'garnish' | 'salad' | 'soup' | 'dessert' | 'bread' | 'beverage' | 'sauce' | 'other';
export type MenuStatus = 'draft' | 'submitted' | 'approved';

export const SERVICE_LABEL: Record<MenuService, string> = {
  breakfast: 'Desjejum', morning_snack: 'Colação', lunch: 'Almoço', afternoon_snack: 'Lanche', dinner: 'Jantar', supper: 'Ceia',
};
export const SLOT_LABEL: Record<MenuSlot, string> = {
  main: 'Prato principal', side: 'Acompanhamento', garnish: 'Guarnição', salad: 'Salada', soup: 'Sopa', dessert: 'Sobremesa',
  bread: 'Pães', beverage: 'Bebida', sauce: 'Molho', other: 'Outro',
};
export const MENU_STATUS_LABEL: Record<MenuStatus, string> = { draft: 'Rascunho', submitted: 'Enviado para aprovação', approved: 'Aprovado' };
export const SERVICES: MenuService[] = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'];
export const SLOTS: MenuSlot[] = ['main', 'side', 'garnish', 'salad', 'soup', 'dessert', 'bread', 'beverage', 'sauce', 'other'];

export interface Cycle {
  id: string;
  unit_id: string;
  name: string;
  starts_on: string;
  length_days: number;
  services: MenuService[];
  slots: MenuSlot[];
  cost_target_cents: number | null;
  status: MenuStatus;
  justification: string | null;
  submitted_at: string | null;
  approved_at: string | null;
}
export interface MenuItem { day_index: number; service: MenuService; slot: MenuSlot; sheet_root_id: string; sheet_id: string | null; name: string; category: SheetCategory | null; cost_cents: number | null }
export interface MenuOption { root_id: string; name: string; category: SheetCategory; cost_cents: number | null }
export interface MenuDetail {
  cycle: Cycle;
  unit: { id: string; name: string };
  items: MenuItem[];
  options: MenuOption[];
  cost: { totals: Record<string, number>; over: Array<{ day: number; service: MenuService; cost_cents: number; pct: number }> } | null;
  history: Array<{ action: 'submitted' | 'approved' | 'returned' | 'reopened'; note: string | null; created_at: string; user_name: string | null; cost_check: { over?: unknown[] } | null }>;
  can_edit: boolean;
  can_submit: boolean;
  can_approve: boolean;
}
export interface UnitMenus {
  unit: { id: string; name: string; organization_id: string };
  can_edit: boolean;
  today: string;
  today_menus: Array<{ cycle_id: string; cycle_name: string; day_index: number; items: Array<{ service: MenuService; slot: MenuSlot; sheet_id: string | null; name: string }> }>;
  cycles: Cycle[];
}

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** Data da primeira ocorrência do dia do ciclo (AAAA-MM-DD) e rótulo "seg 02/03". */
export function cycleDate(startsOn: string, dayIndex: number): { iso: string; label: string } {
  const d = new Date(`${startsOn}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayIndex - 1);
  const iso = d.toISOString().slice(0, 10);
  return { iso, label: `${WD[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}` };
}

/** Dia do ciclo numa data (mesma regra do banco); null antes do início. */
export function dayIndexOn(startsOn: string, length: number, date: string): number | null {
  const diff = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${startsOn}T12:00:00Z`)) / 86_400_000);
  return diff < 0 ? null : (diff % length) + 1;
}

/**
 * Repetições: a mesma preparação no mesmo serviço em menos de `window` dias (o ciclo dá a volta).
 * Devolve chave "dia:serviço:posição" → dias desde a ocorrência anterior.
 */
export function repetitions(items: Array<Pick<MenuItem, 'day_index' | 'service' | 'slot' | 'sheet_root_id'>>, length: number, window = 7): Map<string, number> {
  const out = new Map<string, number>();
  const bySheet = new Map<string, Array<(typeof items)[number]>>();
  for (const it of items) {
    const k = `${it.service}:${it.sheet_root_id}`;
    bySheet.set(k, [...(bySheet.get(k) ?? []), it]);
  }
  for (const list of bySheet.values()) {
    if (list.length < 2) continue;
    const days = list.map((i) => i.day_index).sort((a, b) => a - b);
    for (const it of list) {
      let best = Infinity;
      for (const d of days) {
        if (d === it.day_index) continue;
        const gap = (it.day_index - d + length) % length; // dias desde a ocorrência anterior (circular)
        if (gap > 0 && gap < best) best = gap;
      }
      if (best < window) out.set(`${it.day_index}:${it.service}:${it.slot}`, best);
    }
  }
  return out;
}

/** Opções da posição: as fichas da mesma categoria primeiro; as demais depois. */
export function optionsForSlot(options: MenuOption[], slot: MenuSlot): { match: MenuOption[]; others: MenuOption[] } {
  return { match: options.filter((o) => o.category === slot), others: options.filter((o) => o.category !== slot) };
}
