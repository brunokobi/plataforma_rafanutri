// Testes das regras puras do acompanhamento em casa (tracking.js) e do aviso de água.
// Uso: node --test db/tests/extension-tracking.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageYears, bmiOf, edSignals, isDay, isHHMM, parseMeasuredAt, parseWeight, reminderDue, waterGoal, waterStreak } from '../../directus/extensions/rafanutri/tracking.js';
import { buildMessage } from '../../directus/extensions/rafanutri/notifications.js';
import { attentionReasons } from '../../directus/extensions/rafanutri/clinical-dashboard.js';

test('idade e IMC com faixa da OMS só para adulto', () => {
  assert.equal(ageYears('1990-06-15', new Date('2026-06-14T12:00:00Z')), 35);
  assert.equal(ageYears('1990-06-15', new Date('2026-06-15T12:00:00Z')), 36);
  assert.deepEqual(bmiOf(80, 175, 30), { bmi: 26.1, class: 'overweight', label: 'Sobrepeso' });
  assert.equal(bmiOf(50, 160, 30).class, 'normal');
  assert.equal(bmiOf(45, 150, 15).class, null);
  assert.equal(bmiOf(80, null, 30), null);
});

test('meta de água: do nutricionista, senão 35 ml/kg entre 1,5 e 4 L', () => {
  assert.deepEqual(waterGoal(2200, 90), { ml: 2200, source: 'professional' });
  assert.deepEqual(waterGoal(null, 72), { ml: 2500, source: 'weight' });
  assert.equal(waterGoal(null, 30).ml, 1500);
  assert.equal(waterGoal(null, 150).ml, 4000);
  assert.deepEqual(waterGoal(null, null), { ml: 2000, source: 'default' });
});

test('sequência de dias com a meta de água', () => {
  const m = new Map([['2026-11-26', 2000], ['2026-11-27', 2100], ['2026-11-28', 500]]);
  assert.equal(waterStreak(m, 2000, '2026-11-28'), 2);
  m.set('2026-11-28', 2000);
  assert.equal(waterStreak(m, 2000, '2026-11-28'), 3);
  assert.equal(waterStreak(new Map(), 2000, '2026-11-28'), 0);
});

test('transtorno alimentar pelo objetivo ou pela anamnese', () => {
  assert.equal(edSignals('Tratamento de anorexia', null), true);
  assert.equal(edSignals('Emagrecer', null), false);
  const snap = { sections: [{ questions: [{ id: 'q1', label: 'Já teve diagnóstico de transtorno alimentar?' }, { id: 'q2', label: 'Observações' }] }] };
  assert.equal(edSignals('', { schema_snapshot: snap, answers: { q1: 'sim' } }), true);
  assert.equal(edSignals('', { schema_snapshot: snap, answers: { q1: 'não' } }), false);
  assert.equal(edSignals('', { schema_snapshot: snap, answers: { q2: 'episódios de compulsão alimentar à noite' } }), true);
});

test('entrada do peso, da data e dos horários', () => {
  assert.equal(parseWeight('72,45'), 72.45);
  assert.equal(parseWeight('1'), null);
  assert.equal(parseWeight('abc'), null);
  const now = new Date('2026-11-28T12:00:00Z');
  assert.equal(parseMeasuredAt(undefined, now), now);
  assert.equal(parseMeasuredAt('2026-11-29T12:00:00Z', now), null);
  assert.equal(parseMeasuredAt('2026-08-01T12:00:00Z', now), null);
  assert.equal(parseMeasuredAt('2026-11-27T10:00:00Z', now).toISOString(), '2026-11-27T10:00:00.000Z');
  assert.ok(isDay('2026-11-28') && !isDay('28/11/2026'));
  assert.ok(isHHMM('08:00') && !isHHMM('8:00') && !isHHMM('24:00'));
});

test('lembrete de água: janela, intervalo e meta', () => {
  const now = new Date('2026-11-28T13:00:00Z'); // 10:00 em São Paulo
  const base = { start: '08:00', end: '20:00', everyMin: 120, lastAt: null, todayMl: 500, goalMl: 2000, now };
  assert.equal(reminderDue(base), true);
  assert.equal(reminderDue({ ...base, todayMl: 2000 }), false);
  assert.equal(reminderDue({ ...base, lastAt: '2026-11-28T12:00:00Z' }), false);
  assert.equal(reminderDue({ ...base, lastAt: '2026-11-28T11:00:00Z' }), true);
  assert.equal(reminderDue({ ...base, start: '11:00' }), false);
  const msg = buildMessage('water_reminder', { patientName: 'Ana Souza', todayMl: 500, goalMl: 2000 });
  assert.match(msg.lines.join(' '), /Faltam 1,5 L/);
});

test('alerta de paciente parado no app', () => {
  const now = new Date('2026-11-28T12:00:00Z');
  const base = { app_user_id: 'u', app_activated_at: '2026-11-01T12:00:00Z', created_at: '2026-10-01T12:00:00Z', last_visit_at: null, next_visit_at: '2026-12-10T12:00:00Z' };
  assert.ok(attentionReasons({ ...base, home_last_at: null }, now).includes('home_idle'));
  assert.ok(attentionReasons({ ...base, home_last_at: '2026-11-15T12:00:00Z' }, now).includes('home_idle'));
  assert.ok(!attentionReasons({ ...base, home_last_at: '2026-11-25T12:00:00Z' }, now).includes('home_idle'));
  assert.ok(!attentionReasons({ ...base, app_activated_at: '2026-11-25T12:00:00Z', home_last_at: null }, now).includes('home_idle'));
});
