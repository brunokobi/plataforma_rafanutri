// RN-165 — Painel de conformidade: tipos e faixas do índice (fórmula no banco, uan_compliance).

export type ComponentKey = 'schedule' | 'score' | 'temperature' | 'deadlines';

export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  schedule: 'Agenda cumprida',
  score: 'Pontuação dos checklists',
  temperature: 'Temperaturas no limite',
  deadlines: 'Não conformidades no prazo',
};
export const COMPONENT_ORDER: ComponentKey[] = ['schedule', 'score', 'temperature', 'deadlines'];

export interface UnitCompliance {
  id: string;
  name: string;
  kind: string;
  days: number;
  index: number | null;
  components: Partial<Record<ComponentKey, number>>;
  weights: Partial<Record<ComponentKey, number>>;
  counts: {
    scheduled: number;
    scheduled_done: number;
    runs_completed: number;
    readings: number;
    readings_in_range: number;
    nc_open: number;
    nc_overdue: number;
    nc_critical_open: number;
    equipment_overdue: number;
    checklists_overdue_today: number;
  };
  /** Pendências documentais (fora do índice). */
  legal?: { pops_missing: number; docs_overdue: number; licenses_expired: number; training_overdue: number };
}

export interface ComplianceData {
  days: number;
  organizations: Array<{ id: string; name: string; is_owner: boolean; units: UnitCompliance[] }>;
}

/** Faixa do índice: bom ≥ 85, atenção 70–84,9, crítico < 70; sem dados = null. */
export function indexLevel(index: number | null): 'good' | 'attention' | 'critical' | null {
  if (index === null) return null;
  if (index >= 85) return 'good';
  if (index >= 70) return 'attention';
  return 'critical';
}
export const LEVEL_LABEL = { good: 'Bom', attention: 'Atenção', critical: 'Crítico' } as const;

/** Unidades da pior para a melhor (sem dados no fim), para o comparativo. */
export function rankUnits(units: UnitCompliance[]): UnitCompliance[] {
  return [...units].sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity) || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Pendências que pedem ação agora (para os atalhos do painel). */
export function pendingCount(u: UnitCompliance): number {
  const l = u.legal;
  return u.counts.nc_overdue + u.counts.equipment_overdue + u.counts.checklists_overdue_today
    + (l ? l.pops_missing + l.docs_overdue + l.licenses_expired + l.training_overdue : 0);
}

export const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
