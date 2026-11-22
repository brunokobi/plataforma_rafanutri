import type { ModuleCode } from './catalog';
import { formatCents } from '@/lib/finance/money';

export type PlanCode = 'free' | 'essential' | 'professional' | 'clinic' | 'enterprise_uan';

/** included: faz parte do plano · quota: incluso com limite · contract: só sob contrato · none: não incluso */
export type ModuleGrant = 'included' | 'quota' | 'contract' | 'none';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  /** Preço mensal em texto ("R$ 49,90/mês"). */
  price: string;
  /** Centavos por mês (null = sob proposta). */
  monthlyCents: number | null;
  /** Centavos por ano: 12 meses com 50% de desconto (null = sob proposta ou grátis). */
  annualCents: number | null;
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
    monthlyCents: 0,
    annualCents: null,
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
    price: 'R$ 49,90/mês',
    monthlyCents: 4990,
    annualCents: 29940,
    audience: 'Nutricionista autônomo',
    maxActivePatients: 100,
    maxMembers: 1,
    grants: {
      clinical: { grant: 'included', note: 'Até 100 pacientes ativos' },
      patient_area: { grant: 'included' },
      practice: { grant: 'included', note: 'Lembretes e agendamento online' },
      ai: { grant: 'quota', note: '20 por dia' },
      maternal: { grant: 'none' },
      uan: { grant: 'none' },
      public_health: contract,
    },
  },
  {
    code: 'professional',
    name: 'Profissional',
    price: 'R$ 99,90/mês',
    monthlyCents: 9990,
    annualCents: 59940,
    audience: 'Consultório com volume',
    maxActivePatients: null,
    maxMembers: 1,
    grants: {
      clinical: { grant: 'included', note: 'Pacientes ativos sem limite' },
      patient_area: { grant: 'included' },
      practice: { grant: 'included', note: 'Completo' },
      ai: { grant: 'included', note: 'Até 200 por dia' },
      maternal: { grant: 'included' },
      uan: { grant: 'none' },
      public_health: contract,
    },
  },
  {
    code: 'clinic',
    name: 'Clínica',
    price: 'R$ 199,90/mês',
    monthlyCents: 19990,
    annualCents: 119940,
    audience: 'Equipes',
    maxActivePatients: null,
    maxMembers: null,
    grants: {
      clinical: { grant: 'included' },
      patient_area: { grant: 'included' },
      practice: { grant: 'included', note: 'Completo' },
      ai: { grant: 'included', note: 'Até 200 por dia' },
      maternal: { grant: 'included' },
      uan: { grant: 'none' },
      public_health: contract,
    },
  },
  {
    code: 'enterprise_uan',
    name: 'Enterprise UAN',
    price: 'Sob consulta',
    monthlyCents: null,
    annualCents: null,
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

/** Desconto do plano anual (12 meses pelo preço de 6). */
export const ANNUAL_DISCOUNT = 0.5;

const brl = formatCents;

/** Preço para a tela, no ciclo pedido: "R$ 49,90/mês", "R$ 299,40/ano", "Grátis" ou "Sob proposta". */
export function planPrice(p: PlanDefinition, cycle: 'monthly' | 'annual' = 'monthly'): { main: string; note: string | null } {
  if (p.monthlyCents === null) return { main: 'Sob proposta', note: 'por unidade produtora' };
  if (p.monthlyCents === 0) return { main: 'R$ 0', note: 'para sempre' };
  if (cycle === 'annual' && p.annualCents !== null) {
    return { main: `${brl(p.annualCents)}/ano`, note: `equivale a ${brl(Math.round(p.annualCents / 12))}/mês · 50% de desconto` };
  }
  return { main: `${brl(p.monthlyCents)}/mês`, note: p.annualCents !== null ? `ou ${brl(p.annualCents)}/ano (50% de desconto)` : null };
}

export function getPlan(code: PlanCode): PlanDefinition {
  const plan = PLANS.find((p) => p.code === code);
  if (!plan) throw new Error(`Plano desconhecido: ${code}`);
  return plan;
}
