// Área do paciente: convite e vínculo da conta, aceite dos termos, marca do consultório, plano e o que o paciente vê.
// Saiu de index.js (mesma ordem das rotas). O avisador (notify.js) é montado no fim do handler: lido na hora por notifierRef().
import { parseImageDataUrl } from './foods.js';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { LEGAL_VERSIONS, SHARE_KEYS } from './catalogs.js';

export function setupPatientArea(ctx) {
  const { EMAIL, PATIENT_ROLE, TOKEN_FORMAT, bad, clinicalOrg, conflict, database, getSchema, hashToken, isPatientAccount, isUuid, logger, myPatientRecord, notifierRef, orgNotFound, requireUser, router, services, withActor } = ctx;
    // ── Área do paciente: convite, vínculo e dados (RN-203, RN-204) ─────────────────────────
    // O vínculo patients.app_user_id só muda numa transação com rafanutri.patient_link = on (gatilho 0018).
    const gone = (res) => res.status(410).json({ errors: [{ message: 'Este convite não está mais disponível. Peça um novo ao seu nutricionista.', extensions: { code: 'INVITE_UNAVAILABLE' } }] });
    const linkOn = (trx) => trx.raw("select set_config('rafanutri.patient_link', 'on', true)");
    const maskEmail = (e) => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => `${a}${'•'.repeat(Math.min(6, b.length))}${c}`);
    async function isProfessional(userId) {
      return Boolean(await database('organization_members').where({ user_id: userId }).first('user_id'));
    }
    /** Menor de 18 anos pela data de nascimento (sem data, não é tratado como menor). */
    function isMinor(birth) {
      if (!birth) return false;
      const b = new Date(birth instanceof Date ? birth : `${String(birth).slice(0, 10)}T12:00:00Z`);
      const limit = new Date(b); limit.setUTCFullYear(b.getUTCFullYear() + 18);
      return limit.getTime() > Date.now();
    }
    async function clinicalPatient(user, id) {
      const org = await clinicalOrg(user);
      if (!org || !isUuid(id)) return null;
      return database('patients').where({ id, organization_id: org }).first('id', 'organization_id', 'status', 'email', 'app_user_id', 'app_activated_at', 'birth_date');
    }
    async function pendingInvite(token, trx = database) {
      if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) return null;
      const inv = await trx('patient_app_invites as i')
        .join('patients as p', 'p.id', 'i.patient_id')
        .where('i.token_hash', hashToken(token))
        .whereNull('i.used_at').whereNull('i.revoked_at')
        .where('i.expires_at', '>', trx.fn.now())
        .where('p.status', 'active')
        .first('i.id', 'i.organization_id', 'i.patient_id', 'i.email', 'i.expires_at', 'i.guardian_id', 'p.full_name', 'p.responsible_user_id');
      return inv ?? null;
    }
    async function linkInvite(inv, userId) {
      return database.transaction(async (trx) => {
        await linkOn(trx);
        const n = await trx('patient_app_invites').where({ id: inv.id }).whereNull('used_at').whereNull('revoked_at').update({ used_at: trx.fn.now(), used_by: userId });
        if (!n) return false;
        // Se a conta já estava ligada a outro registro deste consultório, desfaz (um registro por conta e consultório).
        // Convite ao responsável (0065) não desfaz: a mesma conta acompanha mais de um filho.
        if (!inv.guardian_id) {
          await trx('patients').where({ organization_id: inv.organization_id, app_user_id: userId }).whereNot({ id: inv.patient_id })
            .whereNotExists(function () { this.select(1).from('patient_app_invites as gi').whereRaw('gi.patient_id = patients.id').whereNotNull('gi.guardian_id').where('gi.used_by', userId); })
            .update({ app_user_id: null, app_activated_at: null });
        }
        await trx('patients').where({ id: inv.patient_id }).update({ app_user_id: userId, app_activated_at: trx.fn.now() });
        return true;
      });
    }

    router.get('/patients/:id/app-access', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      const invite = await database('patient_app_invites').where({ patient_id: p.id }).whereNull('used_at').whereNull('revoked_at')
        .where('expires_at', '>', database.fn.now()).first('email', 'expires_at', 'date_created');
      const account = p.app_user_id ? await database('directus_users').where({ id: p.app_user_id }).first('email') : null;
      const minor = isMinor(p.birth_date);
      const guardians = minor
        ? await database('patient_guardians').where({ patient_id: p.id }).orderBy('date_created').select('id', 'full_name', 'relationship', 'email', 'phone', 'consent_at', 'consent_method', 'notes')
        : [];
      res.json({ data: { linked: Boolean(p.app_user_id), email: account?.email ?? null, activated_at: p.app_activated_at, invite: invite ?? null, patient_email: p.email, active: p.status === 'active', minor, guardians } });
    });

    router.post('/patients/:id/app-invite', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      let email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      if (p.status !== 'active') return conflict(res, 'Reative o paciente antes de convidar.');
      // RN-118: paciente menor de 18 anos — o app é do responsável, com o consentimento registrado (LGPD, art. 14).
      let guardianId = null;
      if (isMinor(p.birth_date)) {
        const g = isUuid(req.body?.guardian_id)
          ? await database('patient_guardians').where({ id: req.body.guardian_id, patient_id: p.id }).first('id', 'email', 'consent_at')
          : null;
        if (!g) return conflict(res, 'Paciente menor de idade: escolha o responsável que vai usar o app (aba Materno-infantil, Responsáveis).');
        if (!g.consent_at) return conflict(res, 'Registre o consentimento do responsável antes de liberar o app.');
        guardianId = g.id;
        if (!email && g.email) email = g.email;
      }
      if (!EMAIL.test(email) || email.length > 254) return bad(res, { email: 'Informe um e-mail válido.' });
      const existing = await database('directus_users').whereRaw('lower(email) = ?', [email]).first('id', 'role');
      if (existing && existing.role !== PATIENT_ROLE) return conflict(res, 'Este e-mail é de uma conta de profissional; use outro e-mail para o paciente.');
      const token = randomBytes(32).toString('base64url');
      try {
        const expires = await database.transaction(async (trx) => {
          await trx('patient_app_invites').where({ patient_id: p.id }).whereNull('used_at').whereNull('revoked_at').update({ revoked_at: trx.fn.now() });
          const [row] = await trx('patient_app_invites')
            .insert({ organization_id: p.organization_id, patient_id: p.id, email, token_hash: hashToken(token), user_created: user, guardian_id: guardianId })
            .returning('expires_at');
          return row.expires_at;
        });
        // send: true → o convite sai pelo canal do paciente (Telegram ligado ou e-mail do convite).
        let sent = false;
        if (req.body?.send === true && notifierRef()) {
          const site = (process.env.RAFANUTRI_SITE_URL || 'https://rafanutri.brunokobi.tech').replace(/\/$/, '');
          sent = await notifierRef().sendInvite({ orgId: p.organization_id, patientId: p.id, email, link: `${site}/p/convite/${token}`, inviteId: hashToken(token).slice(0, 32) }).catch(() => false);
        }
        res.status(201).json({ data: { token, email, expires_at: expires, sent } });
      } catch (error) {
        if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
        logger.error({ err: error }, 'rafanutri: falha ao criar convite do paciente');
        res.status(500).json({ errors: [{ message: 'Não foi possível criar o convite agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    router.post('/patients/:id/app-access/revoke', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      await database.transaction(async (trx) => {
        await linkOn(trx);
        await trx.raw("select set_config('rafanutri.actor', ?, true)", [user]);
        await trx('patients').where({ id: p.id }).update({ app_user_id: null, app_activated_at: null });
        await trx('patient_app_invites').where({ patient_id: p.id }).whereNull('used_at').whereNull('revoked_at').update({ revoked_at: trx.fn.now() });
      });
      res.json({ data: { ok: true } });
    });

    // ── Aceite dos documentos legais (0057) ─────────────────────────────────────────────────
    // Versões vigentes: catálogo compartilhado (catalogs.js, fonte em packages/catalogs).
    async function recordTerms(userId, documents, req) {
      const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : null;
      const rows = documents.filter((d) => LEGAL_VERSIONS[d]).map((d) => ({ user_id: userId, document: d, version: LEGAL_VERSIONS[d], user_agent: ua }));
      if (rows.length) await database('terms_acceptances').insert(rows).onConflict(['user_id', 'document', 'version']).ignore();
    }

    router.get('/me/terms', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const accepted = await database('terms_acceptances').where('user_id', user).orderBy('accepted_at', 'desc').select('document', 'version', 'accepted_at');
      res.json({ data: { current: LEGAL_VERSIONS, accepted } });
    });

    router.post('/me/terms', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const docs = Array.isArray(req.body?.documents) ? [...new Set(req.body.documents)].filter((d) => LEGAL_VERSIONS[d]) : [];
      if (!docs.length) return bad(res, { documents: 'Informe os documentos aceitos.' });
      await recordTerms(user, docs, req);
      res.json({ data: { ok: true } });
    });

    // Público (sem login): abrir o convite e criar a conta
    router.post('/public/patient-invites/open', async (req, res) => {
      const inv = await pendingInvite(req.body?.token);
      if (!inv) return gone(res);
      const [org, pro, account] = await Promise.all([
        database('organizations').where({ id: inv.organization_id }).first('name', 'brand_color'),
        database('directus_users as u').leftJoin('professional_profiles as pp', 'pp.user_id', 'u.id').where('u.id', inv.responsible_user_id)
          .first('u.first_name', 'u.last_name', 'pp.crn', 'pp.crn_region'),
        database('directus_users').whereRaw('lower(email) = ?', [inv.email]).first('id'),
      ]);
      res.json({
        data: {
          practice: org,
          professional: pro ? { name: [pro.first_name, pro.last_name].filter(Boolean).join(' ') || null, crn: pro.crn ? `${pro.crn_region ?? 'CRN'} ${pro.crn}` : null } : null,
          patient_first_name: inv.full_name.trim().split(/\s+/)[0] ?? null,
          email: inv.email,
          email_masked: maskEmail(inv.email),
          account_exists: Boolean(account),
          expires_at: inv.expires_at,
        },
      });
    });

    router.post('/public/patient-invites/accept', async (req, res) => {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (password.length < 8 || password.length > 128) return bad(res, { password: 'A senha precisa ter de 8 a 128 caracteres.' });
      if (req.body?.accept_terms !== true) return bad(res, { accept_terms: 'É preciso aceitar os Termos e a Política de Privacidade.' });
      const inv = await pendingInvite(req.body?.token);
      if (!inv) return gone(res);
      if (await database('directus_users').whereRaw('lower(email) = ?', [inv.email]).first('id')) {
        return res.status(409).json({ errors: [{ message: 'Já existe uma conta com este e-mail. Entre com ela para aceitar o convite.', extensions: { code: 'ACCOUNT_EXISTS' } }] });
      }
      let userId = null;
      try {
        const users = new services.UsersService({ schema: await getSchema(), accountability: null });
        userId = await users.createOne({ email: inv.email, password, role: PATIENT_ROLE, status: 'active', first_name: inv.full_name.trim().split(/\s+/)[0] ?? null });
        if (!(await linkInvite(inv, userId))) {
          await users.deleteOne(userId);
          return gone(res);
        }
        await recordTerms(userId, ['patient_terms', 'privacy'], req);
        res.status(201).json({ data: { email: inv.email } });
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao aceitar convite do paciente');
        if (userId) await database('directus_users').where({ id: userId }).del().catch(() => {});
        res.status(500).json({ errors: [{ message: 'Não foi possível criar seu acesso agora. Tente de novo em instantes.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    // Com login: conta de paciente já existente aceita o convite (mesmo e-mail)
    router.post('/patient-invites/accept', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const inv = await pendingInvite(req.body?.token);
      if (!inv) return gone(res);
      const me = await database('directus_users').where({ id: user }).first('email', 'role');
      if (me?.role !== PATIENT_ROLE || (await isProfessional(user))) return res.status(403).json({ errors: [{ message: 'Esta é uma conta de profissional. Entre com a conta de paciente.', extensions: { code: 'FORBIDDEN' } }] });
      if ((me.email ?? '').toLowerCase() !== inv.email) return res.status(403).json({ errors: [{ message: 'Este convite é para outro e-mail.', extensions: { code: 'EMAIL_MISMATCH' } }] });
      if (!(await linkInvite(inv, user))) return gone(res);
      if (req.body?.accept_terms === true) await recordTerms(user, ['patient_terms', 'privacy'], req);
      res.json({ data: { ok: true } });
    });

    // Dados da área do paciente: registros ativos ligados à conta, com o plano publicado
    router.get('/me/patient', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const rows = await database('patients as p')
        .join('organizations as o', 'o.id', 'p.organization_id')
        .leftJoin('directus_users as u', 'u.id', 'p.responsible_user_id')
        .leftJoin('professional_profiles as pp', 'pp.user_id', 'p.responsible_user_id')
        .where('p.app_user_id', user).where('p.status', 'active')
        .orderBy('p.app_activated_at', 'desc')
        .select('p.id', 'p.full_name', 'o.id as org_id', 'o.name as org_name', 'o.brand_color', 'o.logo', 'u.first_name', 'u.last_name', 'pp.crn', 'pp.crn_region');
      const plans = rows.length
        ? await database('meal_plans').whereIn('patient_id', rows.map((r) => r.id)).where('status', 'published').select('id', 'patient_id', 'title', 'published_at', 'meals')
        : [];
      const planOf = new Map(plans.map((pl) => [pl.patient_id, pl]));
      const unread = rows.length
        ? await database('patient_recommendations').whereIn('patient_id', rows.map((r) => r.id)).where('status', 'published').whereNull('read_at')
          .groupBy('patient_id').select('patient_id').count({ n: '*' })
        : [];
      const unreadOf = new Map(unread.map((u) => [u.patient_id, Number(u.n)]));
      res.json({
        data: { patient_account: await isPatientAccount(user), records: rows.map((r) => {
          const pl = planOf.get(r.id);
          return {
            patient_id: r.id,
            first_name: r.full_name.trim().split(/\s+/)[0] ?? null,
            practice: { id: r.org_id, name: r.org_name, brand_color: r.brand_color, has_logo: Boolean(r.logo) },
            professional: { name: [r.first_name, r.last_name].filter(Boolean).join(' ') || null, crn: r.crn ? `${r.crn_region ?? 'CRN'} ${r.crn}` : null },
            recommendations_unread: unreadOf.get(r.id) ?? 0,
            plan: pl
              ? { id: pl.id, title: pl.title, published_at: pl.published_at, meals: (pl.meals ?? []).map((m) => ({ id: m.id, name: m.name, time: m.time ?? null, items: (m.items ?? []).length })) }
              : null,
          };
        }) },
      });
    });

    // RN-211 — Logo do consultório: membros do consultório ou paciente com vínculo ativo nele.
    router.get('/practices/:id/logo', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const notFoundLogo = () => res.status(404).json({ errors: [{ message: 'Logo não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      if (!isUuid(req.params.id)) return notFoundLogo();
      const org = await database('organizations').where('id', req.params.id).first('id', 'logo');
      if (!org?.logo) return notFoundLogo();
      const member = await database('organization_members').where({ organization_id: org.id, user_id: user }).first('user_id');
      const linked = member ? true : Boolean(await database('patients').where({ organization_id: org.id, app_user_id: user, status: 'active' }).first('id'));
      if (!linked) return notFoundLogo();
      try {
        const assets = new services.AssetsService({ schema: await getSchema(), accountability: null });
        const { stream, file } = await assets.getAsset(org.logo);
        res.setHeader('Content-Type', file.type ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        stream.pipe(res);
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao ler logo');
        notFoundLogo();
      }
    });

    // RN-204 — Marca do consultório: só o owner troca o logo e a cor.
    async function ownedOrg(user, id) {
      if (!isUuid(id)) return null;
      const m = await database('organization_members').where({ organization_id: id, user_id: user, role: 'owner' }).first('organization_id');
      return m ? database('organizations').where('id', id).first('id', 'logo') : null;
    }

    router.post('/practices/:id/logo', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await ownedOrg(user, req.params.id);
      if (!org) return orgNotFound(res);
      const img = parseImageDataUrl(req.body?.image);
      if (!img || img.type === 'image/webp') return bad(res, { image: 'Envie o logo em PNG ou JPG de até 600 KB.' });
      try {
        const files = new services.FilesService({ schema: await getSchema(), accountability: null });
        const ext = img.type === 'image/png' ? 'png' : 'jpg';
        const fileId = await files.uploadOne(Readable.from(img.buffer), { filename_download: `logo-${org.id}.${ext}`, type: img.type, title: `Logo ${org.id}` });
        await database('organizations').where('id', org.id).update({ logo: fileId });
        if (org.logo) await files.deleteOne(org.logo).catch(() => {});
        res.json({ data: { has_logo: true } });
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao salvar logo');
        res.status(500).json({ errors: [{ message: 'Não foi possível salvar o logo.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    router.delete('/practices/:id/logo', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await ownedOrg(user, req.params.id);
      if (!org) return orgNotFound(res);
      if (org.logo) {
        await database('organizations').where('id', org.id).update({ logo: null });
        const files = new services.FilesService({ schema: await getSchema(), accountability: null });
        await files.deleteOne(org.logo).catch(() => {});
      }
      res.json({ data: { has_logo: false } });
    });

    router.put('/practices/:id/brand', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await ownedOrg(user, req.params.id);
      if (!org) return orgNotFound(res);
      const patch = {};
      if ('brand_color' in (req.body ?? {})) {
        const color = req.body.brand_color;
        if (color !== null && !(typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) return bad(res, { brand_color: 'Cor inválida.' });
        patch.brand_color = color === null ? null : color.toUpperCase();
      }
      if ('receipt_tax_id' in (req.body ?? {})) {
        const tax = typeof req.body.receipt_tax_id === 'string' ? req.body.receipt_tax_id.replace(/\D/g, '') : '';
        if (tax && tax.length !== 11 && tax.length !== 14) return bad(res, { receipt_tax_id: 'CPF (11 dígitos) ou CNPJ (14 dígitos).' });
        patch.receipt_tax_id = tax || null;
      }
      if (!Object.keys(patch).length) return bad(res, { brand_color: 'Nada para salvar.' });
      await database('organizations').where('id', org.id).update(patch);
      res.json({ data: patch });
    });

    // RN-022 — Expediente do consultório (sugestão de horários da agenda). Só o owner muda.
    router.put('/practices/:id/schedule', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await ownedOrg(user, req.params.id);
      if (!org) return orgNotFound(res);
      const b = req.body ?? {};
      const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
      const errors = {};
      if (typeof b.work_start !== 'string' || !HHMM.test(b.work_start)) errors.work_start = 'Horário inválido.';
      if (typeof b.work_end !== 'string' || !HHMM.test(b.work_end)) errors.work_end = 'Horário inválido.';
      if (!errors.work_start && !errors.work_end && b.work_end <= b.work_start) errors.work_end = 'O fim precisa ser depois do início.';
      const days = Array.isArray(b.work_weekdays) ? [...new Set(b.work_weekdays)] : [];
      if (!days.length || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) errors.work_weekdays = 'Escolha ao menos um dia.';
      if (Object.keys(errors).length) return bad(res, errors);
      const patch = { work_start: b.work_start, work_end: b.work_end, work_weekdays: days.sort((x, y) => x - y) };
      await database('organizations').where('id', org.id).update(patch);
      res.json({ data: patch });
    });

    // RN-205 — Plano publicado completo para o paciente. A conta do paciente não lê coleções: os
    // nomes dos alimentos, as medidas caseiras e as preparações são resolvidos aqui, só para o
    // registro ativo ligado à conta e só com alimentos da base pública ou do próprio consultório.
    /** Cabeçalho do PDF: consultório, profissional que fez o plano (ou o responsável) e paciente. */
    async function planDocumentInfo(patient, plan) {
      const org = await database('organizations').where('id', patient.organization_id).first('name', 'brand_color');
      const authorId = plan.user_created ?? patient.responsible_user_id;
      const author = authorId ? await database('directus_users').where('id', authorId).first('first_name', 'last_name', 'email') : null;
      const prof = authorId ? await database('professional_profiles').where('user_id', authorId).first('crn', 'crn_region') : null;
      return {
        practice_name: org?.name ?? 'Consultório',
        brand_color: org?.brand_color ?? null,
        professional_name: [author?.first_name, author?.last_name].filter(Boolean).join(' ') || null,
        crn: prof?.crn ?? '',
        crn_region: prof?.crn_region ?? 'CRN',
        contact: author?.email ?? '',
        patient_name: patient.full_name,
        objective: patient.objective ?? '',
      };
    }

    // RN-209 — Planos que o paciente pode baixar: o vigente e os anteriores (já publicados).
    router.get('/me/patient/plans', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await myPatientRecord(user, isUuid(req.query.c) ? req.query.c : null);
      if (!p) return res.json({ data: { patient_id: null, plans: [] } });
      const plans = await database('meal_plans').where({ patient_id: p.id, organization_id: p.organization_id })
        .whereIn('status', ['published', 'archived']).whereNotNull('published_at')
        .orderBy('published_at', 'desc').select('id', 'title', 'status', 'published_at', 'valid_until');
      res.json({ data: { patient_id: p.id, plans: plans.map((pl) => ({ ...pl, valid_until: pl.valid_until ? new Date(pl.valid_until).toISOString().slice(0, 10) : null })) } });
    });

    // RN-210 — O que o paciente vê (padrão do consultório + escolha por paciente).
    async function shareOf(patientId) {
      const r = await database.raw('select patient_share(?) as s', [patientId]);
      const s = r.rows?.[0]?.s ?? {};
      return Object.fromEntries(SHARE_KEYS.map((k) => [k, s[k] === true]));
    }
    async function weightHistory(patientId) {
      const r = await database.raw('select assessed_at, weight_kg from patient_weight_history(?)', [patientId]);
      return (r.rows ?? []).map((w) => ({ date: new Date(w.assessed_at).toISOString().slice(0, 10), weight_kg: Number(w.weight_kg) }));
    }

    /** Plano como o paciente vê (RN-205/209/210). planId = um plano já publicado; sem planId = o vigente. */
    async function patientPlanPayload(patient, planId) {
      let pq = database('meal_plans').where({ patient_id: patient.id, organization_id: patient.organization_id });
      pq = planId ? pq.where('id', planId).whereIn('status', ['published', 'archived']).whereNotNull('published_at') : pq.where('status', 'published');
      const plan = await pq.orderBy('published_at', 'desc').first('id', 'title', 'mode', 'status', 'published_at', 'valid_until', 'guidelines', 'meals', 'user_created');
      if (!plan) return null;
      const share = await shareOf(patient.id);
      const meals = (Array.isArray(plan.meals) ? plan.meals : []).map((m) => ({
        id: String(m.id), name: String(m.name ?? ''), time: m.time ?? null,
        items: (m.items ?? []).map((i) => ({
          foodId: String(i.foodId), quantityG: Number(i.quantityG) || 0,
          subs: (i.subs ?? []).map((s) => ({ foodId: String(s.foodId), quantityG: Number(s.quantityG) || 0 })),
        })),
      }));
      const ids = [...new Set(meals.flatMap((m) => m.items.flatMap((i) => [i.foodId, ...i.subs.map((s) => s.foodId)])))]
        .filter((id) => /^\d+$/.test(id)).map(Number);
      const foodRows = ids.length
        ? await database('foods').whereIn('id', ids)
          .where((w) => w.whereNull('organization_id').orWhere('organization_id', patient.organization_id))
          .select('id', 'name', 'kind', 'household_measures')
        : [];
      // Composição só quando o nutricionista libera calorias ou macros
      const per100 = new Map();
      if ((share.show_kcal || share.show_macros) && foodRows.length) {
        const rows = await database('food_nutrients as fn').join('nutrients as n', 'n.id', 'fn.nutrient_id')
          .whereIn('fn.food_id', foodRows.map((f) => f.id)).whereIn('n.code', ['energy_kcal', 'protein_g', 'carbohydrate_g', 'lipid_g'])
          .select('fn.food_id', 'n.code', 'fn.amount_per_100g');
        for (const r of rows) {
          if (!share.show_kcal && r.code === 'energy_kcal') continue;
          if (!share.show_macros && r.code !== 'energy_kcal') continue;
          const o = per100.get(r.food_id) ?? {};
          o[r.code] = r.amount_per_100g == null ? null : Number(r.amount_per_100g);
          per100.set(r.food_id, o);
        }
      }
      const foods = Object.fromEntries(foodRows.map((f) => [String(f.id), {
        name: f.name,
        household_measures: Array.isArray(f.household_measures) ? f.household_measures : [],
        ...(share.show_kcal || share.show_macros ? { per100g: per100.get(f.id) ?? {} } : {}),
      }]));
      const recipeIds = foodRows.filter((f) => f.kind === 'recipe').map((f) => f.id);
      const recipeRows = recipeIds.length ? await database('recipes').whereIn('food_id', recipeIds).select('food_id', 'yield_g', 'servings', 'instructions', 'items') : [];
      const ingIds = [...new Set(recipeRows.flatMap((r) => (r.items ?? []).map((i) => Number(i.foodId))))].filter(Number.isFinite);
      const ingNames = ingIds.length ? await database('foods').whereIn('id', ingIds).select('id', 'name') : [];
      const ingName = new Map(ingNames.map((n) => [String(n.id), n.name]));
      const recipes = Object.fromEntries(recipeRows.map((r) => [String(r.food_id), {
        yield_g: r.yield_g == null ? null : Number(r.yield_g),
        servings: r.servings == null ? null : Number(r.servings),
        instructions: r.instructions ?? null,
        items: (r.items ?? []).map((i) => ({ name: ingName.get(String(i.foodId)) ?? null, quantityG: Number(i.quantityG) || 0 })),
      }]));
      return {
        patient_id: patient.id,
        share,
        document: await planDocumentInfo(patient, plan),
        plan: { id: plan.id, title: plan.title, mode: plan.mode, status: plan.status, published_at: plan.published_at, valid_until: plan.valid_until ? new Date(plan.valid_until).toISOString().slice(0, 10) : null, guidelines: plan.guidelines, meals },
        foods,
        recipes,
      };
    }
    const PATIENT_COLS = ['id', 'organization_id', 'full_name', 'objective', 'responsible_user_id'];

    router.get('/me/patient/plan', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const c = typeof req.query.c === 'string' && isUuid(req.query.c) ? req.query.c : null;
      let q = database('patients').where('app_user_id', user).where('status', 'active');
      if (c) q = q.where('id', c);
      const patient = await q.orderBy('app_activated_at', 'desc').first(PATIENT_COLS);
      const planId = typeof req.query.p === 'string' && isUuid(req.query.p) ? req.query.p : null;
      const data = patient ? await patientPlanPayload(patient, planId) : null;
      if (!data) return res.status(404).json({ errors: [{ message: 'Plano não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      res.json({ data });
    });

    // Histórico de peso do paciente (só data e peso; vazio se não liberado)
    router.get('/me/patient/weight', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await myPatientRecord(user, isUuid(req.query.c) ? req.query.c : null);
      if (!p) return res.json({ data: { patient_id: null, share: null, weight: [] } });
      res.json({ data: { patient_id: p.id, share: await shareOf(p.id), weight: await weightHistory(p.id) } });
    });

    // Nutricionista: configurações por paciente e padrão do consultório
    router.get('/patients/:id/share', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      const row = await database('patients as p').join('organizations as o', 'o.id', 'p.organization_id').where('p.id', p.id)
        .first('p.share_settings', 'o.patient_share_defaults');
      const role = await database('organization_members').where({ organization_id: p.organization_id, user_id: user }).first('role');
      res.json({ data: { effective: await shareOf(p.id), overrides: row.share_settings ?? null, org_defaults: row.patient_share_defaults, can_edit_defaults: role?.role === 'owner' } });
    });

    router.put('/patients/:id/share', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      const b = req.body ?? {};
      if (SHARE_KEYS.some((k) => typeof b[k] !== 'boolean')) return bad(res, { _: 'Informe sim ou não para cada item.' });
      const settings = Object.fromEntries(SHARE_KEYS.map((k) => [k, b[k]]));
      if (b.as_default === true) {
        const role = await database('organization_members').where({ organization_id: p.organization_id, user_id: user }).first('role');
        if (role?.role !== 'owner') return res.status(403).json({ errors: [{ message: 'Só o responsável pelo consultório muda o padrão.', extensions: { code: 'FORBIDDEN' } }] });
        await database('organizations').where('id', p.organization_id).update({ patient_share_defaults: JSON.stringify(settings) });
      }
      await withActor(user, (trx) => trx('patients').where('id', p.id).update({ share_settings: JSON.stringify(settings) }));
      res.json({ data: { effective: await shareOf(p.id) } });
    });

    // "Ver como paciente": o mesmo que a área do paciente mostra, para o nutricionista conferir
    router.get('/patients/:id/preview', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      const patient = await database('patients').where('id', p.id).first(PATIENT_COLS);
      res.json({ data: { share: await shareOf(p.id), plan: await patientPlanPayload(patient, null), weight: await weightHistory(p.id) } });
    });

  return { clinicalPatient, ownedOrg, planDocumentInfo, recordTerms };
}
