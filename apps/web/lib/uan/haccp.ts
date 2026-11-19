// U7 — APPCC: fluxograma, análise de perigos e PCC (RN-160, RN-161). A decisão final é calculada no banco
// (haccp_decision); aqui a mesma árvore guia o preenchimento na tela.

export type HazardKind = 'biological' | 'chemical' | 'physical' | 'allergen';
export const HAZARD_LABEL: Record<HazardKind, string> = { biological: 'Biológico', chemical: 'Químico', physical: 'Físico', allergen: 'Alergênico' };
export const HAZARD_KINDS = Object.keys(HAZARD_LABEL) as HazardKind[];
export type MonitoringKind = 'temperature' | 'checklist' | 'visual' | 'other';
export const MONITORING_LABEL: Record<MonitoringKind, string> = { temperature: 'Temperatura', checklist: 'Checklist', visual: 'Inspeção visual', other: 'Outro' };
export type Decision = 'ccp' | 'not_ccp' | 'modify';
export const DECISION_LABEL: Record<Decision, string> = { ccp: 'É PCC', not_ccp: 'Não é PCC', modify: 'Modificar a etapa' };
export const LEVEL_LABEL = ['', 'Baixa', 'Média', 'Alta'] as const;

export interface Hazard {
  id?: string;
  kind: HazardKind;
  description: string;
  cause: string | null;
  severity: number;
  probability: number;
  risk?: number;
  control_measure: string | null;
  q1: boolean | null; q1b: boolean | null; q2: boolean | null; q3: boolean | null; q4: boolean | null;
  decision?: Decision | null;
  ccp_number?: number | null;
  critical_limit: string | null;
  limit_min: number | null;
  limit_max: number | null;
  limit_unit: string | null;
  monitoring_what: string | null;
  monitoring_how: string | null;
  monitoring_frequency: string | null;
  monitoring_kind: MonitoringKind | null;
  checklist_template_id: string | null;
  equipment_id: string | null;
  corrective_action: string | null;
  verification: string | null;
  records: string | null;
}
export interface Step { id?: string; position?: number; name: string; description: string | null; target_temp: number | null; hazards: Hazard[] }
export interface PlanSummary { id: string; root_id: string; version: number; title: string; status: 'draft' | 'approved' | 'archived'; approved_at: string | null; updated_at: string | null; sheet_name: string | null; steps: number; ccps: number }
export interface UnitHaccp { unit: { id: string; name: string }; can_edit: boolean; plans: PlanSummary[]; sheets: Array<{ id: string; name: string }> }
export interface PlanDetail {
  plan: { id: string; unit_id: string; root_id: string; version: number; title: string; scope: string | null; sheet_root_id: string | null; status: 'draft' | 'approved' | 'archived'; approved_at: string | null };
  unit: { id: string; name: string };
  sheet: { id: string; name: string } | null;
  steps: Step[];
  versions: Array<{ id: string; version: number; status: string; approved_at: string | null; approved_by_name: string | null }>;
  can_edit: boolean;
  can_approve: boolean;
  can_new_version: boolean;
  options: { templates: Array<{ id: string; name: string }>; equipment: Array<{ id: string; name: string }> };
}

/** Árvore decisória do Codex (igual a haccp_decision no banco). */
export function haccpDecision(h: Pick<Hazard, 'q1' | 'q1b' | 'q2' | 'q3' | 'q4'>): Decision | null {
  if (h.q1 === null) return null;
  if (!h.q1) return h.q1b === null ? null : h.q1b ? 'modify' : 'not_ccp';
  if (h.q2 === null) return null;
  if (h.q2) return 'ccp';
  if (h.q3 === null) return null;
  if (!h.q3) return 'not_ccp';
  if (h.q4 === null) return null;
  return h.q4 ? 'not_ccp' : 'ccp';
}

