// Testes das regras puras da assinatura por Pix (0059).
// Uso: node --test db/tests/extension-billing.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMonths, asciiUpper, brl, crc16, dateBR, monthlyPeriod, newTxid, normalizePixKey, parsePrice, pixPayload, validateBillingSettings } from '../../directus/extensions/rafanutri/billing.js';

test('CRC do exemplo do manual do Pix (Banco Central)', () => {
  const body = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
  assert.equal(crc16(body), '1D3D');
});

test('código Pix com valor e identificador', () => {
  const p = pixPayload({ key: 'financeiro@rafanutri.com.br', name: 'Rafanutri Tecnologia', city: 'Belo Horizonte', amountCents: 4990, txid: 'RNABC123' });
  assert.match(p, /^000201/);
  assert.ok(p.includes('0014br.gov.bcb.pix0127financeiro@rafanutri.com.br'));
  assert.ok(p.includes('540549.90'));
  assert.ok(p.includes('5920RAFANUTRI TECNOLOGIA'));
  assert.ok(p.includes('6014BELO HORIZONTE'));
  assert.ok(p.includes('62120508RNABC123'));
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)), 'CRC confere');
});

test('nome sem acento e no tamanho', () => {
  assert.equal(asciiUpper('São João da Nutrição Ltda ME', 25), 'SAO JOAO DA NUTRICAO LTDA');
});

test('txid', () => {
  const t = newTxid();
  assert.match(t, /^RN[A-Za-z0-9]{20}$/);
  assert.notEqual(t, newTxid());
});

test('chave Pix', () => {
  assert.deepEqual(normalizePixKey('529.982.247-25'), { key: '52998224725', type: 'cpf' });
  assert.equal(normalizePixKey('111.111.111-11'), null);
  assert.deepEqual(normalizePixKey('11.222.333/0001-81'), { key: '11222333000181', type: 'cnpj' });
  assert.deepEqual(normalizePixKey('Financeiro@Rafanutri.com'), { key: 'financeiro@rafanutri.com', type: 'email' });
  assert.deepEqual(normalizePixKey('(31) 99999-0000'), { key: '+5531999990000', type: 'phone' });
  assert.deepEqual(normalizePixKey('+55 31 99999-0000'), { key: '+5531999990000', type: 'phone' });
  assert.deepEqual(normalizePixKey('123E4567-E12B-12D1-A456-426655440000'), { key: '123e4567-e12b-12d1-a456-426655440000', type: 'evp' });
  assert.equal(normalizePixKey('abc'), null);
});

test('períodos mensais', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-21', 1), '2026-12-21');
  assert.deepEqual(monthlyPeriod('2026-11-21'), { period_start: '2026-11-21', period_end: '2026-12-20' });
  assert.deepEqual(monthlyPeriod('2026-12-21'), { period_start: '2026-12-21', period_end: '2027-01-20' });
});

test('valores e datas', () => {
  assert.equal(brl(4990).replace(/\s/g, ' '), 'R$ 49,90');
  assert.equal(dateBR('2026-11-25'), '25/11/2026');
  assert.equal(parsePrice('49,90'), 4990);
  assert.equal(parsePrice('1.249,90'), 124990);
  assert.equal(parsePrice(4990), 4990);
  assert.equal(parsePrice('abc'), null);
});

test('configuração de cobrança', () => {
  const ok = validateBillingSettings({ pix_key: '11.222.333/0001-81', receiver_name: 'Rafanutri Tecnologia Ltda', receiver_city: 'Belo Horizonte', notify_email: 'Fin@x.com', grace_days: 5 });
  assert.deepEqual(ok.value, { pix_key: '11222333000181', receiver_name: 'RAFANUTRI TECNOLOGIA LTDA', receiver_city: 'BELO HORIZONTE', notify_email: 'fin@x.com', grace_days: 5 });
  const bad = validateBillingSettings({ pix_key: 'x', receiver_name: '', receiver_city: '', grace_days: 40 });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['grace_days', 'pix_key', 'receiver_city', 'receiver_name']);
});
