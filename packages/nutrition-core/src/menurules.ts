// RN-221 — Motor de regras do cardápio e adequação às metas do perfil de público.
// Metas por refeição: {nutriente: {min, max, target}}. Percentuais de energia (carb_pct, protein_pct,
// fat_pct, saturated_fat_pct) são calculados a partir dos gramas (4, 4, 9 e 9 kcal/g). "target" sozinho
// aceita ±10% (critério a validar com a RT).

export interface TargetRange { min?: number; max?: number; target?: number }
export type Targets = Record<string, TargetRange>;
export type AdequacyStatus = 'ok' | 'low' | 'high' | 'unknown';
export interface AdequacyRow { key: string; value: number | null; range: TargetRange; status: AdequacyStatus }

const PCT: Record<string, { from: string; kcalPerG: number }> = {
  carb_pct: { from: 'carbohydrate_g', kcalPerG: 4 },
  protein_pct: { from: 'protein_g', kcalPerG: 4 },
  fat_pct: { from: 'lipid_g', kcalPerG: 9 },
  saturated_fat_pct: { from: 'saturated_fat_g', kcalPerG: 9 },
};

/** Valor de uma meta a partir dos nutrientes somados da refeição (null se faltar dado). */
export function targetValue(key: string, meal: Record<string, number | null | undefined>): number | null {
  const p = PCT[key];
  if (p) {
    const kcal = meal.energy_kcal;
    const g = meal[p.from];
    if (kcal === null || kcal === undefined || g === null || g === undefined || kcal <= 0) return null;
    return Math.round(((g * p.kcalPerG) / kcal) * 1000) / 10;
  }
  const v = meal[key];
  return v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
}

export function adequacyStatus(value: number | null, r: TargetRange): AdequacyStatus {
  if (value === null) return 'unknown';
  if (r.min !== undefined && value < r.min) return 'low';
  if (r.max !== undefined && value > r.max) return 'high';
  if (r.min === undefined && r.max === undefined && r.target !== undefined) {
    if (value < r.target * 0.9) return 'low';
    if (value > r.target * 1.1) return 'high';
  }
  return 'ok';
}

/** Adequação de uma refeição (soma dos pratos) às metas do perfil. */
export function mealAdequacy(meal: Record<string, number | null | undefined>, targets: Targets): AdequacyRow[] {
  return Object.entries(targets).map(([key, range]) => {
    const value = targetValue(key, meal);
    return { key, value, range, status: adequacyStatus(value, range) };
  });
}

/** Soma os nutrientes por porção dos pratos de uma refeição. */
export function sumMeal(dishes: Array<Record<string, number | null | undefined>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of dishes) for (const [k, v] of Object.entries(d)) if (v !== null && v !== undefined && Number.isFinite(v)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export type MenuRule =
  | { id: string; kind: 'vetoed_ingredient'; ingredient_id: string; note?: string | null }
  | { id: string; kind: 'vetoed_category'; sheet_category: string; note?: string | null }
  | { id: string; kind: 'required_daily'; slot: string; service?: string | null; note?: string | null }
  | { id: string; kind: 'max_per_week'; max_count: number; ingredient_id?: string | null; sheet_category?: string | null; note?: string | null }
  | { id: string; kind: 'cost_ceiling'; cost_cents: number; service?: string | null; note?: string | null };

export interface PlannedDish { day: number; service: string; slot: string; rootId: string; name: string; category: string | null; ingredientIds: string[]; costCents: number | null }
export interface RuleWarning { ruleId: string; kind: MenuRule['kind']; day: number | null; service: string | null; message: string }

/**
 * Avalia as regras do contrato num ciclo: veto de insumo ou categoria, prato obrigatório por dia (em cada
 * serviço do ciclo, ou só no serviço da regra), frequência máxima por semana (janelas de 7 dias a partir do
 * dia 1) e teto de custo por refeição.
 */
export function evaluateRules(dishes: PlannedDish[], rules: MenuRule[], cycle: { lengthDays: number; services: string[] }, names: { ingredient?: (id: string) => string; category?: (c: string) => string; slot?: (s: string) => string } = {}): RuleWarning[] {
  const ing = names.ingredient ?? ((id: string) => id);
  const cat = names.category ?? ((c: string) => c);
  const slot = names.slot ?? ((s: string) => s);
  const out: RuleWarning[] = [];
  for (const r of rules) {
    switch (r.kind) {
      case 'vetoed_ingredient':
        for (const d of dishes) if (d.ingredientIds.includes(r.ingredient_id)) out.push({ ruleId: r.id, kind: r.kind, day: d.day, service: d.service, message: `${d.name} leva ${ing(r.ingredient_id)}, vetado no contrato.` });
        break;
      case 'vetoed_category':
        for (const d of dishes) if (d.category === r.sheet_category) out.push({ ruleId: r.id, kind: r.kind, day: d.day, service: d.service, message: `${d.name} é ${cat(r.sheet_category)}, categoria vetada no contrato.` });
        break;
      case 'required_daily': {
        const services = r.service ? [r.service].filter((s) => cycle.services.includes(s)) : cycle.services;
        for (let day = 1; day <= cycle.lengthDays; day++) {
          for (const sv of services) {
            const served = dishes.some((d) => d.day === day && d.service === sv);
            if (served && !dishes.some((d) => d.day === day && d.service === sv && d.slot === r.slot)) out.push({ ruleId: r.id, kind: r.kind, day, service: sv, message: `Falta ${slot(r.slot)}, obrigatório todo dia.` });
          }
        }
        break;
      }
      case 'max_per_week':
        for (let start = 1; start <= cycle.lengthDays; start += 7) {
          const inWeek = dishes.filter((d) => d.day >= start && d.day < start + 7 && (r.ingredient_id ? d.ingredientIds.includes(r.ingredient_id) : d.category === r.sheet_category));
          const days = new Set(inWeek.map((d) => `${d.day}:${d.service}`)).size;
          if (days > r.max_count) {
            const what = r.ingredient_id ? ing(r.ingredient_id) : cat(r.sheet_category ?? '');
            out.push({ ruleId: r.id, kind: r.kind, day: start, service: null, message: `${what} aparece ${days} vezes na semana ${Math.ceil(start / 7)} (máximo ${r.max_count}).` });
          }
        }
        break;
      case 'cost_ceiling': {
        const meals = new Map<string, number>();
        for (const d of dishes) if (!r.service || d.service === r.service) meals.set(`${d.day}:${d.service}`, (meals.get(`${d.day}:${d.service}`) ?? 0) + (d.costCents ?? 0));
        for (const [k, v] of meals) if (v > r.cost_cents) {
          const [day, service] = k.split(':');
          out.push({ ruleId: r.id, kind: r.kind, day: Number(day), service: service!, message: `Refeição custa R$ ${(v / 100).toFixed(2).replace('.', ',')}, acima do teto do contrato (R$ ${(r.cost_cents / 100).toFixed(2).replace('.', ',')}).` });
        }
        break;
      }
    }
  }
  return out.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
}
