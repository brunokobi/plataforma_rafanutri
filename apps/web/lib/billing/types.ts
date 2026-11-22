import { isoToBR } from '@/lib/format/date';
import { formatCents } from '@/lib/finance/money';
// Assinatura da plataforma por Pix (0059).

export type PaidPlan = 'essential' | 'professional' | 'clinic';
export type SubscriptionStatus = 'pending' | 'active' | 'canceled' | 'ended';
export type InvoiceStatus = 'open' | 'paid' | 'void';

export const SUB_STATUS_LABEL: Record<SubscriptionStatus, string> = { pending: 'Aguardando o 1º pagamento', active: 'Ativa', canceled: 'Cancelada', ended: 'Encerrada' };
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { open: 'Em aberto', paid: 'Paga', void: 'Cancelada' };

export type BillingCycle = 'monthly' | 'annual';
export const CYCLE_LABEL: Record<BillingCycle, string> = { monthly: 'Mensal', annual: 'Anual' };

export interface SellablePlan { code: PaidPlan; name: string; price_cents: number; annual_price_cents: number | null; max_active_patients: number | null; max_members: number | null }

export interface Subscription {
  plan: PaidPlan;
  next_plan: PaidPlan | null;
  billing_cycle: BillingCycle;
  next_billing_cycle: BillingCycle | null;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface Invoice {
  id: string;
  plan: PaidPlan;
  billing_cycle: BillingCycle;
  amount_cents: number;
  period_start: string;
  period_end: string;
  due_on: string;
  status: InvoiceStatus;
  txid: string;
  /** Link de pagamento da InfinitePay (Pix grátis ou cartão), quando a cobrança automática está ligada. */
  checkout_url?: string | null;
  reported_paid_at: string | null;
  paid_at: string | null;
}

export interface InvoiceDetail extends Invoice { pix_payload: string; plan_name: string; receiver_name: string | null; can_report: boolean }

export interface Billing {
  current_plan: string;
  role: 'owner' | 'nutritionist' | 'assistant';
  pix_ready: boolean;
  plans: SellablePlan[];
  subscription: Subscription | null;
  invoices: Invoice[];
}

export interface AdminBilling {
  settings: { pix_key: string | null; receiver_name: string | null; receiver_city: string | null; notify_email: string | null; grace_days: number; infinitepay_handle: string | null } | null;
  plans: Array<SellablePlan & { sellable: boolean }>;
  invoices: Array<Invoice & { organization_id: string; organization_name: string; owner_email: string | null }>;
  subscriptions: Array<Subscription & { organization_id: string; organization_name: string }>;
}

export interface UserNotificationPrefs { telegram_linked: boolean; telegram_opt_in: boolean; telegram_name: string | null; telegram_linked_at: string | null; telegram_ready: boolean; email: string | null }

/** O que cada plano pago traz, nos cartões de "Meu plano" (limites vêm do banco; espelha lib/modules/plans.ts). */
export const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  free: ['Clínico completo e área do paciente', 'Agenda e avisos de plano novo', 'Assistente de IA: 5 pedidos por dia', 'Com anúncios (só nas telas sem dado de paciente)'],
  essential: ['Clínico completo e área do paciente', 'Agenda, avisos no Telegram e financeiro', 'Assistente de IA: 20 pedidos por dia'],
  professional: ['Tudo do Essencial', 'Assistente de IA (200 pedidos por dia) e módulo materno-infantil'],
  clinic: ['Tudo do Profissional', 'Equipe sem limite, com papéis e permissões'],
};

/** "R$ 49,90". */
/** "R$ 1.234,56" (mesmo formato do financeiro: lib/finance/money.ts). */
export const brl = (cents: number) => formatCents(cents);
/** "25/11/2026" a partir de AAAA-MM-DD. */
export const dateBR = (iso: string | null) => (iso ? isoToBR(iso) : '—');
