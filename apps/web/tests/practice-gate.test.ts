import { describe, expect, it } from 'vitest';
import type { UserOrganization } from '@/lib/auth/landing';
import { hasPracticeModule } from '@/lib/modules/practice';
import { getPlan } from '@/lib/modules/plans';
import { todaySP } from '@/lib/format/date';

const org = (plan: UserOrganization['plan'], modules?: string[]) => ({ plan, modules }) as UserOrganization;

describe('módulo Gestão fora do Gratuito', () => {
  it('pagos e contrato liberam; Gratuito não', () => {
    expect(hasPracticeModule([org('free')])).toBe(false);
    expect(hasPracticeModule([org('essential')])).toBe(true);
    expect(hasPracticeModule([org('clinic')])).toBe(true);
    expect(hasPracticeModule([org('free', ['clinical', 'practice'])])).toBe(true);
    expect(hasPracticeModule(null)).toBe(false);
    expect(getPlan('free').grants.practice.grant).toBe('none');
  });
  it('IA com limite de 200 por dia nos planos Profissional e Clínica', () => {
    expect(getPlan('professional').grants.ai.note).toBe('Até 200 por dia');
    expect(getPlan('clinic').grants.ai.note).toBe('Até 200 por dia');
  });
  it('hoje no horário de Brasília (23h de Brasília ainda é o mesmo dia)', () => {
    expect(todaySP(new Date('2026-11-23T02:00:00Z'))).toBe('2026-11-22');
    expect(todaySP(new Date('2026-11-23T03:30:00Z'))).toBe('2026-11-23');
  });
});
