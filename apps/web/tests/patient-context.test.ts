import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
const { pickRecord } = await import('@/lib/patient-area/context');

const a = { patient_id: '00000000-0000-4000-8000-00000000000a' };
const b = { patient_id: '00000000-0000-4000-8000-00000000000b' };

describe('RN-211 — escolha do nutricionista', () => {
  it('um vínculo: usa o único, sem perguntar', () => {
    expect(pickRecord([a], undefined)).toEqual({ record: a, needsChoice: false });
  });
  it('vários e nada escolhido: pergunta', () => {
    expect(pickRecord([a, b], undefined)).toEqual({ record: a, needsChoice: true });
  });
  it('escolha válida vence; escolha de outra conta é ignorada e pergunta de novo', () => {
    expect(pickRecord([a, b], b.patient_id)).toEqual({ record: b, needsChoice: false });
    expect(pickRecord([a, b], '00000000-0000-4000-8000-0000000000ff')).toEqual({ record: a, needsChoice: true });
  });
  it('sem vínculos: nada', () => {
    expect(pickRecord([], a.patient_id)).toEqual({ record: null, needsChoice: false });
  });
});
