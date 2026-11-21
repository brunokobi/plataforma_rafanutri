// Testes das regras puras dos avisos (0058).
// Uso: node --test db/tests/extension-notifications.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMessage, formatWhen, isImportant, isStop, isTelegramGone, parseStart, pickChannel, plainBody, reminderWindows, telegramHtml, validateSettings } from '../../directus/extensions/rafanutri/notifications.js';

const linked = { email_opt_in: true, telegram_opt_in: true, telegram_chat_id: 99 };
const noTelegram = { email_opt_in: true, telegram_opt_in: true, telegram_chat_id: null };

test('Telegram primeiro, para tudo', () => {
  assert.deepEqual(pickChannel({ important: false, prefs: linked, email: 'a@b.com' }), { channel: 'telegram', recipient: '99' });
  assert.deepEqual(pickChannel({ important: true, prefs: linked, email: 'a@b.com' }), { channel: 'telegram', recipient: '99' });
});

test('e-mail só para o importante, sem Telegram ou com falha', () => {
  assert.equal(pickChannel({ important: false, prefs: noTelegram, email: 'a@b.com' }), null);
  assert.deepEqual(pickChannel({ important: true, prefs: noTelegram, email: 'a@b.com' }), { channel: 'email', recipient: 'a@b.com' });
  assert.deepEqual(pickChannel({ important: true, prefs: linked, email: 'a@b.com', skipTelegram: true }), { channel: 'email', recipient: 'a@b.com' });
  assert.equal(pickChannel({ important: true, prefs: { ...noTelegram, email_opt_in: false }, email: 'a@b.com' }), null);
  assert.equal(pickChannel({ important: true, prefs: noTelegram, email: null }), null);
  assert.deepEqual(pickChannel({ important: true, prefs: null, email: 'a@b.com' }), { channel: 'email', recipient: 'a@b.com' });
  assert.equal(pickChannel({ important: false, prefs: { ...linked, telegram_opt_in: false }, email: 'a@b.com' }), null);
});

test('só o primeiro lembrete é importante', () => {
  assert.equal(isImportant('appointment_reminder', { hour: 24, hours: [24, 2] }), true);
  assert.equal(isImportant('appointment_reminder', { hour: 2, hours: [24, 2] }), false);
  assert.equal(isImportant('plan_published'), false);
  assert.equal(isImportant('appointment_cancelled'), true);
});

test('janelas de lembrete', () => {
  assert.deepEqual(reminderWindows([24, 2]), [{ hour: 2, lower: 0 }, { hour: 24, lower: 2 }]);
  assert.deepEqual(reminderWindows([5, 48]), [{ hour: 48, lower: 0 }]);
  assert.deepEqual(reminderWindows([]), []);
});

test('data no fuso de São Paulo', () => {
  assert.equal(formatWhen('2026-11-25T17:30:00Z'), 'quarta, 25/11 às 14:30');
});

test('mensagens', () => {
  const ap = { starts_at: '2026-11-25T17:30:00Z', mode: 'online', meeting_url: 'https://meet.example.com/x' };
  const r = buildMessage('appointment_reminder', { patientName: 'Maria Souza', practice: 'Consultório Ana', appointment: ap, hour: 24, note: 'Traga seus exames.' });
  assert.match(r.subject, /quarta, 25\/11 às 14:30/);
  assert.equal(r.lines[0], 'Olá, Maria!');
  assert.ok(r.lines.includes('Traga seus exames.'));
  assert.ok(r.lines.some((l) => l.includes('https://meet.example.com/x')));
  assert.match(buildMessage('appointment_reminder', { patientName: 'Maria', practice: 'X', appointment: { ...ap, mode: 'in_person' }, hour: 2 }).lines[1], /começa em breve/);
  assert.match(plainBody(buildMessage('appointment_cancelled', { patientName: 'Jo', practice: 'X', appointment: ap })), /foi cancelada/);
  assert.throws(() => buildMessage('whatsapp', {}));
});

test('Telegram em HTML escapado', () => {
  const h = telegramHtml({ subject: 'A <b>', body: 'um & dois\n\ntrês', link: 'https://x.com/?a=1&b=2' });
  assert.equal(h, '<b>A &lt;b&gt;</b>\n\num &amp; dois\n\ntrês\n\n<a href="https://x.com/?a=1&amp;b=2">Abrir</a>');
});

test('configurações', () => {
  const ok = validateSettings({ reminders_enabled: true, scheduled_enabled: true, plan_enabled: false, reminder_hours: [2, 24, 24], reminder_note: '  Traga   exames ' });
  assert.deepEqual(ok.value, { reminders_enabled: true, scheduled_enabled: true, plan_enabled: false, reminder_hours: [24, 2], reminder_note: 'Traga exames' });
  assert.ok(validateSettings({ reminders_enabled: true, scheduled_enabled: true, plan_enabled: true, reminder_hours: [5] }).errors.reminder_hours);
  assert.ok(validateSettings({ reminders_enabled: true, scheduled_enabled: true, plan_enabled: true, reminder_hours: [] }).errors.reminder_hours);
  assert.ok(validateSettings({ reminders_enabled: false, scheduled_enabled: true, plan_enabled: true, reminder_hours: [] }).value);
  assert.ok(validateSettings({ reminders_enabled: 'sim', scheduled_enabled: true, plan_enabled: true, reminder_hours: [24] }).errors.reminders_enabled);
});

test('comandos do bot', () => {
  const t = 'a'.repeat(43);
  assert.equal(parseStart(`/start ${t}`), t);
  assert.equal(parseStart(`/start@RafanutriBot ${t}`), t);
  assert.equal(parseStart('/start'), null);
  assert.equal(parseStart(`/start ${t}x`), null);
  assert.equal(isStop('/parar'), true);
  assert.equal(isStop('parar'), false);
  assert.equal(isTelegramGone(403), true);
  assert.equal(isTelegramGone(400, 'Bad Request: chat not found'), true);
  assert.equal(isTelegramGone(429), false);
});
