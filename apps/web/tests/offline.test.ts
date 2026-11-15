import { describe, expect, it } from 'vitest';
import { compact, outcomeOf, superseded, type OfflineOp } from '@/lib/offline/ops';

const R = 'run-1';
const a = (id: number, position: number, value: 'conform' | 'non_conform' | 'na', at: string): OfflineOp => ({ id, kind: 'answer', runId: R, position, input: { value }, at });
const p = (id: number, position: number, at: string): OfflineOp => ({ id, kind: 'photo', runId: R, position, image: `data:image/jpeg;base64,${id}`, at });

describe('fila offline do checklist (RN-149)', () => {
  it('fica a última resposta de cada item; fotos depois das respostas; conclusão no fim', () => {
    const ops: OfflineOp[] = [
      { id: 1, kind: 'complete', runId: R, at: '2026-11-15T10:00:05Z' },
      a(2, 5, 'conform', '2026-11-15T10:00:01Z'),
      p(3, 5, '2026-11-15T10:00:03Z'),
      a(4, 5, 'non_conform', '2026-11-15T10:00:02Z'),
      a(5, 1, 'conform', '2026-11-15T10:00:00Z'),
      p(6, 5, '2026-11-15T10:00:04Z'),
    ];
    const out = compact(ops);
    expect(out.map((o) => o.id)).toEqual([5, 4, 6, 1]);
    expect(superseded(ops).sort()).toEqual([2, 3]);
  });

  it('como tratar a resposta do servidor', () => {
    const ans = a(1, 1, 'conform', 'x');
    const done: OfflineOp = { kind: 'complete', runId: R, at: 'x' };
    expect(outcomeOf(ans, { ok: true })).toBe('sent');
    expect(outcomeOf(ans, { ok: false, message: 'Sem conexão', network: true })).toBe('offline');
    expect(outcomeOf(done, { ok: false, message: 'Checklist já concluído ou cancelado' })).toBe('sent');
    expect(outcomeOf(ans, { ok: false, message: 'Checklist concluído ou cancelado não pode ser alterado' })).toBe('rejected');
  });
});
