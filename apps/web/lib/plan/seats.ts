import { MODULES, type ModuleCode } from '@/lib/modules/catalog';
import { getPlan, type PlanCode } from '@/lib/modules/plans';

/** A partir de quantas vagas restantes o aviso aparece (RN-202: 18 de 20). */
export const WARN_REMAINING = 2;

export type SeatLevel = 'unlimited' | 'ok' | 'warning' | 'full';

/** Situação das vagas de pacientes ativos. */
export function seatsInfo(active: number, limit: number | null): { level: SeatLevel; remaining: number | null } {
  if (limit === null) return { level: 'unlimited', remaining: null };
  const remaining = Math.max(0, limit - active);
  return { level: remaining === 0 ? 'full' : remaining <= WARN_REMAINING ? 'warning' : 'ok', remaining };
}

export function seatsMessage(active: number, limit: number | null): string | null {
  const { level, remaining } = seatsInfo(active, limit);
  if (level === 'warning') return remaining === 1 ? 'Resta 1 vaga de paciente ativo no plano gratuito.' : `Restam ${remaining} vagas de pacientes ativos no plano gratuito.`;
  if (level === 'full') return `Você atingiu o limite de ${limit} pacientes ativos do plano gratuito.`;
  return null;
}

export interface Entitlements {
  plan: PlanCode;
  maxActivePatients: number | null;
  maxMembers: number | null;
  /** Módulos incluídos (ou com cota) no plano. */
  modules: ModuleCode[];
}

/** Limites e módulos do plano (RN-200). Reaproveitado pela cobrança na Fase 2. */
export function getEntitlements(code: PlanCode): Entitlements {
  const p = getPlan(code);
  return {
    plan: p.code,
    maxActivePatients: p.maxActivePatients,
    maxMembers: p.maxMembers,
    modules: MODULES.map((m) => m.code).filter((c) => ['included', 'quota'].includes(p.grants[c].grant)),
  };
}
