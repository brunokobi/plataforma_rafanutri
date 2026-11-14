import { describe, expect, it } from 'vitest';
import { centsToInput, formatCents, parseMoneyToCents } from '@/lib/finance/money';
import { isOverdue, monthRange, monthShort, periodTotals, shiftMonth, transactionsCsv, type Transaction } from '@/lib/finance/types';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'x', kind: 'income', category_id: 'c', category_name: 'Consulta', description: 'Consulta', amount_cents: 100, due_date: '2026-03-10', status: 'paid',
  paid_at: '2026-03-10', payment_method: 'pix', patient_id: null, patient_name: null, appointment_id: null, notes: null, ...over,
});

describe('dinheiro em centavos (RN-053)', () => {
  it('formata em pt-BR', () => {
    expect(formatCents(123456)).toBe('R$ 1.234,56');
    expect(formatCents(1)).toBe('R$ 0,01');
    expect(centsToInput(25000)).toBe('250,00');
  });
  it('lê o valor digitado', () => {
    expect(parseMoneyToCents('1.234,56')).toBe(123456);
    expect(parseMoneyToCents('R$ 250')).toBe(25000);
    expect(parseMoneyToCents('10,5')).toBe(1050);
    expect(parseMoneyToCents('10.50')).toBe(1050);
    expect(parseMoneyToCents('1.234')).toBe(123400);
    expect(parseMoneyToCents('0,01')).toBe(1);
    for (const bad of ['', '0', '0,00', 'abc', '1,2,3', '10,555', '-5']) expect(parseMoneyToCents(bad), bad).toBeNull();
  });
});

describe('fluxo do mês', () => {
  it('três recebimentos pagos em março somam em centavos; em aberto e atrasado à parte', () => {
    const list = [
      tx({ amount_cents: 25000 }), tx({ amount_cents: 12050 }), tx({ amount_cents: 18001 }),
      tx({ kind: 'expense', amount_cents: 150000 }),
      tx({ status: 'open', paid_at: null, amount_cents: 9999, due_date: '2026-03-05' }),
      tx({ status: 'open', paid_at: null, amount_cents: 1, due_date: '2026-03-30' }),
      tx({ status: 'cancelled', paid_at: null, amount_cents: 777 }),
    ];
    expect(periodTotals(list, '2026-03-20')).toEqual({ income: 55051, expense: 150000, balance: -94949, openIncome: 10000, overdue: 9999 });
    expect(isOverdue(list[4]!, '2026-03-20')).toBe(true);
    expect(isOverdue(list[5]!, '2026-03-20')).toBe(false);
  });
  it('meses', () => {
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthShort('2026-03-01')).toBe('mar/26');
  });
});

describe('CSV', () => {
  it('ponto e vírgula, vírgula decimal, despesa negativa, BOM e fórmula neutralizada', () => {
    const csv = transactionsCsv([
      tx({ description: 'Consulta; João', amount_cents: 25050, patient_name: 'João' }),
      tx({ kind: 'expense', category_name: 'Aluguel', description: '=HYPERLINK("x")', amount_cents: 150000, payment_method: null }),
    ]);
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe('Tipo;Categoria;Descrição;Paciente;Valor (R$);Vencimento;Situação;Pago em;Forma de pagamento;Observação');
    expect(lines[1]).toBe('Receita;Consulta;"Consulta; João";João;250,50;10/03/2026;Pago;10/03/2026;Pix;');
    expect(lines[2]).toBe(`Despesa;Aluguel;"'=HYPERLINK(""x"")";;-1500,00;10/03/2026;Pago;10/03/2026;;`);
  });
});