export type QuestionKey = 'q1' | 'q1b' | 'q2' | 'q3' | 'q4';
export const QUESTIONS: Record<QuestionKey, string> = {
  q1: 'Existem medidas de controle para este perigo nesta etapa ou nas seguintes?',
  q1b: 'O controle nesta etapa é necessário para a segurança do alimento?',
  q2: 'Esta etapa foi feita para eliminar o perigo ou reduzi-lo a um nível aceitável?',
  q3: 'A contaminação pode ocorrer ou aumentar até um nível inaceitável?',
  q4: 'Uma etapa seguinte vai eliminar o perigo ou reduzi-lo a um nível aceitável?',
};
/** Perguntas a mostrar, na ordem, conforme as respostas já dadas. */
export function visibleQuestions(h: Pick<Hazard, 'q1' | 'q1b' | 'q2' | 'q3' | 'q4'>): QuestionKey[] {
  const out: QuestionKey[] = ['q1'];
  if (h.q1 === false) out.push('q1b');
  if (h.q1 === true) {
    out.push('q2');
    if (h.q2 === false) {
      out.push('q3');
      if (h.q3 === true) out.push('q4');
    }
  }
  return out;
}
/** Zera as respostas que deixaram de valer depois de mudar uma pergunta anterior. */
export function answer(h: Hazard, key: QuestionKey, value: boolean): Hazard {
  const next = { ...h, [key]: value };
  const keep = new Set(visibleQuestions(next));
  for (const k of ['q1b', 'q2', 'q3', 'q4'] as QuestionKey[]) if (!keep.has(k)) next[k] = null;
  return next;
}

/** Risco = severidade × probabilidade; significativo a partir de 4 (matriz a validar com a RT). */
export const riskOf = (h: Pick<Hazard, 'severity' | 'probability'>) => h.severity * h.probability;
export const significant = (h: Pick<Hazard, 'severity' | 'probability'>) => riskOf(h) >= 4;

/** O que falta para aprovar (mesmas regras de haccp_plan_approve). */
export function approvalIssues(steps: Step[]): string[] {
  const issues: string[] = [];
  if (!steps.length) issues.push('O plano não tem etapas.');
  steps.forEach((s, i) => s.hazards.forEach((h) => {
    const d = haccpDecision(h);
    const where = `Etapa ${i + 1} (${s.name}), perigo "${h.description || '—'}"`;
    if (significant(h) && d === null) issues.push(`${where}: responda a árvore decisória.`);
    if (d === 'ccp' && (!h.critical_limit?.trim() || !h.monitoring_what?.trim() || !h.corrective_action?.trim())) issues.push(`${where}: PCC sem limite crítico, monitoramento ou ação corretiva.`);
  }));
  return issues;
}

export function emptyHazard(kind: HazardKind = 'biological'): Hazard {
  return {
    kind, description: '', cause: null, severity: 2, probability: 2, control_measure: null, q1: null, q1b: null, q2: null, q3: null, q4: null,
    critical_limit: null, limit_min: null, limit_max: null, limit_unit: null, monitoring_what: null, monitoring_how: null, monitoring_frequency: null,
    monitoring_kind: null, checklist_template_id: null, equipment_id: null, corrective_action: null, verification: null, records: null,
  };
}

/** Sugestão de PCC de cocção a partir da temperatura-alvo da etapa (o RT revisa). */
export function cookingHazard(targetTemp: number): Hazard {
  return {
    ...emptyHazard('biological'),
    description: 'Sobrevivência de microrganismos patogênicos por cocção insuficiente',
    cause: 'Tempo ou temperatura de cocção abaixo do necessário',
    severity: 3, probability: 2, control_measure: 'Cocção até a temperatura no centro geométrico', q1: true, q2: true,
    critical_limit: `Centro do alimento com no mínimo ${targetTemp} °C`, limit_min: targetTemp, limit_unit: '°C',
    monitoring_what: 'Temperatura no centro geométrico', monitoring_how: 'Termômetro tipo espeto higienizado', monitoring_frequency: 'Cada lote',
    monitoring_kind: 'temperature', corrective_action: `Prolongar a cocção até atingir ${targetTemp} °C e registrar`, verification: 'RT confere os registros semanalmente', records: 'Registro de temperatura na plataforma',
  };
}
