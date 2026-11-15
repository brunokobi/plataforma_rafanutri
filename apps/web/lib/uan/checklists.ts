// U1a — Checklists de Boas Práticas: tipos, rótulos e regras puras (as mesmas do banco, para a tela).

export type ChecklistCategory = 'bpf_audit' | 'opening' | 'hygiene' | 'receiving' | 'cleaning' | 'temperature' | 'pests' | 'water' | 'other';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'on_demand';
export type AnswerValue = 'conform' | 'non_conform' | 'na';
export type RunStatus = 'in_progress' | 'completed' | 'cancelled';
export type NcSeverity = 'low' | 'medium' | 'high' | 'critical';
export type NcStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export const FREQUENCY_LABEL: Record<Frequency, string> = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', on_demand: 'Quando precisar' };
export const ANSWER_LABEL: Record<AnswerValue, string> = { conform: 'Conforme', non_conform: 'Não conforme', na: 'Não se aplica' };
export const SEVERITY_LABEL: Record<NcSeverity, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
export const NC_STATUS_LABEL: Record<NcStatus, string> = { open: 'Aberta', in_progress: 'Em tratamento', resolved: 'Resolvida', closed: 'Fechada' };

export interface ChecklistTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  category: ChecklistCategory;
  frequency_hint: Frequency;
  platform: boolean;
  item_count: number;
  critical_count: number;
}

export interface RunSummary {
  id: string;
  unit_id: string;
  template_id: string | null;
  template_name: string;
  status: RunStatus;
  started_at: string;
  completed_at: string | null;
  score: number | null;
  conform_count: number | null;
  non_conform_count: number | null;
  na_count: number | null;
  geo_distance_m: number | null;
  started_by_name?: string | null;
  completed_by_name?: string | null;
  mine?: boolean;
}

export interface NonConformitySummary {
  id: string;
  title: string;
  severity: NcSeverity;
  status: NcStatus;
  source: 'checklist' | 'temperature' | 'receiving' | 'manual';
  run_id: string | null;
  due_at: string;
  opened_at: string;
}

export interface UnitChecklists {
  can_run: boolean;
  templates: ChecklistTemplateSummary[];
  runs: RunSummary[];
  non_conformities: NonConformitySummary[];
}

export interface ChecklistAnswer {
  position: number;
  section: string | null;
  prompt: string;
  help: string | null;
  kind: 'compliance' | 'number';
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  critical: boolean;
  photo_on_fail: boolean;
  value: AnswerValue | null;
  number_value: number | null;
  comment: string | null;
  has_photo: boolean;
  answered_at: string | null;
}

export interface RunDetail {
  run: RunSummary;
  unit: { id: string; name: string; geo_radius_m: number; has_geo: boolean };
  can_answer: boolean;
  can_cancel: boolean;
  answers: ChecklistAnswer[];
  non_conformities: Array<{ id: string; answer_position: number; severity: NcSeverity; status: NcStatus; due_at: string }>;
}

/** Valor de um item numérico: dentro dos limites = conforme (mesma regra do banco). */
export function numberValue(value: number | null, min: number | null, max: number | null): AnswerValue | null {
  if (value === null || !Number.isFinite(value)) return null;
  if ((min !== null && value < min) || (max !== null && value > max)) return 'non_conform';
  return 'conform';
}

/** Limites do item numérico em texto ("até 5 °C", "de 60 a 90 °C", "a partir de 60 °C"). */
export function rangeLabel(a: Pick<ChecklistAnswer, 'min_value' | 'max_value' | 'unit'>): string {
  const u = a.unit ? ` ${a.unit}` : '';
  const f = (n: number) => n.toLocaleString('pt-BR');
  if (a.min_value !== null && a.max_value !== null) return `de ${f(a.min_value)} a ${f(a.max_value)}${u}`;
  if (a.max_value !== null) return `até ${f(a.max_value)}${u}`;
  if (a.min_value !== null) return `a partir de ${f(a.min_value)}${u}`;
  return '';
}

/** Item não conforme que exige foto e comentário para concluir. */
export function needsEvidence(a: Pick<ChecklistAnswer, 'value' | 'critical' | 'photo_on_fail'>): boolean {
  return a.value === 'non_conform' && (a.critical || a.photo_on_fail);
}

/** Item com evidência faltando (bloqueia a conclusão). */
export function missingEvidence(a: ChecklistAnswer): { photo: boolean; comment: boolean } | null {
  if (!needsEvidence(a)) return null;
  const photo = !a.has_photo;
  const comment = !a.comment?.trim();
  return photo || comment ? { photo, comment } : null;
}

export interface RunProgress {
  answered: number;
  total: number;
  conform: number;
  nonConform: number;
  na: number;
  /** conformes ÷ aplicáveis × 100, com 2 casas; null sem itens aplicáveis. */
  score: number | null;
  /** Posições que impedem concluir: sem resposta ou sem evidência. */
  blocking: number[];
}

export function runProgress(answers: ChecklistAnswer[]): RunProgress {
  let conform = 0;
  let nonConform = 0;
  let na = 0;
  const blocking: number[] = [];
  for (const a of answers) {
    if (a.value === 'conform') conform++;
    else if (a.value === 'non_conform') nonConform++;
    else if (a.value === 'na') na++;
    if (a.value === null || missingEvidence(a)) blocking.push(a.position);
  }
  const applicable = conform + nonConform;
  return {
    answered: conform + nonConform + na,
    total: answers.length,
    conform,
    nonConform,
    na,
    score: applicable > 0 ? Math.round((10000 * conform) / applicable) / 100 : null,
    blocking,
  };
}

/** Próximo item a responder depois de `from` (dá a volta); null se não há pendências. */
export function nextPending(answers: ChecklistAnswer[], from: number): number | null {
  const pending = runProgress(answers).blocking;
  if (!pending.length) return null;
  return pending.find((p) => p > from) ?? pending[0] ?? null;
}

/** Não conformidade com prazo vencido (e ainda aberta). */
export function ncOverdue(nc: Pick<NonConformitySummary, 'due_at' | 'status'>, now = new Date()): boolean {
  return (nc.status === 'open' || nc.status === 'in_progress') && new Date(nc.due_at).getTime() < now.getTime();
}

/** Aviso de localização: fora do raio da unidade (com folga pela precisão do GPS). */
export function outsideRadius(distance: number | null, radius: number): boolean {
  return distance !== null && distance > radius;
}

/** Foto de evidência pelo proxy do app (`v` força recarregar depois de trocar a foto). */
export const photoUrl = (runId: string, position: number, v = 0) => `/api/uan/checklists/${runId}/foto/${position}?v=${v}`;
