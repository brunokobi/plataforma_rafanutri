// Testes das regras da InfinitePay (assinatura da plataforma).
// Uso: node --test db/tests/extension-infinitepay.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLinkBody, confirmsInvoice, extractCheckoutUrl, infinitePayClient, normalizeHandle, paymentRef, sameToken, webhookToken } from '../../directus/extensions/rafanutri/infinitepay.js';

const inv = { id: '11111111-1111-1111-1111-111111111111', amount_cents: 29940 };

test('InfiniteTag', () => {
  assert.equal(normalizeHandle('$Rafa_Nutri'), 'rafa_nutri');
  assert.equal(normalizeHandle(' rafanutri '), 'rafanutri');
  assert.equal(normalizeHandle('a'), null);
  assert.equal(normalizeHandle('com espaço'), null);
  assert.equal(normalizeHandle(null), null);
});

test('corpo do link: centavos, order_nsu = fatura, opções só com API Key', () => {
  const b = buildLinkBody({ handle: 'rafa', invoice: inv, description: 'Plano Essencial anual', redirectUrl: 'https://x/f', webhookUrl: 'https://api/w', customer: { name: 'Ana', email: 'a@b.com' } });
  assert.deepEqual(b, { handle: 'rafa', items: [{ quantity: 1, price: 29940, description: 'Plano Essencial anual' }], order_nsu: inv.id, redirect_url: 'https://x/f', webhook_url: 'https://api/w', customer: { name: 'Ana', email: 'a@b.com' } });
  assert.deepEqual(buildLinkBody({ handle: 'rafa', invoice: inv, description: 'x', redirectUrl: 'https://x', withApiKey: true, validUntil: '2026-12-01T23:59:59-03:00' }).options, { single_payment: true, valid_until: '2026-12-01T23:59:59-03:00' });
});

test('URL do checkout em qualquer campo da resposta', () => {
  assert.equal(extractCheckoutUrl({ url: 'https://checkout.infinitepay.io/rafa/abc' }), 'https://checkout.infinitepay.io/rafa/abc');
  assert.equal(extractCheckoutUrl({ data: { link: 'https://pay.infinitepay.io/x' } }), 'https://pay.infinitepay.io/x');
  assert.equal(extractCheckoutUrl({ slug: 'abc', foo: 'http://inseguro' }), null);
  assert.equal(extractCheckoutUrl(null), null);
});

test('referência do pagamento vinda do webhook ou da volta', () => {
  assert.deepEqual(paymentRef({ order_nsu: inv.id, transaction_nsu: 't1', invoice_slug: 's1' }), { order_nsu: inv.id, transaction_nsu: 't1', slug: 's1' });
  assert.deepEqual(paymentRef({ slug: 's2' }), { order_nsu: null, transaction_nsu: null, slug: 's2' });
});

test('só confirma pago, com sucesso e valor da fatura', () => {
  assert.equal(confirmsInvoice({ success: true, paid: true, amount: 29940, paid_amount: 31000 }, inv), true);
  assert.equal(confirmsInvoice({ success: true, paid: false, amount: 29940 }, inv), false);
  assert.equal(confirmsInvoice({ success: false, paid: true, amount: 29940 }, inv), false);
  assert.equal(confirmsInvoice({ success: true, paid: true, amount: 100 }, inv), false);
  assert.equal(confirmsInvoice(null, inv), false);
});

test('token do webhook e comparação', () => {
  const t = webhookToken('segredo');
  assert.equal(t.length, 48);
  assert.ok(sameToken(t, webhookToken('segredo')));
  assert.ok(!sameToken(t, webhookToken('outro')));
  assert.equal(webhookToken(''), '');
});

test('cliente: chama /links e /payment_check com a API Key', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return { status: 200, json: async () => ({ url: 'https://checkout.infinitepay.io/x' }) }; };
  const c = infinitePayClient({ fetchImpl: fakeFetch, apiKey: 'inchk_x' });
  await c.createLink({ handle: 'rafa' });
  await c.paymentCheck({ handle: 'rafa', order_nsu: 'o', transaction_nsu: 't', slug: 's' });
  assert.equal(calls[0].url, 'https://api.checkout.infinitepay.io/links');
  assert.equal(calls[1].url, 'https://api.checkout.infinitepay.io/payment_check');
  assert.equal(calls[0].init.headers['X-Api-Key'], 'inchk_x');
  assert.deepEqual(JSON.parse(calls[1].init.body), { handle: 'rafa', order_nsu: 'o', transaction_nsu: 't', slug: 's' });
});
