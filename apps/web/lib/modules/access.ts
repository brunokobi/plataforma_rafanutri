import { MODULES, type ModuleDefinition } from './catalog';
import { PLANS, getPlan, type ModuleGrant, type PlanCode, type PlanDefinition } from './plans';

export type ModuleStatus =
  | 'available' // incluso e publicado
  | 'included_soon' // incluso, ainda em construção
  | 'upgrade' // disponível em outro plano
  | 'contract'; // só sob contrato

export interface ModuleAccessView {
  module: ModuleDefinition;
  grant: ModuleGrant;
  status: ModuleStatus;
  note?: string;
  /** Planos que incluem o módulo (para os não inclusos). */
  unlockedBy: PlanDefinition[];
}

/**
 * `enabled`: módulos habilitados na organização (`organizations.modules`). Um módulo habilitado por contrato
 * (ex.: UAN) fica incluso mesmo que o plano não o traga.
 */
export function resolveModuleAccess(planCode: PlanCode, module: ModuleDefinition, enabled: readonly string[] = []): ModuleAccessView {
  const plan = getPlan(planCode);
  const base = plan.grants[module.code];
  const { grant, note } = enabled.includes(module.code) && (base.grant === 'none' || base.grant === 'contract') ? { grant: 'included' as const, note: 'Habilitado por contrato' } : base;
  const unlockedBy = PLANS.filter((p) => p.code !== planCode && ['included', 'quota'].includes(p.grants[module.code].grant));

  let status: ModuleStatus;
  if (grant === 'contract') status = 'contract';
  else if (grant === 'none') status = 'upgrade';
  else status = module.availability === 'available' ? 'available' : 'included_soon';

  return { module, grant, status, note, unlockedBy };
}

/** Separa os módulos em "seus" (inclusos) e "outros planos" para a tela principal. */
export function buildModuleSections(planCode: PlanCode, modules: readonly ModuleDefinition[] = MODULES, enabled: readonly string[] = []) {
  const views = modules.map((m) => resolveModuleAccess(planCode, m, enabled));
  return {
    mine: views.filter((v) => v.status === 'available' || v.status === 'included_soon'),
    others: views.filter((v) => v.status === 'upgrade' || v.status === 'contract'),
  };
}
