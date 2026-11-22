import type { UserOrganization } from '@/lib/auth/landing';

/**
 * Consultório clínico do usuário: o primeiro em que é owner ou nutricionista (a mesma escolha do servidor,
 * clinicalOrg na extensão). Null para quem só é assistente ou não tem consultório.
 */
export function pickClinicalOrg(organizations: UserOrganization[] | null | undefined): UserOrganization | null {
  return pickClinicalOrg(organizations);
}
