import type { ModuleCode } from './catalog';

export type PlanCode = 'free' | 'essential' | 'professional' | 'clinic' | 'enterprise_uan';

/** included: faz parte do plano · quota: incluso com limite · contract: só sob contrato · none: não incluso */
export type ModuleGrant = 'included' | 'quota' | 'contract' | 'none';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  price: string;
  audience: string;
  maxActivePatients: number | null;
  maxMembers: number | null;
  /** Detalhe exibido na tabela de comparação, por módulo. */
  grants: Record<ModuleCode, { grant: ModuleGrant; note?: string }>;
}

const contract = { grant: 'contract' as const };

export const PLANS: readonly PlanDefinition[] = [
  {
    code: 'free',
    name: 'Gratuito',
    price: 'R$ 0',
    audience: 'Todo nutricionista',
    maxActivePatients: 20,
    maxMembers: 1,
    grants: {
      clinical: { grant: 'included', note: 'Até 20 pacientes ativos' },
      patient_area: { grant: 'included' },
      practice: { grant: 'none' },
      ai: { grant: 'quota', note: '5 por dia' },
      maternal: { grant: 'none' },
      uan: { grant: 'none' },
      public_health: contract,
    },
  },
  {
    code: 'essential',
    name: 'Essencial',
    price: 'Em breve',
    audience: 'Nutricionista autônomo',
    maxActivePatients: null,
    maxMembers: 1,
    grants: {
      clinical: { grant: 'included', note: 'Mais pacientes ativos' },
      patient_area: { grant: 'included' },
      practice: { grant: 'included', note: 'Lembretes e agendamento online' },
      ai: { grant: 'quota', note: '5 por dia' },
      maternal: { grant: 'none' },
      uan: { grant: 'none' },
      public_health: contract,
    },
  },
  {
    code: 'professional',
    name: 'Profissional',
    price: 'Em breve',
    audience: 'Consultório com volume',
    maxActivePatients: null,
    maxMembers: 1,
    grants: {
      clinical: { grant: 'included' },
      patient_area: { grant: 'included' },
      practice: { grant: 'included', note: 'Completo' },
      ai: { grant: 'included' },
      maternal: { grant: 'included' },
      uan: { grant: 'none' },
      public_health: contract,
    },
  },
  {
    code: 'clinic',
    name: 'Clínica',
    price: 'Em breve',
    audience: 'Equipes',
    maxActivePatients: null,
    maxMembers: null,
    grants: {
      clinical: { grant: 'included' },
      patient_area: { grant: 'included' },
      practice: { grant: 'included', note: 'Completo' },
      ai: { grant: 'included' },
      maternal: { grant: 'included' },
      uan: { grant: 'none' },
      public_health: contract,
    },
  },
  {
    code: 'enterprise_uan',
    name: 'Enterprise UAN',
    price: 'Sob consulta',
    audience: 'Empresas de alimentação',
    maxActivePatients: null,
    maxMembers: null,
    grants: {
      clinical: { grant: 'none' },
      patient_area: { grant: 'none' },
      practice: { grant: 'none' },
      ai: { grant: 'none' },
      maternal: { grant: 'none' },
      uan: { grant: 'included', note: 'Por unidade produtora' },
      public_health: contract,
    },
  },
];

export function getPlan(code: PlanCode): PlanDefinition {
  const plan = PLANS.find((p) => p.code === code);
  if (!plan) throw new Error(`Plano desconhecido: ${code}`);
  return plan;
}
