// Motor dos avisos (0058): gera os avisos (consulta marcada/remarcada/cancelada, lembretes, plano novo),
// envia pela fila (Telegram primeiro; e-mail só para o importante) e atende o bot do Telegram.
// Roda dentro do Directus a cada minuto.
//
// Variáveis de ambiente (no .env do Directus): TELEGRAM_BOT_TOKEN (sem ela o Telegram fica desligado e
// tudo cai no e-mail importante), RAFANUTRI_SITE_URL (links), PUBLIC_URL (webhook do bot), SECRET (assina
// o link de cancelar e-mails).

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { buildMessage, isImportant, isStop, isTelegramGone, KINDS, parseStart, pickChannel, plainBody, reminderWindows, telegramHtml, validateSettings, escapeHtml } from './notifications.js';

const MAX_ATTEMPTS = 5;
const RECENT = "interval '30 minutes'";
const ACTIVE = ['scheduled', 'confirmed'];
/** Consultório com o módulo Gestão (avisos de consulta e lembretes). */
const PRACTICE_SQL = "(o.plan in ('essential', 'professional', 'clinic') or 'practice' = any(o.modules))";
const DEFAULTS = { reminders_enabled: true, reminder_hours: [24, 2], scheduled_enabled: true, plan_enabled: true, reminder_note: null };
const LINK_TTL_DAYS = 7;

const hashToken = (t) => createHash('sha256').update(t).digest('hex');

