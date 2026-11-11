import type { PlanCode } from '@/lib/modules/plans';

export type MemberRole = 'owner' | 'nutritionist' | 'assistant';

export interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  type: 'solo' | 'clinic' | 'company';
  brand_color: string | null;
  plan: PlanCode;
  role: MemberRole;
}

/**
 * Para onde mandar quem acabou de entrar.
 * - Sem consultório e com o cadastro aberto: onboarding.
 * - Já tem consultório e está no onboarding: painel.
 * - Falha ao consultar (null) ou cadastro fechado: fica onde está.
 */
export function landingRedirect(
  page: 'app' | 'onboarding',
  organizations: UserOrganization[] | null,
  signupOpen: boolean,
): '/onboarding' | '/app' | null {
  if (organizations === null) return null;
  if (page === 'app' && organizations.length === 0 && signupOpen) return '/onboarding';
  if (page === 'onboarding' && organizations.length > 0) return '/app';
  return null;
}
