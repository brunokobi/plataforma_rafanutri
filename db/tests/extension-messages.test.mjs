// Testes das regras puras das mensagens entre paciente e nutricionista (messages.js) e dos textos de aviso.
// Uso: node --test db/tests/extension-messages.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_BODY, cleanBody, cursor, notifyBucket } from '../../directus/extensions/rafanutri/messages.js';
import { buildMessage, KINDS } from '../../directus/extensions/rafanutri/notifications.js';

test('texto da mensagem: apara, normaliza quebras e recusa vazio ou longo demais', () => {
  assert.equal(cleanBody('  oi  '), 'oi');
  assert.equal(cleanBody('a\r\nb'), 'a\nb');
  assert.equal(cleanBody('a\n\n\n\n\n\nb'), 'a\n\n\nb');
  assert.equal(cleanBody('a\u0007b'), 'ab');
  assert.equal(cleanBody('   \n  '), null);
  assert.equal(cleanBody(42), null);
  assert.equal(cleanBody('x'.repeat(MAX_BODY)), 'x'.repeat(MAX_BODY));
  assert.equal(cleanBody('x'.repeat(MAX_BODY + 1)), null);
});

test('cursor aceita data ISO e recusa o resto', () => {
  assert.equal(cursor('2026-11-28T10:00:00.123Z')?.toISOString(), '2026-11-28T10:00:00.123Z');
  assert.equal(cursor('ontem'), null);
  assert.equal(cursor(undefined), null);
  assert.equal(cursor('2026-11-28T10:00:00.123Z'.repeat(3)), null);
});

test('janela de aviso de 3 horas: mesma janela não repete o aviso', () => {
  assert.equal(notifyBucket('2026-11-28T00:10:00Z'), notifyBucket('2026-11-28T02:50:00Z'));
  assert.notEqual(notifyBucket('2026-11-28T02:50:00Z'), notifyBucket('2026-11-28T03:10:00Z'));
});

test('avisos de mensagem não levam o texto da conversa', () => {
  assert.ok(KINDS.message_to_patient && KINDS.message_to_professional);
  const p = buildMessage('message_to_patient', { patientName: 'Ana Souza', practice: 'Clínica X', from: 'Rafaela Lima', link: 'https://x.test/p/mensagens' });
  assert.match(p.subject, /Rafaela Lima/);
  assert.ok(p.lines.join(' ').includes('Olá, Ana!'));
  const n = buildMessage('message_to_professional', { patientName: 'Rafaela', practice: 'Clínica X', fromPatient: 'Ana Souza', count: 3, link: 'https://x.test/app/mensagens/1' });
  assert.match(n.subject, /3 mensagens novas de Ana Souza/);
  assert.equal(buildMessage('message_to_professional', { fromPatient: 'Ana', count: 1 }).subject, 'Nova mensagem de Ana');
});
