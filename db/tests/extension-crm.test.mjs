// Testes das regras puras do CRM (RN-056).
// Uso: node --test db/tests/extension-crm.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePhone, validateLead } from '../../directus/extensions/rafanutri/crm.js';

test('telefone vira E.164', () => {
  assert.equal(normalizePhone('(31) 99999-0000'), '+5531999990000');
  assert.equal(normalizePhone('3133334444'), '+553133334444');
  assert.equal(normalizePhone('+351 912 345 678'), '+351912345678');
  assert.equal(normalizePhone('5531999990000'), '+5531999990000');
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('123'), undefined);
});

test('lead', () => {
  assert.deepEqual(validateLead({ full_name: ' Maria  Lead ', phone: '(31) 99999-0000', source: 'instagram' }).value, { full_name: 'Maria Lead', phone: '+5531999990000', email: null, source: 'instagram', notes: null });
  assert.equal(validateLead({ full_name: 'Ana', source: 'tiktok' }).value.source, 'other');
  assert.deepEqual(Object.keys(validateLead({ full_name: 'A', phone: '12', email: 'x' }).errors).sort(), ['email', 'full_name', 'phone']);
});
