import { describe, expect, it } from 'vitest';
import { boardColumns, formatCents, isOverdue, planLate, type NcItem } from '@/lib/uan/nonconformities';

const now = new Date('2026-11-15T12:00:00Z');
const nc = (id: string, patch: Partial<NcItem> = {}): NcItem => ({
  id, unit_id: 'u', source: 'checklist', run_id: null, answer_position: null, equipment_id: null, title: id, description: null,
  severity: 'medium', status: 'open', due_at: '2026-11-20T12:00:00Z', opened_at: '2026-11-14T12:00:00Z', closed_at: null,
  closing_note: null, has_photo: false, plan_count: 0, plans_done: 0, ...patch,
});

describe('não conformidades (RN-153/154)', () => {
  it('atrasada: crítica aberta há 25 h sem plano', () => {
    const critical = nc('a', { severity: 'critical', opened_at: '2026-11-14T11:00:00Z', due_at: '2026-11-15T11:00:00Z' });
    expect(isOverdue(critical, now)).toBe(true);
    expect(isOverdue({ ...critical, status: 'in_progress' }, now)).toBe(true);
    expect(isOverdue({ ...critical, status: 'resolved' }, now)).toBe(false);
    expect(isOverdue(nc('b'), now)).toBe(false);
  });

  it('quadro: colunas por situação; atrasadas primeiro, depois gravidade e prazo', () => {
    const items = [
      nc('media', { severity: 'medium', due_at: '2026-11-18T00:00:00Z' }),
      nc('alta', { severity: 'high', due_at: '2026-11-19T00:00:00Z' }),
      nc('atrasada-baixa', { severity: 'low', due_at: '2026-11-15T10:00:00Z' }),
      nc('tratando', { status: 'in_progress' }),
      nc('fechada', { status: 'closed', closed_at: '2026-11-15T09:00:00Z' }),
    ];
    const cols = boardColumns(items, {}, now);
    expect(cols.open.map((n) => n.id)).toEqual(['atrasada-baixa', 'alta', 'media']);
    expect(cols.in_progress.map((n) => n.id)).toEqual(['tratando']);
    expect(cols.closed.map((n) => n.id)).toEqual(['fechada']);
    expect(boardColumns(items, { severity: 'high' }, now).open.map((n) => n.id)).toEqual(['alta']);
    expect(boardColumns(items, { overdueOnly: true }, now).open.map((n) => n.id)).toEqual(['atrasada-baixa']);
    expect(boardColumns(items, { source: 'manual' }, now).open).toEqual([]);
  });

  it('ação vencida e valor em reais', () => {
    expect(planLate({ due_date: '2026-11-14', status: 'planned' }, '2026-11-15')).toBe(true);
    expect(planLate({ due_date: '2026-11-15', status: 'planned' }, '2026-11-15')).toBe(false);
    expect(planLate({ due_date: '2026-11-01', status: 'done' }, '2026-11-15')).toBe(false);
    expect(formatCents(25000)?.replace(/\s/g, ' ')).toBe('R$ 250,00');
    expect(formatCents(null)).toBeNull();
  });
});