export function setupNotifications({ router, database, logger, services, getSchema, h }) {
  const { requireUser, bad, conflict, isUuid, clinicalOrg, memberOrg, clinicalPatient, myPatientRecord } = h;
  const BOT = process.env.TELEGRAM_BOT_TOKEN || '';
  const SITE = (process.env.RAFANUTRI_SITE_URL || 'https://rafanutri.brunokobi.tech').replace(/\/$/, '');
  const API = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const SECRET = process.env.SECRET || '';
  const WEBHOOK_SECRET = BOT ? createHash('sha256').update(`rafanutri-webhook:${BOT}`).digest('hex') : '';
  let botUsername = null;

  const notFound = (res, what = 'Paciente não encontrado.') => res.status(404).json({ errors: [{ message: what, extensions: { code: 'NOT_FOUND' } }] });
  const unavailableTelegram = (res) => res.status(503).json({ errors: [{ message: 'O Telegram ainda não está ligado na plataforma.', extensions: { code: 'TELEGRAM_OFF' } }] });

  // ── Telegram ────────────────────────────────────────────────────────────────────────────
  async function tg(method, payload) {
    const r = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: Boolean(j.ok), status: r.status, description: String(j.description ?? '').slice(0, 300), result: j.result };
  }

  async function startTelegram() {
    if (!BOT) return;
    try {
      const me = await tg('getMe', {});
      if (!me.ok) return logger.warn(`rafanutri: Telegram recusou o token (${me.status})`);
      botUsername = me.result?.username ?? null;
      if (API) {
        const w = await tg('setWebhook', { url: `${API}/rafanutri/public/telegram/webhook`, secret_token: WEBHOOK_SECRET, allowed_updates: ['message'], drop_pending_updates: false });
        if (!w.ok) logger.warn(`rafanutri: falha ao registrar o webhook do Telegram (${w.status} ${w.description})`);
        await tg('setMyCommands', { commands: [{ command: 'parar', description: 'Parar de receber os avisos aqui' }] });
      }
      logger.info(`rafanutri: Telegram ligado (@${botUsername})`);
    } catch (error) {
      logger.warn({ err: error?.message }, 'rafanutri: falha ao iniciar o Telegram');
    }
  }

  const telegramReady = () => Boolean(BOT && botUsername);

  /** Cria (ou troca) o link de ativação do Telegram do paciente. Vale 7 dias, uso único. */
  async function telegramLink(patient) {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + LINK_TTL_DAYS * 864e5);
    await database('patient_contact_prefs')
      .insert({ patient_id: patient.id, organization_id: patient.organization_id, telegram_link_hash: hashToken(token), telegram_link_expires_at: expires })
      .onConflict('patient_id').merge({ telegram_link_hash: hashToken(token), telegram_link_expires_at: expires });
    return { url: `https://t.me/${botUsername}?start=${token}`, expires_at: expires.toISOString() };
  }

  async function unlinkTelegram(where, table = 'patient_contact_prefs') {
    await database.transaction(async (trx) => {
      await trx.raw("select set_config('rafanutri.telegram_link', 'on', true)");
      await trx(table).where(where).update({ telegram_chat_id: null, telegram_name: null, telegram_linked_at: null });
    });
  }

  /** Link de ativação do Telegram de uma pessoa (owner, admin). */
  async function userTelegramLink(userId) {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + LINK_TTL_DAYS * 864e5);
    await database('user_contact_prefs').insert({ user_id: userId, telegram_link_hash: hashToken(token), telegram_link_expires_at: expires })
      .onConflict('user_id').merge({ telegram_link_hash: hashToken(token), telegram_link_expires_at: expires });
    return { url: `https://t.me/${botUsername}?start=${token}`, expires_at: expires.toISOString() };
  }

  router.post('/public/telegram/webhook', async (req, res) => {
    const got = String(req.headers['x-telegram-bot-api-secret-token'] ?? '');
    if (!WEBHOOK_SECRET || got.length !== WEBHOOK_SECRET.length || !timingSafeEqual(Buffer.from(got), Buffer.from(WEBHOOK_SECRET))) return res.status(401).end();
    res.json({ ok: true });   // responde já; o Telegram reenvia se demorar
    const msg = req.body?.message;
    const chatId = msg?.chat?.id;
    if (!chatId || msg?.chat?.type !== 'private') return;
    const reply = (text) => tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' }).catch(() => {});
    try {
      const text = String(msg.text ?? '');
      const token = parseStart(text);
      if (token) {
        const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ').slice(0, 120) || null;
        const linked = await database.transaction(async (trx) => {
          await trx.raw("select set_config('rafanutri.telegram_link', 'on', true)");
          const [row] = await trx('patient_contact_prefs')
            .where('telegram_link_hash', hashToken(token)).where('telegram_link_expires_at', '>', trx.fn.now())
            .update({ telegram_chat_id: chatId, telegram_name: name, telegram_linked_at: trx.fn.now(), telegram_opt_in: true, telegram_link_hash: null, telegram_link_expires_at: null })
            .returning('organization_id');
          if (row) return trx('organizations').where('id', row.organization_id).first('name');
          // link de pessoa (nutricionista, admin): avisos da conta e da cobrança
          const [u] = await trx('user_contact_prefs')
            .where('telegram_link_hash', hashToken(token)).where('telegram_link_expires_at', '>', trx.fn.now())
            .update({ telegram_chat_id: chatId, telegram_name: name, telegram_linked_at: trx.fn.now(), telegram_opt_in: true, telegram_link_hash: null, telegram_link_expires_at: null })
            .returning('user_id');
          return u ? { account: true } : null;
        });
        if (linked?.account) return reply('Pronto! Os avisos da sua conta Rafanutri (faturas, pagamentos e assinatura) chegam aqui a partir de agora.\n\nPara parar, envie /parar.');
        if (linked) return reply(`Pronto! Os avisos de <b>${escape(linked.name)}</b> (consultas, lembretes e plano novo) chegam aqui a partir de agora.\n\nPara parar, envie /parar.`);
        return reply('Este link de ativação expirou ou já foi usado. Peça um novo ao seu nutricionista ou gere outro na área do paciente.');
      }
      if (isStop(text)) {
        const n = await database('patient_contact_prefs').where('telegram_chat_id', chatId).update({ telegram_opt_in: false })
          + await database('user_contact_prefs').where('telegram_chat_id', chatId).update({ telegram_opt_in: false });
        return reply(n ? 'Certo, você não vai mais receber avisos aqui. Para voltar, ative de novo na área do paciente.' : 'Este chat não está ligado a nenhum consultório.');
      }
      if (/^\/start/.test(text)) return reply('Olá! Este é o canal de avisos da Rafanutri. Para receber os avisos do seu consultório, abra o link enviado pelo seu nutricionista ou gere um na área do paciente.');
      return reply('Este canal só envia avisos (consultas, lembretes e plano novo). Para falar com seu nutricionista, use os contatos do consultório.');
    } catch (error) {
      logger.error({ err: error?.message }, 'rafanutri: falha no webhook do Telegram');
    }
  });
  // Mesmo escape do resto dos avisos (inclui aspas)
  const escape = escapeHtml;

  // ── Cancelar e-mails (link no rodapé) ─────────────────────────────────────────────────────
  const unsubSig = (patientId) => createHmac('sha256', `${SECRET}:unsubscribe`).update(patientId).digest('base64url').slice(0, 32);
  const unsubToken = (patientId) => `${patientId}.${unsubSig(patientId)}`;
  function readUnsub(t) {
    const [id, sig] = String(t ?? '').split('.');
    if (!SECRET || !isUuid(id) || typeof sig !== 'string' || sig.length !== 32) return null;
    const want = unsubSig(id);
    return timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? id : null;
  }
  router.post('/public/notifications/unsubscribe', async (req, res) => {
    const id = readUnsub(req.body?.t);
    if (!id) return notFound(res, 'Link inválido.');
    const p = await database('patients as p').join('organizations as o', 'o.id', 'p.organization_id').where('p.id', id).first('p.id', 'p.organization_id', 'o.name');
    if (!p) return notFound(res, 'Link inválido.');
    await database('patient_contact_prefs').insert({ patient_id: p.id, organization_id: p.organization_id, email_opt_in: false })
      .onConflict('patient_id').merge({ email_opt_in: false });
    res.json({ data: { practice: p.name } });
  });

  // ── Fila ─────────────────────────────────────────────────────────────────────────────────
  async function settingsOf(orgId) {
    const row = await database('notification_settings').where('organization_id', orgId).first();
    return row ? { ...DEFAULTS, ...row, reminder_hours: (row.reminder_hours ?? []).map(Number) } : { ...DEFAULTS };
  }

  /**
   * Põe um aviso na fila, já com o canal escolhido. Sem canal possível (sem Telegram e aviso não
   * importante, ou e-mail cancelado), não grava nada. A dedupe_key impede repetir o mesmo aviso.
   */
  async function enqueue({ orgId, patientId = null, appointmentId = null, kind, important, dedupe, ctx, email = undefined, skipTelegram = false }) {
    const patient = patientId ? await database('patients').where({ id: patientId, organization_id: orgId }).first('id', 'full_name', 'email', 'status', 'app_user_id') : null;
    if (patientId && (!patient || patient.status !== 'active')) return null;
    const prefs = patient ? await database('patient_contact_prefs').where('patient_id', patient.id).first() : null;
    const to = pickChannel({ important, prefs, email: email !== undefined ? email : patient?.email, skipTelegram });
    if (!to) return null;
    const org = await database('organizations').where('id', orgId).first('name');
    const msg = buildMessage(kind, { patientName: patient?.full_name ?? ctx?.patientName, practice: org?.name, ...ctx });
    const [row] = await database('notification_outbox').insert({
      organization_id: orgId, patient_id: patient?.id ?? null, appointment_id: appointmentId, kind, channel: to.channel, recipient: to.recipient,
      subject: msg.subject.slice(0, 200), body: plainBody(msg).slice(0, 4000), link: msg.link, dedupe_key: dedupe,
    }).onConflict('dedupe_key').ignore().returning('id');
    return row?.id ?? null;
  }

  const patientLink = (p) => (p?.app_user_id ? `${SITE}/p` : null);

  /** Aviso para uma pessoa (owner, admin): Telegram ligado ou o e-mail da conta. Sempre importante. */
  async function enqueueUser({ orgId, userId, kind, dedupe, ctx, email = undefined }) {
    const u = await database('directus_users').where('id', userId).first('id', 'email', 'first_name', 'status');
    if (!u || (u.status && u.status !== 'active')) return null;
    const prefs = await database('user_contact_prefs').where('user_id', userId).first();
    const to = pickChannel({ important: true, prefs: prefs ? { ...prefs, email_opt_in: true } : null, email: email !== undefined ? email : u.email });
    if (!to) return null;
    const org = orgId ? await database('organizations').where('id', orgId).first('name') : null;
    const msg = buildMessage(kind, { patientName: u.first_name || 'Olá', practice: org?.name, ...ctx });
    const [row] = await database('notification_outbox').insert({
      organization_id: orgId, user_id: userId, kind, channel: to.channel, recipient: to.recipient,
      subject: msg.subject.slice(0, 200), body: plainBody(msg).slice(0, 4000), link: msg.link, dedupe_key: dedupe ? `${dedupe}:u:${userId}`.slice(0, 200) : null,
    }).onConflict('dedupe_key').ignore().returning('id');
    return row?.id ?? null;
  }

  /** Avisa os owners do consultório. */
  async function notifyOwners({ orgId, kind, dedupe, ctx }) {
    const owners = await database('organization_members').where({ organization_id: orgId, role: 'owner' }).pluck('user_id');
    let n = 0;
    for (const id of owners) if (await enqueueUser({ orgId, userId: id, kind, dedupe, ctx })) n += 1;
    return n;
  }

  /** Avisa os admins da plataforma (platform_admins e administradores do Directus) e o e-mail de cobrança. */
  async function notifyAdmins({ orgId, kind, dedupe, ctx, extraEmail = null }) {
    const admins = await database('directus_users').where('status', 'active').whereRaw('is_platform_admin(id)').pluck('id');
    for (const id of admins) await enqueueUser({ orgId, userId: id, kind, dedupe, ctx });
    if (extraEmail) {
      const msg = buildMessage(kind, { practice: (await database('organizations').where('id', orgId).first('name'))?.name, ...ctx });
      await database('notification_outbox').insert({
        organization_id: orgId, kind, channel: 'email', recipient: extraEmail, subject: msg.subject.slice(0, 200), body: plainBody(msg).slice(0, 4000), link: msg.link,
        dedupe_key: dedupe ? `${dedupe}:billing-email`.slice(0, 200) : null,
      }).onConflict('dedupe_key').ignore();
    }
  }

  const extraCycles = [];

  /** Consulta marcada, remarcada e cancelada (mudanças dos últimos 30 minutos). */
  async function scanAppointments() {
    // Avisos de consulta e lembretes são do módulo Gestão (fora do plano Gratuito)
    const rows = await database('appointments as a').join('patients as p', 'p.id', 'a.patient_id')
      .join('organizations as o', 'o.id', 'a.organization_id').whereRaw(PRACTICE_SQL)
      .leftJoin('notification_settings as s', 's.organization_id', 'a.organization_id')
      .whereRaw(`coalesce(a.date_updated, a.date_created) > now() - ${RECENT}`)
      .where('a.starts_at', '>', database.fn.now()).where('p.status', 'active')
      .whereRaw('coalesce(s.scheduled_enabled, true)')
      .select('a.id', 'a.organization_id', 'a.patient_id', 'a.starts_at', 'a.status', 'a.mode', 'a.meeting_url', 'p.app_user_id');
    for (const a of rows) {
      const told = await database('notification_outbox').where('appointment_id', a.id).whereIn('kind', ['appointment_scheduled', 'appointment_changed']).whereNot('status', 'skipped').first('id');
      const ctx = { appointment: a, link: patientLink(a) };
      if (ACTIVE.includes(a.status)) {
        const kind = told ? 'appointment_changed' : 'appointment_scheduled';
        await enqueue({ orgId: a.organization_id, patientId: a.patient_id, appointmentId: a.id, kind, important: true, dedupe: `appt-at:${a.id}:${new Date(a.starts_at).getTime()}`, ctx });
      } else if (a.status === 'cancelled' && told) {
        await enqueue({ orgId: a.organization_id, patientId: a.patient_id, appointmentId: a.id, kind: 'appointment_cancelled', important: true, dedupe: `appt-cancel:${a.id}`, ctx });
      }
    }
  }

  /** Lembretes: cada horário configurado tem a sua janela (ver reminderWindows). */
  async function scanReminders() {
    const orgs = await database('appointments as a').leftJoin('notification_settings as s', 's.organization_id', 'a.organization_id')
      .join('organizations as o', 'o.id', 'a.organization_id').whereRaw(PRACTICE_SQL)
      .whereIn('a.status', ACTIVE).where('a.starts_at', '>', database.fn.now()).whereRaw("a.starts_at <= now() + interval '72 hours'")
      .whereRaw('coalesce(s.reminders_enabled, true)').distinct('a.organization_id');
    for (const { organization_id: orgId } of orgs) {
      const s = await settingsOf(orgId);
      for (const w of reminderWindows(s.reminder_hours)) {
        const rows = await database('appointments as a').join('patients as p', 'p.id', 'a.patient_id')
          .where('a.organization_id', orgId).whereIn('a.status', ACTIVE).where('p.status', 'active')
          .whereRaw('a.starts_at > now() + make_interval(hours => ?)', [w.lower])
          .whereRaw('a.starts_at <= now() + make_interval(hours => ?)', [w.hour])
          // marcada dentro da janela: o aviso de "consulta marcada" já cobre este lembrete
          .whereRaw('a.date_created <= a.starts_at - make_interval(hours => ?)', [w.hour])
          .select('a.id', 'a.patient_id', 'a.starts_at', 'a.mode', 'a.meeting_url', 'p.app_user_id');
        for (const a of rows) {
          await enqueue({ orgId, patientId: a.patient_id, appointmentId: a.id, kind: 'appointment_reminder', important: isImportant('appointment_reminder', { hour: w.hour, hours: s.reminder_hours }),
            dedupe: `rem:${a.id}:${w.hour}:${new Date(a.starts_at).getTime()}`, ctx: { appointment: a, hour: w.hour, note: s.reminder_note, link: patientLink(a) } });
        }
      }
    }
  }

  /** Plano publicado nos últimos 30 minutos, para quem tem acesso à área do paciente. */
  async function scanPlans() {
    const rows = await database('meal_plans as m').join('patients as p', 'p.id', 'm.patient_id')
      .leftJoin('notification_settings as s', 's.organization_id', 'm.organization_id')
      .where('m.status', 'published').whereRaw(`m.published_at > now() - ${RECENT}`).whereNotNull('p.app_user_id').where('p.status', 'active')
      .whereRaw('coalesce(s.plan_enabled, true)')
      .select('m.id', 'm.organization_id', 'm.patient_id', 'm.published_at');
    for (const m of rows) {
      await enqueue({ orgId: m.organization_id, patientId: m.patient_id, kind: 'plan_published', important: false, dedupe: `plan:${m.id}:${new Date(m.published_at).getTime()}`, ctx: { link: `${SITE}/p/plano` } });
    }
  }

  const LINK_LABEL = { feeding_reaction: 'Abrir a ficha', patient_invite: 'Criar meu acesso', invoice_created: 'Pagar com Pix', invoice_due: 'Pagar com Pix', payment_reported: 'Conferir e confirmar', payment_confirmed: 'Ver meu plano', subscription_ended: 'Ver planos', test: 'Abrir a Rafanutri' };
  async function sendEmail(row) {
    const { MailService } = services;
    const mail = new MailService({ schema: await getSchema(), knex: database });
    const unsubscribe = row.patient_id && row.kind !== 'patient_invite' ? `${SITE}/avisos/cancelar?t=${encodeURIComponent(unsubToken(row.patient_id))}` : null;
    await mail.send({
      to: row.recipient,
      subject: row.subject,
      template: { name: 'notification', data: { subject: row.subject, paragraphs: row.body.split('\n\n'), link: row.link, linkLabel: LINK_LABEL[row.kind] ?? (row.user_id ? 'Abrir a Rafanutri' : 'Abrir a área do paciente'), unsubscribe } },
    });
  }

  /** Antes de enviar um aviso de consulta, confere se ele ainda vale (não foi cancelada nem remarcada). */
  async function stillValid(row) {
    if (!row.appointment_id || !['appointment_reminder', 'appointment_scheduled', 'appointment_changed'].includes(row.kind)) return true;
    const a = await database('appointments').where('id', row.appointment_id).first('status', 'starts_at');
    if (!a || !ACTIVE.includes(a.status) || new Date(a.starts_at) <= new Date()) return false;
    const at = /:(\d{10,})(?::email)?$/.exec(row.dedupe_key ?? '');
    return !at || Number(at[1]) === new Date(a.starts_at).getTime();
  }

  /** Reserva por e-mail quando o Telegram falha de vez: só para aviso importante (o primeiro lembrete conta). */
  async function fallbackToEmail(row) {
    if (row.user_id) {
      const u = await database('directus_users').where('id', row.user_id).first('email');
      if (!u?.email) return;
      await database('notification_outbox').insert({
        organization_id: row.organization_id, user_id: row.user_id, kind: row.kind, channel: 'email', recipient: u.email,
        subject: row.subject, body: row.body, link: row.link, dedupe_key: row.dedupe_key ? `${row.dedupe_key}:email`.slice(0, 200) : null,
      }).onConflict('dedupe_key').ignore();
      return;
    }
    if (!row.patient_id) return;
    let important = isImportant(row.kind);
    if (row.kind === 'appointment_reminder') {
      const s = await settingsOf(row.organization_id);
      const hour = Number(/^rem:[^:]+:(\d+):/.exec(row.dedupe_key ?? '')?.[1]);
      important = isImportant('appointment_reminder', { hour, hours: s.reminder_hours });
    }
    if (!important) return;
    const p = await database('patients').where('id', row.patient_id).first('email');
    const prefs = await database('patient_contact_prefs').where('patient_id', row.patient_id).first('email_opt_in');
    const to = pickChannel({ important: true, prefs, email: p?.email, skipTelegram: true });
    if (!to) return;
    await database('notification_outbox').insert({
      organization_id: row.organization_id, patient_id: row.patient_id, appointment_id: row.appointment_id, kind: row.kind, channel: 'email', recipient: to.recipient,
      subject: row.subject, body: row.body, link: row.link, dedupe_key: row.dedupe_key ? `${row.dedupe_key}:email`.slice(0, 200) : null,
    }).onConflict('dedupe_key').ignore();
  }

  async function deliver() {
    const claimed = await database.raw(`
      update notification_outbox set attempts = attempts + 1, scheduled_at = now() + make_interval(mins => power(2, attempts)::int * 5)
      where id in (select id from notification_outbox where status = 'queued' and scheduled_at <= now() order by scheduled_at limit 30 for update skip locked)
      returning *`);
    for (const row of claimed.rows) {
      const done = (patch) => database('notification_outbox').where('id', row.id).update(patch);
      try {
        if (!(await stillValid(row))) { await done({ status: 'skipped', last_error: 'A consulta mudou ou foi cancelada antes do envio.' }); continue; }
        if (row.channel === 'telegram') {
          if (!BOT) { await done({ status: 'failed', last_error: 'Telegram desligado na plataforma.' }); await fallbackToEmail(row); continue; }
          const r = await tg('sendMessage', { chat_id: row.recipient, text: telegramHtml(row), parse_mode: 'HTML', disable_web_page_preview: true });
          if (r.ok) { await done({ status: 'sent', sent_at: database.fn.now(), last_error: null }); continue; }
          if (isTelegramGone(r.status, r.description)) {
            await unlinkTelegram({ telegram_chat_id: row.recipient });
            await unlinkTelegram({ telegram_chat_id: row.recipient }, 'user_contact_prefs');
            await done({ status: 'failed', last_error: 'O destinatário bloqueou o bot ou saiu do Telegram.' });
            await fallbackToEmail(row);
            continue;
          }
          throw new Error(`Telegram ${r.status}: ${r.description}`);
        }
        await sendEmail(row);
        await done({ status: 'sent', sent_at: database.fn.now(), last_error: null });
      } catch (error) {
        const last = String(error?.message ?? error).slice(0, 500);
        if (row.attempts >= MAX_ATTEMPTS) {
          await done({ status: 'failed', last_error: last });
          if (row.channel === 'telegram') await fallbackToEmail(row);
        } else await done({ last_error: last });
      }
    }
  }

  // Um ciclo por vez neste processo. Com mais de uma instância, a fila já é segura: o envio reserva as
  // linhas com "for update skip locked" e a geração não repete por causa da dedupe_key.
  let lastCleanup = 0;
  async function cycle() {
    try {
      await scanAppointments();
      await scanReminders();
      await scanPlans();
      for (const fn of extraCycles) await fn().catch((error) => logger.error({ err: error?.message }, 'rafanutri: falha num ciclo extra'));
      await deliver();
      if (Date.now() - lastCleanup > 3600e3) {
        lastCleanup = Date.now();
        await database('notification_outbox').whereNot('status', 'queued').whereRaw("date_created < now() - interval '180 days'").del();
        await database('patient_contact_prefs').whereNotNull('telegram_link_hash').where('telegram_link_expires_at', '<', database.fn.now()).update({ telegram_link_hash: null, telegram_link_expires_at: null });
      }
    } catch (error) {
      logger.error({ err: error?.message }, 'rafanutri: falha no ciclo de avisos');
    }
  }

  let running = false;
  const tick = () => { if (running) return; running = true; cycle().finally(() => { running = false; }); };
  setTimeout(() => { startTelegram(); tick(); }, 15000).unref?.();
  setInterval(tick, 60000).unref?.();

  // ── Consultório ──────────────────────────────────────────────────────────────────────────
  const prefsOut = (prefs, email) => ({
    email: email ?? null,
    email_opt_in: prefs?.email_opt_in ?? true,
    telegram_opt_in: prefs?.telegram_opt_in ?? true,
    telegram_linked: prefs?.telegram_chat_id != null,
    telegram_name: prefs?.telegram_name ?? null,
    telegram_linked_at: prefs?.telegram_linked_at ?? null,
    telegram_ready: telegramReady(),
  });
  const LOG_FIELDS = ['n.id', 'n.kind', 'n.channel', 'n.subject', 'n.status', 'n.attempts', 'n.last_error', 'n.date_created', 'n.sent_at', 'n.patient_id', 'p.full_name as patient_name'];

  router.get('/notifications/settings', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const m = await memberOrg(user);
    if (!m) return notFound(res, 'Você não tem consultório.');
    const s = await settingsOf(m.id);
    const counts = await database('notification_outbox').where('organization_id', m.id).whereRaw("date_created > now() - interval '30 days'")
      .select('channel', 'status').count({ n: '*' }).groupBy('channel', 'status');
    const linked = await database('patient_contact_prefs as c').join('patients as p', 'p.id', 'c.patient_id')
      .where('c.organization_id', m.id).where('p.status', 'active').whereNotNull('c.telegram_chat_id').where('c.telegram_opt_in', true).count({ n: '*' }).first();
    res.json({ data: {
      settings: { reminders_enabled: s.reminders_enabled, reminder_hours: s.reminder_hours, scheduled_enabled: s.scheduled_enabled, plan_enabled: s.plan_enabled, reminder_note: s.reminder_note },
      can_edit: ['owner', 'nutritionist'].includes(m.role), telegram_ready: telegramReady(), telegram_bot: botUsername,
      stats: { telegram_patients: Number(linked?.n ?? 0), last30: counts.map((c) => ({ channel: c.channel, status: c.status, n: Number(c.n) })) },
    } });
  });

  router.put('/notifications/settings', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const org = await clinicalOrg(user);
    if (!org) return res.status(403).json({ errors: [{ message: 'Só owner ou nutricionista muda os avisos.', extensions: { code: 'FORBIDDEN' } }] });
    const v = validateSettings(req.body);
    if (v.errors) return bad(res, v.errors);
    await database('notification_settings').insert({ organization_id: org, ...v.value, updated_by: user, updated_at: database.fn.now() })
      .onConflict('organization_id').merge({ ...v.value, updated_by: user, updated_at: database.fn.now() });
    res.json({ data: v.value });
  });

  router.get('/notifications/log', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const org = await clinicalOrg(user);
    if (!org) return notFound(res, 'Você não tem consultório.');
    const rows = await database('notification_outbox as n').leftJoin('patients as p', 'p.id', 'n.patient_id')
      .where('n.organization_id', org).orderBy('n.date_created', 'desc').limit(100).select(LOG_FIELDS);
    res.json({ data: rows });
  });

  // Teste: e-mail para quem pediu (um por 10 minutos).
  router.post('/notifications/test', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const org = await clinicalOrg(user);
    if (!org) return notFound(res, 'Você não tem consultório.');
    const u = await database('directus_users').where('id', user).first('email', 'first_name');
    const id = await enqueue({ orgId: org, kind: 'test', important: true, email: u?.email, dedupe: `test:${user}:${Math.floor(Date.now() / 600e3)}`, ctx: { patientName: u?.first_name || 'Olá', link: `${SITE}/app` } });
    if (!id) return conflict(res, 'Você já pediu um teste há pouco. Aguarde alguns minutos.');
    tick();
    res.status(201).json({ data: { email: u.email } });
  });

  // ── Paciente, pelo consultório ───────────────────────────────────────────────────────────
  router.get('/patients/:id/notifications', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const p = await clinicalPatient(user, req.params.id);
    if (!p) return notFound(res);
    const prefs = await database('patient_contact_prefs').where('patient_id', p.id).first();
    const recent = await database('notification_outbox as n').leftJoin('patients as p', 'p.id', 'n.patient_id')
      .where('n.patient_id', p.id).orderBy('n.date_created', 'desc').limit(10).select(LOG_FIELDS);
    res.json({ data: { ...prefsOut(prefs, p.email), recent } });
  });

  async function savePrefs(p, body) {
    const patch = {};
    if (typeof body?.email_opt_in === 'boolean') patch.email_opt_in = body.email_opt_in;
    if (typeof body?.telegram_opt_in === 'boolean') patch.telegram_opt_in = body.telegram_opt_in;
    if (!Object.keys(patch).length) return false;
    await database('patient_contact_prefs').insert({ patient_id: p.id, organization_id: p.organization_id, ...patch }).onConflict('patient_id').merge(patch);
    return true;
  }

  router.put('/patients/:id/notifications', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const p = await clinicalPatient(user, req.params.id);
    if (!p) return notFound(res);
    if (!(await savePrefs(p, req.body))) return bad(res, { email_opt_in: 'Nada para salvar.' });
    res.json({ data: prefsOut(await database('patient_contact_prefs').where('patient_id', p.id).first(), p.email) });
  });

  router.post('/patients/:id/notifications/telegram-link', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const p = await clinicalPatient(user, req.params.id);
    if (!p) return notFound(res);
    if (!telegramReady()) return unavailableTelegram(res);
    if (p.status !== 'active') return conflict(res, 'Reative o paciente antes.');
    res.status(201).json({ data: await telegramLink(p) });
  });

  router.post('/patients/:id/notifications/telegram-unlink', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const p = await clinicalPatient(user, req.params.id);
    if (!p) return notFound(res);
    await unlinkTelegram({ patient_id: p.id });
    res.json({ data: { ok: true } });
  });

  // ── Paciente, na própria área ─────────────────────────────────────────────────────────────
  async function myRecord(req, res) {
    const user = requireUser(req, res);
    if (!user) return null;
    const rec = await myPatientRecord(user, isUuid(req.query.c) ? req.query.c : null);
    if (!rec) { notFound(res); return null; }
    return database('patients').where('id', rec.id).first('id', 'organization_id', 'email', 'status');
  }

  router.get('/me/patient/notifications', async (req, res) => {
    const p = await myRecord(req, res);
    if (!p) return;
    res.json({ data: prefsOut(await database('patient_contact_prefs').where('patient_id', p.id).first(), p.email) });
  });

  router.put('/me/patient/notifications', async (req, res) => {
    const p = await myRecord(req, res);
    if (!p) return;
    if (!(await savePrefs(p, req.body))) return bad(res, { email_opt_in: 'Nada para salvar.' });
    res.json({ data: prefsOut(await database('patient_contact_prefs').where('patient_id', p.id).first(), p.email) });
  });

  router.post('/me/patient/notifications/telegram-link', async (req, res) => {
    const p = await myRecord(req, res);
    if (!p) return;
    if (!telegramReady()) return unavailableTelegram(res);
    res.status(201).json({ data: await telegramLink(p) });
  });

  router.post('/me/patient/notifications/telegram-unlink', async (req, res) => {
    const p = await myRecord(req, res);
    if (!p) return;
    await unlinkTelegram({ patient_id: p.id });
    res.json({ data: { ok: true } });
  });

  // ── Pessoa logada (nutricionista, admin): Telegram para os avisos da conta ────────────────
  const userPrefsOut = (p) => ({ telegram_linked: p?.telegram_chat_id != null, telegram_opt_in: p?.telegram_opt_in ?? true, telegram_name: p?.telegram_name ?? null, telegram_linked_at: p?.telegram_linked_at ?? null, telegram_ready: telegramReady() });
  router.get('/me/notifications', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const u = await database('directus_users').where('id', user).first('email');
    res.json({ data: { ...userPrefsOut(await database('user_contact_prefs').where('user_id', user).first()), email: u?.email ?? null } });
  });
  router.post('/me/notifications/telegram-link', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    if (!telegramReady()) return unavailableTelegram(res);
    res.status(201).json({ data: await userTelegramLink(user) });
  });
  router.post('/me/notifications/telegram-unlink', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    await unlinkTelegram({ user_id: user }, 'user_contact_prefs');
    res.json({ data: { ok: true } });
  });

  return {
    enqueueUser, notifyOwners, notifyAdmins, tick, site: SITE,
    addCycle: (fn) => extraCycles.push(fn),
    /** Convite da área do paciente pelo canal do paciente (Telegram ligado ou e-mail do convite). */
    async sendInvite({ orgId, patientId, email, link, inviteId }) {
      const id = await enqueue({ orgId, patientId, kind: 'patient_invite', important: true, email, dedupe: `invite:${inviteId}`, ctx: { link } });
      if (id) tick();
      return Boolean(id);
    },
    kinds: KINDS,
  };
}
