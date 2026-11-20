// U5 — Painel da rede e relatório mensal (RN-229).
export interface UnitMonth {
  cost_cents: number;
  cost_estimated_missing: boolean;
  meals_planned: number;
  meals_served: number;
  cost_per_meal_cents: number | null;
  cost_target_cents: number | null;
  waste: { produced_g: number; leftover_g: number; plate_g: number; prep_g: number; leftover_pct: number | null; plate_pct: number | null; plate_g_per_meal: number | null };
  satisfaction: { avg: number | null; responses: number };
  compliance_index: number | null;
  nc_open: number;
  nc_overdue: number;
  top_items: Array<{ name: string; cost_cents: number }>;
}
export interface NetworkData {
  organization: { id: string; name: string };
  month: string; from: string; to: string;
  totals: { cost_cents: number; meals_served: number; meals_planned: number; cost_per_meal_cents: number | null };
  units: Array<UnitMonth & { id: string; name: string; kind: string }>;
}
export interface MonthlyReport {
  organization: string | null;
  unit: { id: string; name: string };
  technical_lead: string | null;
  month: string; from: string; to: string;
  stats: UnitMonth;
  previous: { month: string; cost_per_meal_cents: number | null; meals_served: number; compliance_index: number | null; plate_pct: number | null };
  trainings: number;
  non_conformities: { opened: number; closed: number };
  comments: Array<{ comment: string; rating: number | null; dish: string | null }>;
}

/** "novembro de 2026". */
export const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** Mês anterior e seguinte (AAAA-MM). */
export function shiftMonth(m: string, delta: number): string {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
/** Variação percentual (null sem base). */
export const variation = (now: number | null, before: number | null) => (now === null || before === null || before === 0 ? null : Math.round(((now - before) / before) * 1000) / 10);
/** Custo por refeição acima do teto do cardápio? */
export const overTarget = (u: Pick<UnitMonth, 'cost_per_meal_cents' | 'cost_target_cents'>) => u.cost_per_meal_cents !== null && u.cost_target_cents !== null && u.cost_per_meal_cents > u.cost_target_cents;
