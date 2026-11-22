import { PRACTICE_PLANS } from '@rafanutri/catalogs';
import type { UserOrganization } from '@/lib/auth/landing';

/** Planos com o módulo Gestão do consultório (financeiro, CRM, pacotes, agendamento online e lembretes). */
export { PRACTICE_PLANS };

/** O módulo Gestão vale para algum consultório do usuário (plano pago ou habilitado por contrato). Igual ao filtro da extensão. */
export function hasPracticeModule(organizations: UserOrganization[] | null | undefined): boolean {
  return Boolean(organizations?.some((o) => (PRACTICE_PLANS as readonly string[]).includes(o.plan) || o.modules?.includes('practice')));
}
