import type { SessionUser } from '@/lib/auth/session';
import type { PlanCode } from './plans';

/**
 * Plano do usuário. Enquanto não existem as tabelas de assinatura no Directus (RN-200),
 * todo usuário está no plano gratuito, como define a Fase 1B.
 * Depois: ler subscriptions.plan_code da organização ativa com o token do usuário.
 */
export async function getUserPlan(user: SessionUser): Promise<PlanCode> {
  void user; // será usado para achar a organização ativa
  return 'free';
}
