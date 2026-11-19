// U7 — Perfis de público, metas e regras do contrato (RN-221).
import { evaluateRules, mealAdequacy, sumMeal, type AdequacyRow, type MenuRule, type PlannedDish, type RuleWarning } from '@rafanutri/nutrition-core';
import { SHEET_CATEGORY_LABEL, type SheetCategory } from '@/lib/uan/techsheets';
import { SERVICE_LABEL, SLOT_LABEL, type MenuItem, type MenuPlanning, type MenuService, type MenuSlot } from '@/lib/uan/menus';

export type Segment = 'pat' | 'pnae' | 'hospital' | 'hotel' | 'transported' | 'other';
export const SEGMENT_LABEL: Record<Segment, string> = { pat: 'Corporativo (PAT)', pnae: 'Escolar (PNAE)', hospital: 'Hospitalar', hotel: 'Hotelaria e eventos', transported: 'Refeição transportada', other: 'Outro' };
export const AUTONOMY_LABEL = { standardized: 'Padronizado (rede)', decentralized: 'Descentralizado (unidade ajusta)', free: 'Livre (unidade monta)' } as const;

/** Metas conhecidas, na ordem da tela (outras chaves aparecem com o próprio nome). */
export const TARGET_LABEL: Record<string, string> = {
  energy_kcal: 'Energia (kcal)', carb_pct: 'Carboidratos (% da energia)', protein_pct: 'Proteínas (% da energia)', fat_pct: 'Gorduras (% da energia)',
  saturated_fat_pct: 'Gorduras saturadas (% da energia)', protein_g: 'Proteínas (g)', fiber_g: 'Fibras (g)', sodium_mg: 'Sódio (mg)', calcium_mg: 'Cálcio (mg)', iron_mg: 'Ferro (mg)', vitamin_c_mg: 'Vitamina C (mg)',
};
export const TARGET_KEYS = Object.keys(TARGET_LABEL);

export interface DinerProfile {
  id: string; organization_id: string | null; code: string | null; name: string; segment: Segment; stage: string | null; diet: string | null;
  services: MenuService[]; targets: Record<string, { min?: number; max?: number; target?: number }>; reference: string | null; validated: boolean;
  copied_from: string | null; active: boolean; platform: boolean;
}
export interface RuleRow { id: string; kind: MenuRule['kind']; profile_id: string | null; profile_name: string | null; ingredient_id: string | null; ingredient_name: string | null; sheet_category: string | null; slot: string | null; service: string | null; max_count: number | null; cost_cents: number | null; note: string | null }
export interface MenuPlanningOrg { organization: { id: string; name: string }; can_manage: boolean; profiles: DinerProfile[]; rules: RuleRow[]; ingredients: Array<{ id: string; name: string }> }

export const RULE_KIND_LABEL: Record<MenuRule['kind'], string> = {
  vetoed_ingredient: 'Insumo vetado', vetoed_category: 'Categoria vetada', required_daily: 'Obrigatório todo dia', max_per_week: 'Frequência máxima por semana', cost_ceiling: 'Teto de custo por refeição',
};

const cat = (c: string | null) => (c ? SHEET_CATEGORY_LABEL[c as SheetCategory] ?? c : '—');
/** Frase da regra ("Fígado vetado", "Salada todo dia no almoço"…). */
export function ruleText(r: Pick<RuleRow, 'kind' | 'ingredient_name' | 'sheet_category' | 'slot' | 'service' | 'max_count' | 'cost_cents'>): string {
  const sv = r.service ? ` no ${SERVICE_LABEL[r.service as MenuService].toLowerCase()}` : '';
  switch (r.kind) {
    case 'vetoed_ingredient': return `${r.ingredient_name ?? 'Insumo'} vetado`;
    case 'vetoed_category': return `${cat(r.sheet_category)} vetado`;
    case 'required_daily': return `${SLOT_LABEL[r.slot as MenuSlot] ?? r.slot} todo dia${sv}`;
    case 'max_per_week': return `${r.ingredient_name ?? cat(r.sheet_category)}: no máximo ${r.max_count} vez(es) por semana`;
    case 'cost_ceiling': return `Teto de R$ ${((r.cost_cents ?? 0) / 100).toFixed(2).replace('.', ',')} por refeição${sv}`;
  }
}

/** Adequação por dia de um serviço (soma dos pratos) às metas do perfil. */
export function dayAdequacy(items: MenuItem[], service: MenuService, day: number, targets: Record<string, { min?: number; max?: number; target?: number }>): AdequacyRow[] {
  const dishes = items.filter((i) => i.day_index === day && i.service === service);
  if (!dishes.length) return [];
  return mealAdequacy(sumMeal(dishes.map((d) => d.nutrients ?? {})), targets);
}

/** Avisos das regras do contrato para o ciclo inteiro. */
export function cycleWarnings(items: MenuItem[], planning: MenuPlanning, cycle: { length_days: number; services: string[] }): RuleWarning[] {
  const dishes: PlannedDish[] = items.map((i) => ({
    day: i.day_index, service: i.service, slot: i.slot, rootId: i.sheet_root_id, name: i.name, category: i.category,
    ingredientIds: i.ingredient_ids ?? (i.sheet_id ? planning.ingredients[i.sheet_id] ?? [] : []), costCents: i.cost_cents,
  }));
  const rules = planning.rules.map((r) => ({ ...r }) as unknown as MenuRule);
  const ingName = new Map(planning.rules.filter((r) => r.ingredient_id).map((r) => [r.ingredient_id!, r.ingredient_name ?? 'insumo']));
  return evaluateRules(dishes, rules, { lengthDays: cycle.length_days, services: cycle.services }, {
    ingredient: (id) => ingName.get(id) ?? 'insumo', category: (c) => cat(c).toLowerCase(), slot: (s) => (SLOT_LABEL[s as MenuSlot] ?? s).toLowerCase(),
  });
}

export const fmtTarget = (r: { min?: number; max?: number; target?: number }) =>
  r.min !== undefined && r.max !== undefined ? `${r.min} a ${r.max}` : r.min !== undefined ? `mín. ${r.min}` : r.max !== undefined ? `máx. ${r.max}` : r.target !== undefined ? `~${r.target}` : '—';
