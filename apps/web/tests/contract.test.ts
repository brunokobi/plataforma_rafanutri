import { describe, expect, it } from 'vitest';
import { invoiceStatus } from '@/lib/uan/contract';

describe('contrato UAN (RN-124)', () => {
  it('fatura em aberto depois do vencimento aparece vencida', () => {
    expect(invoiceStatus({ status: 'open', due_on: '2026-11-10' }, '2026-11-19')).toBe('overdue');
    expect(invoiceStatus({ status: 'open', due_on: '2026-11-19' }, '2026-11-19')).toBe('open');
    expect(invoiceStatus({ status: 'paid', due_on: '2026-11-10' }, '2026-11-19')).toBe('paid');
  });
});
