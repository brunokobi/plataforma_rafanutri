import { describe, expect, it } from 'vitest';
import { isAdZone, showsAds } from '@/lib/ads/config';
import type { UserOrganization } from '@/lib/auth/organizations';

const org = (plan: string, modules: string[] = ['clinical']) => ({ id: 'o', name: 'X', slug: 'x', type: 'solo', brand_color: null, plan, role: 'owner', modules }) as unknown as UserOrganization;

describe('anúncios do plano Gratuito', () => {
  it('só nas telas sem dados de paciente', () => {
    for (const p of ['/app', '/app/', '/app/alimentos', '/app/receitas/12', '/app/questionarios', '/app/modelos-de-plano/abc', '/app/orientacoes', '/app/configuracoes/plano']) expect(isAdZone(p), p).toBe(true);
    for (const p of ['/app/pacientes', '/app/pacientes/1', '/app/agenda', '/app/clinico', '/app/crm', '/app/financeiro', '/app/configuracoes/plano/fatura/1', '/app/uan', '/p', '/p/plano', '/app/receitas-x', '/']) expect(isAdZone(p), p).toBe(false);
  });
  it('só para quem está no Gratuito, sem UAN', () => {
    expect(showsAds([org('free')])).toBe(true);
    expect(showsAds([org('essential')])).toBe(false);
    expect(showsAds([org('free'), org('clinic')])).toBe(false);
    expect(showsAds([org('free', ['clinical', 'uan'])])).toBe(false);
    expect(showsAds(null)).toBe(false);
    expect(showsAds([])).toBe(false);
  });
});
