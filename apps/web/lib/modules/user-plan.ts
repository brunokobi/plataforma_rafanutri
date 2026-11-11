import type { UserOrganization } from '@/lib/auth/landing';
import type { PlanCode } from './plans';

/**
 * Plano do usuário: o do consultório ativo (o primeiro, enquanto não há seletor de consultório).
 * Sem consultório, ou se a consulta falhou, vale o plano gratuito (Fase 1B).
 */
export function getUserPlan(organizations: UserOrganization[] | null): PlanCode {
  return organizations?.[0]?.plan ?? 'free';
}
