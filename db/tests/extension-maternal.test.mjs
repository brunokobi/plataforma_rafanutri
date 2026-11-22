// Testes das validações do materno-infantil (0062 e 0065).
// Uso: node --test db/tests/extension-maternal.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMessage } from '../../directus/extensions/rafanutri/notifications.js';
import { validateFeeding, validateGuardian, validateLactation, validateMeasurement } from '../../directus/extensions/rafanutri/maternal.js';

const past = (days) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

test('medida: ao menos uma e dentro da faixa', () => {
  assert.ok(validateMeasurement({ assessed_at: past(1) }).errors.weight_kg);
  assert.ok(validateMeasurement({ assessed_at: past(1), weight_kg: 0.5 }).errors.weight_kg);
  assert.equal(validateMeasurement({ assessed_at: past(1), weight_kg: 9.4 }).value.weight_kg, 9.4);
});

test('introdução alimentar: item do catálogo, data e reação', () => {
  assert.ok(validateFeeding('allergen', 'chocolate', { introduced_on: past(1) }).errors.item);
  assert.ok(validateFeeding('other', 'egg', { introduced_on: past(1) }).errors.item);
  assert.ok(validateFeeding('allergen', 'egg', { introduced_on: past(-2) }).errors.introduced_on);
  assert.ok(validateFeeding('allergen', 'egg', { introduced_on: past(1), reaction: 'huge' }).errors.reaction);
  assert.deepEqual(validateFeeding('allergen', 'egg', { introduced_on: past(1), reaction: 'moderate', notes: '  manchas   na pele ' }).value,
    { kind: 'allergen', item: 'egg', introduced_on: past(1), reaction: 'moderate', notes: 'manchas na pele' });
  // Textura não tem reação
  assert.equal(validateFeeding('texture', 'mashed', { introduced_on: past(1), reaction: 'severe' }).value.reaction, 'none');
});

test('lactação: tipo e data; parcial só o enviado', () => {
  assert.ok(validateLactation({ started_on: past(10) }).errors.feeding_type);
  assert.deepEqual(validateLactation({ started_on: past(10), feeding_type: 'exclusive' }).value, { started_on: past(10), feeding_type: 'exclusive' });
  assert.deepEqual(validateLactation({ feeding_type: 'mixed' }, { partial: true }).value, { feeding_type: 'mixed' });
  assert.ok(validateLactation({ baby_patient_id: 'x' }, { partial: true }).errors.baby_patient_id);
  assert.equal(validateLactation({ baby_patient_id: null }, { partial: true }).value.baby_patient_id, null);
});

test('responsável: nome, parentesco, contato e consentimento', () => {
  const e = validateGuardian({ full_name: 'A', relationship: 'aunt', email: 'x', phone: 'abc' }).errors;
  assert.ok(e.full_name && e.relationship && e.email && e.phone);
  const v = validateGuardian({ full_name: ' Maria  Silva ', relationship: 'mother', email: 'Maria@Ex.com', phone: '(31) 99999-0000', consent: 'in_person' }).value;
  assert.deepEqual(v, { full_name: 'Maria Silva', relationship: 'mother', email: 'maria@ex.com', phone: '(31) 99999-0000', consent_method: 'in_person' });
  assert.deepEqual(validateGuardian({ consent: null }, { partial: true }).value, { consent_at: null, consent_method: null });
  assert.ok(validateGuardian({ consent: 'oral' }, { partial: true }).errors.consent);
});

test('aviso de reação ao nutricionista', () => {
  const m = buildMessage('feeding_reaction', { patientName: 'Ana', childName: 'Bebê Teste', item: 'egg', reaction: 'severe', link: 'https://x/y' });
  assert.match(m.subject, /grave/);
  assert.match(m.lines.join(' '), /ovo/);
});
