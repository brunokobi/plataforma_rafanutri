// RN-124 — Contrato Enterprise da UAN: situação, limite de unidades e faturas.
export type ContractState = 'active' | 'read_only' | 'ended' | 'none';
export const CONTRACT_STATE_LABEL: Record<ContractState, string> = { active: 'Vigente', read_only: 'Encerrado — modo leitura', ended: 'Encerrado', none: 'Piloto (sem contrato)' };
export const PLAN_LABEL: Record<string, string> = { uan_pilot: 'Piloto', uan_quality: 'Qualidade', uan_complete: 'Completo' };
export const INVOICE_STATUS_LABEL: Record<string, string> = { open: 'Em aberto', paid: 'Paga', overdue: 'Vencida', void: 'Cancelada' };
export interface ContractData {
  organization: { id: string; name: string };
  state: ContractState;
  read_only_until: string | null;
  unit_limit: number;
  active_units: number;
  contracts: Array<{ id: string; plan: string; units_contracted: number; monthly_price_cents: number; starts_at: string; ends_at: string | null; billing_method: string; features: Record<string, unknown> }>;
  invoices: Array<{ id: string; contract_id: string; period_start: string; period_end: string; amount_cents: number; due_on: string; status: string; paid_at: string | null; payment_url: string | null }>;
}
/** Situação exibida da fatura: em aberto depois do vencimento aparece como vencida. */
export const invoiceStatus = (i: { status: string; due_on: string }, today: string) => (i.status === 'open' && i.due_on < today ? 'overdue' : i.status);
