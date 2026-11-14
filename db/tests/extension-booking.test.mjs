// Testes das regras puras do agendamento online (RN-068).
// Uso: node --test db/tests/extension-booking.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOfferedSlot, publicSlots, validateBooking } from '../../directus/extensions/rafanutri/booking.js';

const profile = { weekdays: [1, 2, 3, 4, 5], day_start: '08:00:00', day_end: '12:00:00', slot_minutes: 60, min_notice_hours: 12, max_days_ahead: 30, online: true, in_person: false };
const now = new Date('2026-11-16T09:00:00-03:00'); // segunda 09:00

test('horários: expediente, antecedência, fim de semana e ocupados', () => {
  const busy = [[Date.parse('2026-11-17T09:30:00-03:00'), Date.parse('2026-11-17T10:30:00-03:00')]];
  const days = publicSlots(profile, busy, '2026-11-16', 7, now);
  assert.deepEqual(days.map((d) => d.date), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'], 'sem sábado e domingo');
  assert.deepEqual(days[0].slots, [], 'hoje: antecedência de 12 h');
  assert.deepEqual(days[1].slots.map((s) => s.time), ['08:00', '11:00'], 'terça: 09h e 10h se sobrepõem à consulta das 09:30');
});

test('limite de dias à frente e horário oferecido', () => {
  const far = publicSlots({ ...profile, max_days_ahead: 2 }, [], '2026-11-16', 7, now);
  assert.deepEqual(far.map((d) => d.date), ['2026-11-16', '2026-11-17', '2026-11-18']);
  assert.equal(isOfferedSlot(profile, [], '2026-11-18T11:00:00.000Z', now), true);
  assert.equal(isOfferedSlot(profile, [], '2026-11-18T11:30:00.000Z', now), false, 'fora da grade');
  assert.equal(isOfferedSlot(profile, [], '2026-11-21T11:00:00.000Z', now), false, 'sábado');
});

test('pedido: campo-isca, modalidade, consentimento', () => {
  assert.deepEqual(validateBooking({ website: 'http://spam' }, profile), { spam: true });
  const ok = validateBooking({ full_name: ' Maria  Silva ', email: 'Maria@Example.com', phone: '(31) 99999-0000', mode: 'online', consent: true, starts_at: '2026-11-18T11:00:00Z' }, profile);
  assert.deepEqual(ok.value, { full_name: 'Maria Silva', email: 'maria@example.com', phone: '+5531999990000', mode: 'online', message: null, starts_at: '2026-11-18T11:00:00.000Z' });
  const bad = validateBooking({ full_name: 'Ma', email: 'x', phone: '1', mode: 'in_person', starts_at: 'x' }, profile);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['consent', 'email', 'full_name', 'mode', 'phone', 'starts_at']);
});
