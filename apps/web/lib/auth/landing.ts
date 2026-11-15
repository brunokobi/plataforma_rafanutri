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
  /** Consultório com logo enviado (RN-204). */
  has_logo?: boolean;
  /** CPF ou CNPJ do recibo (RN-055). */
  receipt_tax_id?: string | null;
  /** RN-022: expediente da agenda (HH:MM e dias ISO 1 = segunda … 7 = domingo). */
  work_start?: string;
  work_end?: string;
  work_weekdays?: number[];
  /** Módulos habilitados na organização (ex.: ['clinical', 'uan']). */
  modules?: string[];
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
