// Mensagens entre paciente e nutricionista (0071): conversa por paciente, como um chat.
// O app consulta as novas a cada poucos segundos (?after=); abrir a conversa marca como lidas as do outro lado.
// Mensagem sem leitura há 5 minutos vira aviso pelo Telegram ou e-mail (sem o texto, só "mensagem nova").

export const MAX_BODY = 4000;
export const PAGE = 50;
/** Limite de envio por pessoa: 30 mensagens por minuto. */
export const RATE_PER_MIN = 30;
/** Minutos sem leitura até avisar fora do app. */
export const NOTIFY_AFTER_MIN = 5;

/** Texto da mensagem: tira espaços nas pontas e linhas em branco demais. null = inválida. */
export function cleanBody(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\n{4,}/g, '\n\n\n').trim();
  return s.length >= 1 && s.length <= MAX_BODY ? s : null;
}

/** Data de cursor (?after= / ?before=) em ISO; null se ausente ou inválida. */
export function cursor(raw) {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Janela de 3 horas para não repetir o aviso da mesma conversa. */
export const notifyBucket = (date) => Math.floor(new Date(date).getTime() / (3 * 3600e3));

const out = (m) => ({ id: m.id, sender: m.sender, body: m.body, created_at: m.created_at, read_at: m.read_at });
const fullName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || null;

export function setupMessages({ router, database, logger, notifier, h }) {
  const { requireUser, bad, conflict, isUuid, clinicalOrg, myPatientRecord } = h;
  const SITE = notifier?.site ?? (process.env.RAFANUTRI_SITE_URL || 'https://rafanutri.brunokobi.tech').replace(/\/$/, '');
  const notFound = (res) => res.status(404).json({ errors: [{ message: 'Conversa não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
  const failed = (res, error, what) => {
    logger.error({ err: error?.message }, `rafanutri: falha em ${what}`);
    res.status(500).json({ errors: [{ message: 'Não foi possível carregar as mensagens agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
  };

  /** Página da conversa. after: só as novas (poll); before: as anteriores (rolar para cima); nada: as últimas. */
  async function page(patientId, q) {
    const after = cursor(q.after);
    const before = cursor(q.before);
    let query = database('patient_messages').where('patient_id', patientId);
    if (after) query = query.where('created_at', '>', after).orderBy('created_at', 'asc').limit(200);
    else {
      if (before) query = query.where('created_at', '<', before);
      query = query.orderBy('created_at', 'desc').limit(PAGE + 1);
    }
    let rows = await query.select('id', 'sender', 'body', 'created_at', 'read_at');
    let hasMore = false;
    if (!after) {
      hasMore = rows.length > PAGE;
      rows = rows.slice(0, PAGE).reverse();
    }
    return { rows, hasMore };
  }

  /** Última mensagem minha já lida pelo outro lado (para os dois tiques azuis). */
  async function peerReadAt(patientId, mine) {
    const r = await database('patient_messages').where({ patient_id: patientId, sender: mine }).whereNotNull('read_at').max({ at: 'created_at' }).first();
    return r?.at ?? null;
  }

  async function markRead(patientId, fromSender) {
    await database('patient_messages').where({ patient_id: patientId, sender: fromSender }).whereNull('read_at').update({ read_at: database.fn.now() });
  }

  async function tooFast(authorId) {
    const r = await database('patient_messages').where('author_id', authorId).where('created_at', '>', database.raw("now() - interval '1 minute'")).count({ n: '*' }).first();
    return Number(r?.n ?? 0) >= RATE_PER_MIN;
  }
  const slowDown = (res) => res.status(429).json({ errors: [{ message: 'Muitas mensagens em pouco tempo. Espere um pouco e tente de novo.', extensions: { code: 'TOO_MANY' } }] });

  async function insert(row) {
    const [m] = await database('patient_messages').insert(row).returning(['id', 'sender', 'body', 'created_at', 'read_at']);
    return out(m);
  }

  // ── Paciente ────────────────────────────────────────────────────────────────────────────
  async function myConversation(req, res) {
    const user = requireUser(req, res);
    if (!user) return null;
    const c = isUuid(req.query?.c) ? req.query.c : isUuid(req.body?.c) ? req.body.c : null;
    const p = await myPatientRecord(user, c);
    if (!p) { notFound(res); return null; }
    return { user, p };
  }

  async function practiceInfo(p) {
    const row = await database('patients as pt').join('organizations as o', 'o.id', 'pt.organization_id')
      .leftJoin('directus_users as u', 'u.id', 'pt.responsible_user_id')
      .where('pt.id', p.id).first('o.name', 'o.patient_messages', 'u.first_name', 'u.last_name');
    return { enabled: row?.patient_messages !== false, practice: row?.name ?? null, professional: fullName(row) };
  }

  router.get('/me/patient/messages', async (req, res) => {
    try {
      const ctx = await myConversation(req, res);
      if (!ctx) return;
      const { rows, hasMore } = await page(ctx.p.id, req.query);
      await markRead(ctx.p.id, 'professional');
      const info = await practiceInfo(ctx.p);
      res.json({ data: { ...info, patient_id: ctx.p.id, messages: rows.map(out), has_more: hasMore, peer_read_at: await peerReadAt(ctx.p.id, 'patient') } });
    } catch (error) {
      failed(res, error, 'GET /me/patient/messages');
    }
  });

  router.get('/me/patient/messages/unread', async (req, res) => {
    try {
      const user = requireUser(req, res);
      if (!user) return;
      const r = await database('patient_messages as m').join('patients as p', 'p.id', 'm.patient_id')
        .where('p.app_user_id', user).where('p.status', 'active').where('m.sender', 'professional').whereNull('m.read_at')
        .count({ n: '*' }).first();
      res.json({ data: { count: Number(r?.n ?? 0) } });
    } catch (error) {
      failed(res, error, 'GET /me/patient/messages/unread');
    }
  });

  router.post('/me/patient/messages', async (req, res) => {
    try {
      const ctx = await myConversation(req, res);
      if (!ctx) return;
      const body = cleanBody(req.body?.body);
      if (!body) return bad(res, { body: `Escreva uma mensagem de até ${MAX_BODY} caracteres.` });
      const info = await practiceInfo(ctx.p);
      if (!info.enabled) return conflict(res, 'O consultório não está recebendo mensagens pelo app. Fale com ele pelos contatos de sempre.');
      if (await tooFast(ctx.user)) return slowDown(res);
      const m = await insert({ organization_id: ctx.p.organization_id, patient_id: ctx.p.id, sender: 'patient', author_id: ctx.user, body });
      res.status(201).json({ data: m });
    } catch (error) {
      if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
      failed(res, error, 'POST /me/patient/messages');
    }
  });

  // ── Nutricionista ───────────────────────────────────────────────────────────────────────
  async function proPatient(req, res) {
    const user = requireUser(req, res);
    if (!user) return null;
    const org = await clinicalOrg(user);
    if (!org || !isUuid(req.params.id)) { notFound(res); return null; }
    const p = await database('patients').where({ id: req.params.id, organization_id: org })
      .first('id', 'organization_id', 'full_name', 'status', 'app_user_id', 'phone', 'birth_date');
    if (!p) { notFound(res); return null; }
    return { user, org, p };
  }

  router.get('/messages/conversations', async (req, res) => {
    try {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      if (!org) return res.json({ data: { enabled: false, conversations: [] } });
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
      const last = database('patient_messages').where('organization_id', org)
        .distinctOn('patient_id').orderBy([{ column: 'patient_id' }, { column: 'created_at', order: 'desc' }])
        .select('patient_id', 'sender', 'body', 'created_at', 'read_at').as('l');
      let query = database.from(last).join('patients as p', 'p.id', 'l.patient_id').where('p.organization_id', org);
      if (q) query = query.whereRaw('f_unaccent(lower(p.full_name)) like f_unaccent(lower(?))', [`%${q}%`]);
      const rows = await query.orderBy('l.created_at', 'desc').limit(200)
        .select('p.id', 'p.full_name', 'p.status', 'p.app_user_id', 'l.sender', 'l.body', 'l.created_at', 'l.read_at');
      const unread = await database('patient_messages').where({ organization_id: org, sender: 'patient' }).whereNull('read_at')
        .groupBy('patient_id').select('patient_id').count({ n: '*' });
      const unreadOf = new Map(unread.map((u) => [u.patient_id, Number(u.n)]));
      const settings = await database('organizations').where('id', org).first('patient_messages');
      res.json({
        data: {
          enabled: settings?.patient_messages !== false,
          conversations: rows.map((r) => ({
            patient_id: r.id, name: r.full_name, active: r.status === 'active', linked: Boolean(r.app_user_id),
            last: { sender: r.sender, body: r.body.slice(0, 160), created_at: r.created_at, read_at: r.read_at },
            unread: unreadOf.get(r.id) ?? 0,
          })),
        },
      });
    } catch (error) {
      failed(res, error, 'GET /messages/conversations');
    }
  });

  router.get('/messages/unread', async (req, res) => {
    try {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      if (!org) return res.json({ data: { count: 0, conversations: 0 } });
      const r = await database('patient_messages').where({ organization_id: org, sender: 'patient' }).whereNull('read_at')
        .count({ n: '*' }).countDistinct({ c: 'patient_id' }).first();
      res.json({ data: { count: Number(r?.n ?? 0), conversations: Number(r?.c ?? 0) } });
    } catch (error) {
      failed(res, error, 'GET /messages/unread');
    }
  });

  router.get('/messages/settings', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const org = await clinicalOrg(user);
    if (!org) return notFound(res);
    const row = await database('organizations').where('id', org).first('patient_messages');
    res.json({ data: { enabled: row?.patient_messages !== false } });
  });

  router.post('/messages/settings', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const org = await clinicalOrg(user);
    if (!org) return notFound(res);
    if (typeof req.body?.enabled !== 'boolean') return bad(res, { enabled: 'Informe ligado ou desligado.' });
    await database('organizations').where('id', org).update({ patient_messages: req.body.enabled });
    res.json({ data: { enabled: req.body.enabled } });
  });

  router.get('/patients/:id/messages', async (req, res) => {
    try {
      const ctx = await proPatient(req, res);
      if (!ctx) return;
      const { rows, hasMore } = await page(ctx.p.id, req.query);
      await markRead(ctx.p.id, 'patient');
      res.json({
        data: {
          patient: { id: ctx.p.id, name: ctx.p.full_name, active: ctx.p.status === 'active', linked: Boolean(ctx.p.app_user_id), phone: ctx.p.phone ?? null },
          messages: rows.map(out), has_more: hasMore, peer_read_at: await peerReadAt(ctx.p.id, 'professional'),
        },
      });
    } catch (error) {
      failed(res, error, 'GET /patients/:id/messages');
    }
  });

  router.post('/patients/:id/messages', async (req, res) => {
    try {
      const ctx = await proPatient(req, res);
      if (!ctx) return;
      const body = cleanBody(req.body?.body);
      if (!body) return bad(res, { body: `Escreva uma mensagem de até ${MAX_BODY} caracteres.` });
      if (ctx.p.status !== 'active') return conflict(res, 'Reative o paciente para mandar mensagens.');
      if (!ctx.p.app_user_id) return conflict(res, 'O paciente ainda não entrou no app. Convide pela aba "App do paciente" da ficha.');
      if (await tooFast(ctx.user)) return slowDown(res);
      const m = await insert({ organization_id: ctx.org, patient_id: ctx.p.id, sender: 'professional', author_id: ctx.user, body });
      // Responder também conta como ter lido.
      await markRead(ctx.p.id, 'patient');
      res.status(201).json({ data: m });
    } catch (error) {
      if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
      failed(res, error, 'POST /patients/:id/messages');
    }
  });

  // ── Aviso de mensagem não lida (ciclo do avisador, a cada minuto) ─────────────────────────
  async function cycle() {
    const groups = await database('patient_messages')
      .whereNull('read_at').whereNull('notified_at')
      .where('created_at', '<', database.raw(`now() - interval '${NOTIFY_AFTER_MIN} minutes'`))
      .where('created_at', '>', database.raw("now() - interval '3 days'"))
      .groupBy('organization_id', 'patient_id', 'sender')
      .select('organization_id', 'patient_id', 'sender').count({ n: '*' }).max({ last: 'created_at' }).min({ first: 'created_at' });
    for (const g of groups) {
      try {
        const p = await database('patients as pt').leftJoin('directus_users as u', 'u.id', 'pt.responsible_user_id')
          .where('pt.id', g.patient_id).first('pt.full_name', 'pt.responsible_user_id', 'u.first_name', 'u.last_name');
        if (g.sender === 'professional') {
          await notifier.enqueuePatient({
            orgId: g.organization_id, patientId: g.patient_id, kind: 'message_to_patient', important: true,
            dedupe: `msg:p:${g.patient_id}:${notifyBucket(g.first)}`, ctx: { from: fullName(p), link: `${SITE}/p/mensagens` },
          });
        } else {
          const members = await database('organization_members').where('organization_id', g.organization_id).whereIn('role', ['owner', 'nutritionist']).select('user_id', 'role');
          const responsible = members.find((m) => m.user_id === p?.responsible_user_id);
          const targets = responsible ? [responsible.user_id] : members.filter((m) => m.role === 'owner').map((m) => m.user_id);
          const fromPatient = String(p?.full_name ?? 'Paciente').trim().split(/\s+/).slice(0, 2).join(' ');
          for (const userId of targets) {
            await notifier.enqueueUser({
              orgId: g.organization_id, userId, kind: 'message_to_professional',
              dedupe: `msg:n:${g.patient_id}:${notifyBucket(g.first)}`, ctx: { fromPatient, count: Number(g.n), link: `${SITE}/app/mensagens/${g.patient_id}` },
            });
          }
        }
      } catch (error) {
        logger.warn({ err: error?.message }, 'rafanutri: falha ao avisar mensagem não lida');
      }
      await database('patient_messages').where({ patient_id: g.patient_id, sender: g.sender }).whereNull('read_at').whereNull('notified_at')
        .where('created_at', '<=', g.last).update({ notified_at: database.fn.now() });
    }
  }
  if (notifier?.addCycle) notifier.addCycle(cycle);
}
