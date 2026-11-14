// Testes das regras puras do financeiro (RN-053).
// Uso: node --test db/tests/extension-finance.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillMonths, monthStart, validateTransaction } from '../../directus/extensions/rafanutri/finance.js';

const CAT = '11111111-1111-4111-8111-111111111111';
const PAT = '22222222-2222-4222-8222-222222222222';

test('recebimento pago sem data de pagamento usa o vencimento', () => {
  const r = validateTransaction({ kind: 'income', category_id: CAT, description: ' Consulta  março ', amount_cents: 25000, due_date: '2026-03-10', status: 'paid', payment_method: 'pix', patient_id: PAT });
  assert.deepEqual(r.value, { kind: 'income', category_id: CAT, description: 'Consulta março', amount_cents: 25000, due_date: '2026-03-10', status: 'paid', paid_at: '2026-03-10', payment_method: 'pix', patient_id: PAT, appointment_id: null, notes: null });
});

test('valor em centavos inteiro e maior que zero', () => {
  for (const amount_cents of [0, -1, 10.5, '12,50', null]) {
    assert.ok(validateTransaction({ kind: 'expense', category_id: CAT, description: 'Aluguel', amount_cents, due_date: '2026-03-01' }).errors.amount_cents, String(amount_cents));
  }
});

test('despesa não leva paciente; datas e forma de pagamento validadas', () => {
  const r = validateTransaction({ kind: 'expense', category_id: CAT, description: 'Aluguel', amount_cents: 100, due_date: '2026-03-01', patient_id: PAT });
  assert.equal(r.value.patient_id, null);
  const bad = validateTransaction({ kind: 'income', category_id: 'x', description: 'X', amount_cents: 1, due_date: '2026-02-30', status: 'paid', paid_at: 'ontem', payment_method: 'cheque' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['category_id', 'description', 'due_date', 'paid_at', 'payment_method']);
});

test('em aberto não tem data de pagamento', () => {
  assert.equal(validateTransaction({ kind: 'income', category_id: CAT, description: 'Aberto', amount_cents: 1, due_date: '2026-03-01', paid_at: '2026-03-02' }).value.paid_at, null);
});

test('meses do gráfico: 6 meses com zero onde não houve movimento, virando o ano', () => {
  assert.equal(monthStart('2026-02', -3), '2025-11-01');
  const m = fillMonths([{ month: '2026-01-01', income_cents: '500', expense_cents: '200' }], '2026-02', 6);
  assert.deepEqual(m.map((x) => x.month), ['2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  assert.deepEqual(m[4], { month: '2026-01-01', income_cents: 500, expense_cents: 200 });
  assert.equal(m[5].income_cents, 0);
});

import { splitInstallments, validatePackage } from '../../directus/extensions/rafanutri/finance.js';

test('parcelas: sobra na primeira, mensais, dia 31 ajustado', () => {
  assert.deepEqual(splitInstallments(100000, 3, '2026-01-31'), [
    { number: 1, amount_cents: 33334, due_date: '2026-01-31' },
    { number: 2, amount_cents: 33333, due_date: '2026-02-28' },
    { number: 3, amount_cents: 33333, due_date: '2026-03-31' },
  ]);
  assert.equal(splitInstallments(60000, 1, '2026-11-14').length, 1);
  assert.equal(splitInstallments(60000, 13, '2026-11-14'), null);
  assert.equal(splitInstallments(0, 2, '2026-11-14'), null);
  assert.equal(splitInstallments(100, 2, '2026-11-31'), null);
});

test('pacote do catálogo', () => {
  assert.deepEqual(validatePackage({ name: ' Trimestral ', sessions: '3', price_cents: 60000, validity_days: '' }).value, { name: 'Trimestral', sessions: 3, price_cents: 60000, validity_days: null, active: true });
  assert.deepEqual(Object.keys(validatePackage({ name: 'X', sessions: 0, price_cents: -1, validity_days: 1000 }).errors).sort(), ['name', 'price_cents', 'sessions', 'validity_days']);
});
