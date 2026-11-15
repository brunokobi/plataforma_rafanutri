// U5 (RN-229) — Painel de custos: planejado (cardápio × porções previstas × fichas × preço por kg) ×
// realizado (retiradas do estoque para produção, pelo custo do lote).
import { abcCurve, deviationPct, perCapitaCents, plannedPortions, requisition, topDeviations, type AbcLine, type DeviationLine } from '@rafanutri/nutrition-core';
import { sheetInputs } from '@/lib/uan/production';
import type { NeedsData } from '@/lib/uan/purchasing';

export interface CostsData extends Omit<NeedsData, 'diners'> {
  diners: Array<{ day: string; service: string; planned: number | null; actual: number | null }>;
  consumption: Array<{ day: string; ingredient_id: string; name: string; supplier_id: string | null; supplier_name: string | null; grams: number; cost_cents: number; estimated: boolean; missing_cost: boolean }>;
  criterion: string;
}

export interface DayCost { day: string; plannedCents: number; plannedMeals: number; actualCents: number; actualMeals: number; plannedPerCapita: number | null; actualPerCapita: number | null; deviation: number | null }

export interface CostPanel {
  days: DayCost[];
  plannedCents: number;
  actualCents: number;
  plannedMeals: number;
  actualMeals: number;
  plannedPerCapita: number | null;
  actualPerCapita: number | null;
  deviation: number | null;
  top: DeviationLine[];
  abc: AbcLine[];
  abcSuppliers: AbcLine[];
  estimatedLines: number;
  missingCostLines: number;
}

/** Monta o painel do período. Refeições planejadas e servidas = soma dos comensais previstos e realizados. */
export function costPanel(d: CostsData): CostPanel {
  const inputs = sheetInputs(d.graph);
  const adh = new Map(d.adhesion.map((a) => [a.sheet_root_id, a.rate]));
  const priceKg = new Map(d.graph.ingredients.map((i) => [i.id, i.price_per_kg_cents]));
  const plannedByIng = new Map<string, { name: string; cents: number }>();
  const days: DayCost[] = d.days.map((day) => {
    const preps = day.items
      .filter((i) => i.sheet_id && inputs.has(i.sheet_id))
      .map((i) => ({ sheetId: i.sheet_id!, label: i.name, portions: plannedPortions(d.diners.find((x) => x.day === day.day && x.service === i.service)?.planned ?? 0, adh.get(i.sheet_root_id) ?? 1) }))
      .filter((p) => p.portions > 0);
    let plannedCents = 0;
    for (const l of requisition(preps, inputs)) {
      const c = ((priceKg.get(l.key) ?? 0) * l.grossG) / 1000;
      plannedCents += c;
      const cur = plannedByIng.get(l.key) ?? { name: l.name, cents: 0 };
      cur.cents += c;
      plannedByIng.set(l.key, cur);
    }
    const dn = d.diners.filter((x) => x.day === day.day);
    const plannedMeals = dn.reduce((s, x) => s + (x.planned ?? 0), 0);
    const actualMeals = dn.reduce((s, x) => s + (x.actual ?? 0), 0);
    const actualCents = d.consumption.filter((c) => c.day === day.day).reduce((s, c) => s + c.cost_cents, 0);
    const pp = perCapitaCents(Math.round(plannedCents), plannedMeals);
    const ap = perCapitaCents(actualCents, actualMeals);
    return { day: day.day, plannedCents: Math.round(plannedCents), plannedMeals, actualCents, actualMeals, plannedPerCapita: pp, actualPerCapita: ap, deviation: pp !== null && ap !== null ? deviationPct(pp, ap) : null };
  });
  const sum = (k: keyof DayCost) => days.reduce((s, x) => s + ((x[k] as number) ?? 0), 0);
  const plannedCents = sum('plannedCents');
  const actualCents = sum('actualCents');
  const plannedMeals = sum('plannedMeals');
  const actualMeals = sum('actualMeals');
  const plannedPerCapita = perCapitaCents(plannedCents, plannedMeals);
  const actualPerCapita = perCapitaCents(actualCents, actualMeals);
  const actualByIng = new Map<string, { name: string; cents: number }>();
  const bySupplier = new Map<string, { name: string; cents: number }>();
  for (const c of d.consumption) {
    const a = actualByIng.get(c.ingredient_id) ?? { name: c.name, cents: 0 };
    a.cents += c.cost_cents;
    actualByIng.set(c.ingredient_id, a);
    const k = c.supplier_id ?? 'none';
    const s = bySupplier.get(k) ?? { name: c.supplier_name ?? 'Sem fornecedor', cents: 0 };
    s.cents += c.cost_cents;
    bySupplier.set(k, s);
  }
  return {
    days,
    plannedCents,
    actualCents,
    plannedMeals,
    actualMeals,
    plannedPerCapita,
    actualPerCapita,
    deviation: plannedPerCapita !== null && actualPerCapita !== null ? deviationPct(plannedPerCapita, actualPerCapita) : null,
    top: topDeviations(plannedByIng, actualByIng, 5),
    abc: abcCurve([...actualByIng.entries()].map(([key, v]) => ({ key, name: v.name, valueCents: v.cents }))),
    abcSuppliers: abcCurve([...bySupplier.entries()].map(([key, v]) => ({ key, name: v.name, valueCents: v.cents }))),
    estimatedLines: d.consumption.filter((c) => c.estimated).length,
    missingCostLines: d.consumption.filter((c) => c.missing_cost).length,
  };
}

/** Hoje no fuso de São Paulo (AAAA-MM-DD). */
export function localToday(now = Date.now()): string {
  return new Date(now - 3 * 3600e3).toISOString().slice(0, 10);
}
