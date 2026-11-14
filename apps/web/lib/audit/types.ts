export type AuditAction = 'insert' | 'update' | 'delete' | 'read' | 'export';

export interface AuditEntry {
  id: string;
  action: AuditAction;
  entity: string;
  entity_id: string;
  changed_fields: string[];
  occurred_at: string;
  patient: { id: string; name: string | null } | null;
  actor: { id: string; name: string | null } | null;
}

export interface AuditMember {
  id: string;
  name: string;
  role: string;
}

export interface AuditPage {
  data: AuditEntry[];
  next: string | null;
  members?: AuditMember[];
}

export interface AuditFilters {
  from?: string;
  to?: string;
  actor?: string;
  entity?: string;
  action?: string;
  patient?: string;
  before?: string;
}

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  patients: 'Paciente',
  clinical_notes: 'Prontuário',
  anamneses: 'Anamnese',
  anthropometric_assessments: 'Avaliação',
  meal_plans: 'Plano alimentar',
  clinical_documents: 'Documento clínico',
  appointments: 'Consulta',
  financial_transactions: 'Lançamento financeiro',
  receipts: 'Recibo',
  organization_members: 'Equipe',
  patient_app_invites: 'Convite do paciente',
  patient_recommendations: 'Recomendação',
  patient_packages: 'Pacote do paciente',
};

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  insert: 'Criou',
  update: 'Alterou',
  delete: 'Excluiu',
  read: 'Abriu',
  export: 'Exportou',
};

const FILTER_KEYS = ['from', 'to', 'actor', 'entity', 'action', 'patient', 'before'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtros válidos a partir dos parâmetros da URL; o que não vale é descartado. */
export function parseAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (k: string) => {
    const v = params[k];
    return typeof v === 'string' && v !== '' ? v : undefined;
  };
  const f: AuditFilters = {};
  const from = one('from');
  const to = one('to');
  if (from && DATE.test(from)) f.from = from;
  if (to && DATE.test(to)) f.to = to;
  const actor = one('actor');
  if (actor && UUID.test(actor)) f.actor = actor;
  const patient = one('patient');
  if (patient && UUID.test(patient)) f.patient = patient;
  const entity = one('entity');
  if (entity && entity in AUDIT_ENTITY_LABEL) f.entity = entity;
  const action = one('action');
  if (action && action in AUDIT_ACTION_LABEL) f.action = action;
  const before = one('before');
  if (before && /^\d{1,18}$/.test(before)) f.before = before;
  return f;
}

export function auditQuery(f: AuditFilters): string {
  const q = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = f[k];
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
