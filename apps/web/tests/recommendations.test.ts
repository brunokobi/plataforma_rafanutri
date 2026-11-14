import { describe, expect, it } from 'vitest';
import { groupForPatient, unreadCount } from '@/lib/recommendations/group';
import type { PatientRecommendation } from '@/lib/recommendations/types';

const rec = (id: string, category: string, published_at: string, extra: Partial<PatientRecommendation> = {}): PatientRecommendation => ({
  id, category, title: `T ${id}`, body: 'Texto', pinned: false, published_at, read_at: null, ...extra,
});

describe('RN-208 — recomendações na área do paciente', () => {
  const list = [
    rec('a', 'Sono', '2026-11-10T10:00:00Z'),
    rec('b', 'Hidratação', '2026-11-11T10:00:00Z', { read_at: '2026-11-12T10:00:00Z' }),
    rec('c', 'Hidratação', '2026-11-13T10:00:00Z'),
    rec('d', 'Treino', '2026-11-09T10:00:00Z', { pinned: true }),
    rec('e', 'Sono', '2026-11-14T10:00:00Z', { pinned: true }),
  ];

  it('fixadas primeiro (mais recentes antes), depois categorias em ordem alfabética', () => {
    const g = groupForPatient(list);
    expect(g.pinned.map((r) => r.id)).toEqual(['e', 'd']);
    expect(g.groups.map(([c, rs]) => [c, rs.map((r) => r.id)])).toEqual([['Hidratação', ['c', 'b']], ['Sono', ['a']]]);
  });

  it('conta as não lidas', () => {
    expect(unreadCount(list)).toBe(4);
    expect(unreadCount([])).toBe(0);
  });
});
