// RN-153 / RN-154 — Não conformidades e plano de ação 5W2H: tipos e regras puras.
import type { NcSeverity, NcStatus } from '@/lib/uan/checklists';

export type NcSource = 'checklist' | 'temperature' | 'receiving' | 'manual';
export const NC_SOURCE_LABEL: Record<NcSource, string> = { checklist: 'Checklist', temperature: 'Temperatura', receiving: 'Recebimento', manual: 'Registro manual' };
export const NC_COLUMNS: NcStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

export interface NcItem {
  id: string;
  unit_id: string;
  source: NcSource;
  run_id: string | null;
  answer_position: number | null;
  equipment_id: string | null;
  title: string;
  description: string | null;
  severity: NcSeverity;
  status: NcStatus;
  due_at: string;
  opened_at: string;
  closed_at: string | null;
  closing_note: string | null;
  has_photo: boolean;
  plan_count: number;
  plans_done: number;
}

export interface NcBoard {
  unit: { id: string; name: string };
  can_open: boolean;
  can_plan: boolean;
  can_close: boolean;
  items: NcItem[];
}

export interface ActionPlan {
  id: string;
  what: string;
  why: string | null;
  where_: string | null;
  due_date: string;
  who_user: string | null;
  who_text: string | null;
  who_name: string | null;
  how: string | null;
  how_much_cents: number | null;
  status: 'planned' | 'done';
  done_note: string | null;
  done_at: string | null;
  created_at: string;
  can_complete: boolean;
}

export interface NcDetail {
  nc: Omit<NcItem, 'plan_count' | 'plans_done'> & {
    has_closing_photo: boolean;
    opened_by_name: string | null;
    closed_by_name: string | null;
    equipment: { id: string; name: string } | null;
  };
  unit: { id: string; name: string };
  can_plan: boolean;
  can_close: boolean;
  plans: ActionPlan[];
  team: Array<{ id: string; name: string }>;
}

const SEVERITY_ORDER: Record<NcSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Atrasada: prazo vencido e ainda não resolvida nem fechada. */
export function isOverdue(nc: Pick<NcItem, 'due_at' | 'status'>, now = new Date()): boolean {
  return (nc.status === 'open' || nc.status === 'in_progress') && new Date(nc.due_at).getTime() < now.getTime();
}

/** Plano de ação vencido (data passou e não foi feito). `today` em AAAA-MM-DD. */
export function planLate(p: Pick<ActionPlan, 'due_date' | 'status'>, today: string): boolean {
  return p.status === 'planned' && p.due_date < today;
}

export interface BoardFilter {
  severity?: NcSeverity | null;
  source?: NcSource | null;
  overdueOnly?: boolean;
}

/** Colunas do quadro: filtradas e ordenadas (atrasadas primeiro, depois gravidade e prazo). */
export function boardColumns(items: NcItem[], filter: BoardFilter = {}, now = new Date()): Record<NcStatus, NcItem[]> {
  const out: Record<NcStatus, NcItem[]> = { open: [], in_progress: [], resolved: [], closed: [] };
  for (const nc of items) {
    if (filter.severity && nc.severity !== filter.severity) continue;
    if (filter.source && nc.source !== filter.source) continue;
    if (filter.overdueOnly && !isOverdue(nc, now)) continue;
    out[nc.status].push(nc);
  }
  for (const k of NC_COLUMNS) {
    out[k].sort(
      (a, b) =>
        Number(isOverdue(b, now)) - Number(isOverdue(a, now)) ||
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        a.due_at.localeCompare(b.due_at),
    );
  }
  return out;
}

/** "R$ 250,00" a partir de centavos. */
export function formatCents(cents: number | null): string | null {
  return cents === null ? null : (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const ncPhotoUrl = (id: string, which: 'opening' | 'closing') => `/api/uan/nao-conformidades/${id}/foto/${which}`;
