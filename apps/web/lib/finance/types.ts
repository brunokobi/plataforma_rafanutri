import { isoToBR } from '@/lib/format/date';
export type TxKind = 'income' | 'expense';
export type TxStatus = 'open' | 'paid' | 'cancelled';
export type PaymentMethod = 'pix' | 'cash' | 'debit' | 'credit' | 'transfer' | 'boleto' | 'other';

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix', cash: 'Dinheiro', debit: 'Cartão de débito', credit: 'Cartão de crédito', transfer: 'Transferência', boleto: 'Boleto', other: 'Outro',
};
export const STATUS_LABEL: Record<TxStatus, string> = { open: 'Em aberto', paid: 'Pago', cancelled: 'Cancelado' };
export const KIND_LABEL: Record<TxKind, string> = { income: 'Receita', expense: 'Despesa' };

export interface FinanceCategory { id: string; kind: TxKind; name: string; own: boolean }

export interface Transaction {
  id: string;
  kind: TxKind;
  category_id: string;
  category_name: string;
  description: string;
  amount_cents: number;
  due_date: string;
  status: TxStatus;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  patient_id: string | null;
  patient_name: string | null;
  appointment_id: string | null;
  notes: string | null;
  /** Recibo já emitido (RN-055). */
  receipt_id?: string | null;
}

export interface TransactionInput {
  kind: TxKind;
  category_id: string;
  description: string;
  amount_cents: number;
  due_date: string;
  status: TxStatus;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  patient_id: string | null;
  appointment_id: string | null;
  notes: string | null;
}

export interface TransactionList { from: string; to: string; today: string; transactions: Transaction[]; can_delete: boolean }

export interface FinanceSummary {
  today: string;
  months: Array<{ month: string; income_cents: number; expense_cents: number }>;
  receivable: { total_cents: number; count: number; overdue_cents: number; overdue_count: number };
}

export interface AppointmentPrefill {
  id: string;
  patient_id: string;
  patient_name: string;
  starts_at: string;
  type: 'first' | 'return';
  status: string;
  existing: { id: string; status: TxStatus } | null;
  last_amount_cents: number | null;
}

export type FinanceResult = { ok: true } | { ok: false; message: string };

export interface Receipt {
  id: string;
  number: number;
  issued_at: string;
  amount_cents: number;
  paid_at: string;
  payment_method: PaymentMethod | null;
  service: string;
  payer_name: string;
  payer_cpf: string | null;
  issuer_name: string;
  issuer_crn: string | null;
  issuer_tax_id: string | null;
  practice_name: string;
  transaction_id: string;
}
export interface ReceiptPayload { receipt: Receipt; header: { organization_id: string; brand_color: string | null } }

/** Lançamento em aberto com vencimento antes de hoje. */
export const isOverdue = (t: Pick<Transaction, 'status' | 'due_date'>, today: string) => t.status === 'open' && t.due_date < today;

/** Totais do período (regime de caixa: só pagos; em aberto à parte). */
export function periodTotals(list: Transaction[], today: string) {
  let income = 0, expense = 0, openIncome = 0, overdue = 0;
  for (const t of list) {
    if (t.status === 'paid') {
      if (t.kind === 'income') income += t.amount_cents;
      else expense += t.amount_cents;
    } else if (t.status === 'open' && t.kind === 'income') {
      openIncome += t.amount_cents;
      if (isOverdue(t, today)) overdue += t.amount_cents;
    }
  }
  return { income, expense, balance: income - expense, openIncome, overdue };
}

/** "2026-03" → { from: "2026-03-01", to: "2026-04-01" } */
export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const next = new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 10);
  return { from: `${ym}-01`, to: next };
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1 + delta, 1)).toISOString().slice(0, 7);
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "2026-03-01" → "mar/26" */
export const monthShort = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
/** "2026-03" → "março de 2026" */
export const monthLong = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** CSV do período para planilha (pt-BR: ponto e vírgula, vírgula decimal, BOM para o Excel). */
export function transactionsCsv(list: Transaction[]): string {
  // Texto que começa com = + - @ vira fórmula no Excel: prefixa com apóstrofo (números ficam como estão).
  const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(,\d+)?$/.test(v) ? `'${v}` : v);
  const esc = (raw: string) => {
    const v = safe(raw);
    return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const br = (iso: string | null) => (iso ? isoToBR(iso) : '');
  const head = ['Tipo', 'Categoria', 'Descrição', 'Paciente', 'Valor (R$)', 'Vencimento', 'Situação', 'Pago em', 'Forma de pagamento', 'Observação'];
  const rows = list.map((t) => [
    KIND_LABEL[t.kind], t.category_name, t.description, t.patient_name ?? '',
    (t.kind === 'expense' ? -t.amount_cents / 100 : t.amount_cents / 100).toFixed(2).replace('.', ','),
    br(t.due_date), STATUS_LABEL[t.status], br(t.paid_at), t.payment_method ? PAYMENT_LABEL[t.payment_method] : '', t.notes ?? '',
  ]);
  return `﻿${[head, ...rows].map((r) => r.map((c) => esc(String(c))).join(';')).join('\r\n')}\r\n`;
}
