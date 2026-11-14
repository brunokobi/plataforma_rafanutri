import type { PatientRecommendation } from './types';

/**
 * Área do paciente: fixadas primeiro (em bloco próprio), depois por categoria em ordem alfabética;
 * dentro de cada grupo, as mais recentes primeiro.
 */
export function groupForPatient(list: PatientRecommendation[]): { pinned: PatientRecommendation[]; groups: Array<[string, PatientRecommendation[]]> } {
  const recent = (a: PatientRecommendation, b: PatientRecommendation) => (b.published_at ?? '').localeCompare(a.published_at ?? '');
  const pinned = list.filter((r) => r.pinned).sort(recent);
  const map = new Map<string, PatientRecommendation[]>();
  for (const r of list.filter((x) => !x.pinned)) map.set(r.category, [...(map.get(r.category) ?? []), r]);
  const groups = [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([c, rs]) => [c, rs.sort(recent)] as [string, PatientRecommendation[]]);
  return { pinned, groups };
}

export const unreadCount = (list: Array<{ read_at: string | null }>) => list.filter((r) => !r.read_at).length;
