export interface MonthIndicators {
  month: string;
  revenue_cents: number;
  avg_ticket_cents: number;
  paid_count: number;
  visits: number;
  no_shows: number;
  no_show_rate: number;
  new_patients: number;
}
export interface Indicators {
  current: MonthIndicators;
  previous: MonthIndicators;
  receivable_cents: number;
  overdue_cents: number;
  overdue_returns: number;
  nutritionist: string | null;
  nutritionists: Array<{ id: string; name: string }>;
}

/** Variação contra o mês anterior: "+12%", "−5%", "novo" (antes era zero) ou null (sem base nem valor). */
export function delta(cur: number, prev: number): string | null {
  if (prev === 0) return cur === 0 ? null : 'novo';
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
}
