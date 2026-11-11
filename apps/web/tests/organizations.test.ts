import { describe, expect, it } from 'vitest';
import { landingRedirect, type UserOrganization } from '@/lib/auth/landing';
import { getUserPlan } from '@/lib/modules/user-plan';

const org: UserOrganization = {
  id: 'o1', name: 'Ana Nutri', slug: 'ana-nutri', type: 'solo', brand_color: '#2E7D32', plan: 'free', role: 'owner',
};

describe('landingRedirect', () => {
  it('sem consultório e cadastro aberto: vai para o onboarding', () => {
    expect(landingRedirect('app', [], true)).toBe('/onboarding');
  });
  it('sem consultório e cadastro fechado: fica no painel', () => {
    expect(landingRedirect('app', [], false)).toBeNull();
  });
  it('com consultório: fica no painel', () => {
    expect(landingRedirect('app', [org], true)).toBeNull();
  });
  it('com consultório no onboarding: volta para o painel', () => {
    expect(landingRedirect('onboarding', [org], true)).toBe('/app');
  });
  it('sem consultório no onboarding: fica no onboarding', () => {
    expect(landingRedirect('onboarding', [], true)).toBeNull();
  });
  it('falha ao consultar o Directus (null) nunca redireciona', () => {
    expect(landingRedirect('app', null, true)).toBeNull();
    expect(landingRedirect('onboarding', null, true)).toBeNull();
  });
});

describe('getUserPlan', () => {
  it('usa o plano do primeiro consultório', () => {
    expect(getUserPlan([{ ...org, plan: 'professional' }, org])).toBe('professional');
  });
  it('sem consultório ou com falha, vale o gratuito', () => {
    expect(getUserPlan([])).toBe('free');
    expect(getUserPlan(null)).toBe('free');
  });
});
