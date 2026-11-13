import type { Anamnesis } from '@/lib/anamneses/repository';
import type { Appointment } from '@/lib/appointments/schema';
import { MODE_LABEL, STATUS_LABEL, TYPE_LABEL } from '@/lib/appointments/schema';
import type { Assessment } from '@/lib/assessments/schema';
import type { MealPlanSummary } from '@/lib/meal-plans/schema';
import type { ClinicalNote } from './schema';

export type TimelineKind = 'evolucao' | 'consulta' | 'anamnese' | 'avaliacao' | 'plano';
export const KIND_LABEL: Record<TimelineKind, string> = {
  evolucao: 'Evoluções',
  consulta: 'Consultas',
  anamnese: 'Anamneses',
  avaliacao: 'Avaliações',
  plano: 'Planos',
};

export interface NoteChain {
  /** Versão vigente (a mais recente da cadeia de retificações). */
  current: ClinicalNote;
  /** Versões anteriores, da mais nova para a mais antiga. */
  previous: ClinicalNote[];
}

export type TimelineEvent =
  | { kind: 'evolucao'; id: string; at: string; chain: NoteChain }
  | { kind: Exclude<TimelineKind, 'evolucao'>; id: string; at: string; title: string; detail: string | null; href: string | null };

/** Agrupa as evoluções em cadeias (original → retificações) e devolve a versão vigente de cada uma. */
export function noteChains(notes: ClinicalNote[]): NoteChain[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const replacedBy = new Map<string, ClinicalNote>();
  for (const n of notes) if (n.supersedes_id) replacedBy.set(n.supersedes_id, n);
  const chains: NoteChain[] = [];
  for (const n of notes) {
    if (replacedBy.has(n.id)) continue; // não é a versão vigente
    const previous: ClinicalNote[] = [];
    let cur = n.supersedes_id ? byId.get(n.supersedes_id) : undefined;
    const seen = new Set([n.id]);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      previous.push(cur);
      cur = cur.supersedes_id ? byId.get(cur.supersedes_id) : undefined;
    }
    chains.push({ current: n, previous });
  }
  return chains;
}

const fmtKg = (v: number | null) => (v == null ? null : `${String(v).replace('.', ',')} kg`);

/** Junta tudo o que aconteceu com o paciente, do mais recente para o mais antigo. */
export function buildTimeline(patientId: string, src: {
  notes?: ClinicalNote[] | null;
  appointments?: Appointment[] | null;
  anamneses?: Anamnesis[] | null;
  assessments?: Assessment[] | null;
  plans?: MealPlanSummary[] | null;
}): TimelineEvent[] {
  const base = `/app/pacientes/${patientId}`;
  const events: TimelineEvent[] = [];
  for (const chain of noteChains(src.notes ?? [])) {
    // A cadeia fica na data da primeira versão (quando o atendimento foi registrado).
    const first = chain.previous.at(-1) ?? chain.current;
    events.push({ kind: 'evolucao', id: chain.current.id, at: first.date_created, chain });
  }
  for (const a of src.appointments ?? []) {
    events.push({ kind: 'consulta', id: a.id, at: a.starts_at, title: `${TYPE_LABEL[a.type]} · ${MODE_LABEL[a.mode]}`, detail: STATUS_LABEL[a.status], href: '/app/agenda' });
  }
  for (const a of src.anamneses ?? []) {
    if (a.status === 'cancelled') continue;
    const answered = a.answered_at != null;
    events.push({
      kind: 'anamnese', id: a.id, at: a.answered_at ?? a.date_created,
      title: `${a.title ?? 'Anamnese'} ${answered ? 'respondida' : 'enviada'}`,
      detail: a.status === 'reviewed' ? 'Revisada' : answered ? 'Aguardando revisão' : 'Aguardando o paciente',
      href: `${base}/anamneses`,
    });
  }
  for (const a of src.assessments ?? []) {
    const bmi = a.results?.bmi;
    events.push({
      kind: 'avaliacao', id: a.id, at: `${a.assessed_at}T12:00:00-03:00`, title: 'Avaliação antropométrica',
      detail: [fmtKg(a.weight_kg), bmi != null ? `IMC ${String(bmi).replace('.', ',')}` : null].filter(Boolean).join(' · ') || null,
      href: `${base}/avaliacoes`,
    });
  }
  for (const p of src.plans ?? []) {
    if (!p.published_at) continue;
    const kcal = p.totals?.energy_kcal;
    events.push({ kind: 'plano', id: p.id, at: p.published_at, title: `Plano publicado: ${p.title}`, detail: kcal ? `${Math.round(kcal)} kcal` : null, href: `${base}/planos/${p.id}` });
  }
  return events.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}
