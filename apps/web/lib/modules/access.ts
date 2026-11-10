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

export function resolveModuleAccess(planCode: PlanCode, module: ModuleDefinition): ModuleAccessView {
  const plan = getPlan(planCode);
  const { grant, note } = plan.grants[module.code];
  const unlockedBy = PLANS.filter((p) => p.code !== planCode && ['included', 'quota'].includes(p.grants[module.code].grant));

  let status: ModuleStatus;
  if (grant === 'contract') status = 'contract';
  else if (grant === 'none') status = 'upgrade';
  else status = module.availability === 'available' ? 'available' : 'included_soon';

  return { module, grant, status, note, unlockedBy };
}

/** Separa os módulos em "seus" (inclusos) e "outros planos" para a tela principal. */
export function buildModuleSections(planCode: PlanCode, modules: readonly ModuleDefinition[] = MODULES) {
  const views = modules.map((m) => resolveModuleAccess(planCode, m));
  return {
    mine: views.filter((v) => v.status === 'available' || v.status === 'included_soon'),
    others: views.filter((v) => v.status === 'upgrade' || v.status === 'contract'),
  };
}
