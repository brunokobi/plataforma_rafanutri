// Módulo UAN e Qualidade (Enterprise): unidades, equipe, checklists, temperaturas, não conformidades, insumos,
// fichas técnicas, cardápios, produção, estoque, compras, documentos, APPCC, rótulos, cardápio publicado, perfis,
// contrato, importação, painel da rede e administração dos contratos. Saiu de index.js (mesma ordem das rotas).
import { STARTER_INGREDIENTS, missingStarter } from './ingredient-starter.js';
import { isIsoDate } from './finance.js';
import { parseImageDataUrl } from './foods.js';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';

export function setupUan(ctx) {
  const { EMAIL, TOKEN_FORMAT, bad, conflict, database, getSchema, hashToken, isPatientAccount, isUuid, logger, pubNotFound, recordTerms, requireUser, router, services, withActor } = ctx;
    // ── Módulo UAN: unidades produtoras (RN-121 a RN-123) ──────────────────────────────────
    // O owner da organização (com o módulo habilitado) vê e administra todas as unidades; a equipe
    // (unit_members) vê só as unidades em que tem papel. As regras de módulo, limite de unidades
    // ativas e organização imutável ficam no gatilho production_units_guard (0033).
    const UNIT_KINDS = new Set(['industrial', 'hospital', 'school', 'hotel', 'restaurant', 'catering', 'other']);
    const UNIT_FIELDS = ['id', 'organization_id', 'name', 'kind', 'cnpj', 'address', 'city', 'state', 'geo_lat', 'geo_lng', 'geo_radius_m', 'sanitary_license', 'sanitary_license_expires_at', 'active', 'created_at'];
    const unitNotFound = (res) => res.status(404).json({ errors: [{ message: 'Unidade não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
    const unitOut = (u) => ({
      ...u,
      geo_lat: u.geo_lat === null ? null : Number(u.geo_lat),
      geo_lng: u.geo_lng === null ? null : Number(u.geo_lng),
      sanitary_license_expires_at: u.sanitary_license_expires_at ? String(u.sanitary_license_expires_at instanceof Date ? u.sanitary_license_expires_at.toISOString() : u.sanitary_license_expires_at).slice(0, 10) : null,
    });

    /** Organizações com UAN em que o usuário é owner ou tem papel em alguma unidade. */
    async function uanOrgs(user) {
      const owned = await database('organization_members as m')
        .join('organizations as o', 'o.id', 'm.organization_id')
        .where({ 'm.user_id': user, 'm.role': 'owner' })
        .whereRaw("'uan' = any (o.modules)")
        .select('o.id', 'o.name');
      const staff = await database('unit_members as um')
        .join('production_units as u', 'u.id', 'um.unit_id')
        .join('organizations as o', 'o.id', 'u.organization_id')
        .where('um.user_id', user)
        .whereRaw("'uan' = any (o.modules)")
        .distinct('o.id', 'o.name');
      const ownedIds = new Set(owned.map((o) => o.id));
      return [...owned.map((o) => ({ ...o, is_owner: true })), ...staff.filter((o) => !ownedIds.has(o.id)).map((o) => ({ ...o, is_owner: false }))];
    }

    /** Unidade + papéis do usuário nela; null se não existe ou ele não tem acesso. */
    async function unitAccess(user, unitId) {
      if (!isUuid(unitId)) return null;
      const unit = await database('production_units as u').join('organizations as o', 'o.id', 'u.organization_id').where('u.id', unitId).whereRaw("'uan' = any (o.modules)").first(...UNIT_FIELDS.map((f) => `u.${f}`));
      if (!unit) return null;
      const owner = await database('organization_members').where({ organization_id: unit.organization_id, user_id: user, role: 'owner' }).first('id');
      const roles = (await database('unit_members').where({ unit_id: unitId, user_id: user }).select('role')).map((r) => r.role);
      if (!owner && !roles.length) return null;
      return { unit, isOwner: Boolean(owner), roles };
    }

    function unitBody(b) {
      const errors = {};
      const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (name.length < 2 || name.length > 120) errors.name = 'Informe o nome da unidade (2 a 120 caracteres).';
      const kind = b.kind ?? 'restaurant';
      if (!UNIT_KINDS.has(kind)) errors.kind = 'Tipo inválido.';
      const cnpj = typeof b.cnpj === 'string' && b.cnpj.trim() ? b.cnpj.replace(/\D/g, '') : null;
      if (cnpj !== null && cnpj.length !== 14) errors.cnpj = 'CNPJ com 14 dígitos.';
      const state = typeof b.state === 'string' && b.state.trim() ? b.state.trim().toUpperCase() : null;
      if (state !== null && !/^[A-Z]{2}$/.test(state)) errors.state = 'UF com 2 letras.';
      const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
      const lat = num(b.geo_lat);
      const lng = num(b.geo_lng);
      if ((lat === null) !== (lng === null)) errors.geo_lat = 'Informe latitude e longitude juntas.';
      else if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) errors.geo_lat = 'Latitude inválida.';
      else if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) errors.geo_lng = 'Longitude inválida.';
      const radius = b.geo_radius_m === undefined || b.geo_radius_m === null || b.geo_radius_m === '' ? 200 : Number(b.geo_radius_m);
      if (!Number.isInteger(radius) || radius < 20 || radius > 5000) errors.geo_radius_m = 'Raio entre 20 e 5.000 m.';
      const expires = b.sanitary_license_expires_at || null;
      if (expires !== null && !isIsoDate(expires)) errors.sanitary_license_expires_at = 'Data inválida.';
      if (b.active !== undefined && typeof b.active !== 'boolean') errors.active = 'Valor inválido.';
      if (Object.keys(errors).length) return { errors };
      return {
        data: {
          name,
          kind,
          cnpj,
          address: str(b.address, 300),
          city: str(b.city, 120),
          state,
          geo_lat: lat === null ? null : Math.round(lat * 1e6) / 1e6,
          geo_lng: lng === null ? null : Math.round(lng * 1e6) / 1e6,
          geo_radius_m: radius,
          sanitary_license: str(b.sanitary_license, 80),
          sanitary_license_expires_at: expires,
          ...(b.active === undefined ? {} : { active: b.active }),
        },
      };
    }

    /** Erro do gatilho (módulo, limite) vira 409 com a mensagem do banco. */
    function unitDbError(res, error) {
      if (error?.code === '23514' && /Limite de unidades|módulo UAN/.test(error.message ?? '')) {
        return conflict(res, /Limite/.test(error.message) ? 'Limite de unidades ativas do contrato atingido.' : 'O módulo UAN não está habilitado para esta organização.');
      }
      logger.error({ err: error }, 'rafanutri: falha ao gravar unidade');
      return res.status(500).json({ errors: [{ message: 'Não foi possível salvar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    }

    // RN-124 — Modo leitura: contrato UAN encerrado (até 90 dias: read_only; depois: ended) bloqueia toda
    // escrita na UAN. A empresa vem da unidade ou da empresa no caminho; nos demais caminhos, das empresas
    // em que a pessoa atua (bloqueia se todas estiverem sem contrato vigente). Sem contrato algum: piloto, liberado.
    const READ_ONLY_STATES = new Set(['read_only', 'ended']);
    router.use(async (req, res, next) => {
      if (req.method === 'GET' || req.method === 'HEAD' || !req.path.startsWith('/uan/')) return next();
      const user = req.accountability?.user;
      if (!user) return next();
      try {
        let orgIds;
        const unit = req.path.match(/^\/uan\/units\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        const org = req.path.match(/^\/uan\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        if (unit) orgIds = (await database('production_units').where('id', unit[1]).pluck('organization_id'));
        else if (org) orgIds = [org[1]];
        else orgIds = (await uanOrgs(user)).map((o) => o.id);
        if (orgIds.length) {
          const states = (await database.raw('select uan_contract_state(id) as s from unnest(?::uuid[]) id', [orgIds])).rows.map((r) => r.s);
          if (states.every((st) => READ_ONLY_STATES.has(st))) {
            return res.status(403).json({ errors: [{ message: 'O contrato da UAN terminou: os dados ficam só para consulta. Fale com a Rafanutri para renovar.', extensions: { code: 'READ_ONLY' } }] });
          }
        }
      } catch (error) {
        logger.warn({ err: error?.message }, 'rafanutri: falha ao conferir o contrato UAN');
      }
      next();
    });

    router.get('/uan/context', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const orgs = await uanOrgs(user);
      const out = [];
      for (const o of orgs) {
        let q = database('production_units as u').where('u.organization_id', o.id).orderBy([{ column: 'u.active', order: 'desc' }, { column: 'u.name' }]);
        if (!o.is_owner) q = q.whereIn('u.id', database('unit_members').where('user_id', user).select('unit_id'));
        const units = (await q.select(...UNIT_FIELDS.map((f) => `u.${f}`))).map(unitOut);
        const roles = await database('unit_members').where('user_id', user).whereIn('unit_id', units.map((u) => u.id)).select('unit_id', 'role');
        const limit = o.is_owner ? (await database.raw('select uan_unit_limit(?) as n', [o.id])).rows[0].n : null;
        const contract = (await database.raw('select uan_contract_state(?) as s', [o.id])).rows[0].s;
        out.push({
          id: o.id,
          name: o.name,
          is_owner: o.is_owner,
          unit_limit: limit,
          contract_state: contract,
          units: units.map((u) => ({ ...u, roles: roles.filter((r) => r.unit_id === u.id).map((r) => r.role) })),
        });
      }
      res.json({ data: out });
    });

    router.post('/uan/units', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const orgId = req.body?.organization_id;
      const owns = isUuid(orgId) && (await uanOrgs(user)).some((o) => o.id === orgId && o.is_owner);
      if (!owns) return res.status(403).json({ errors: [{ message: 'Só o responsável pela empresa, com o módulo UAN habilitado, cria unidades.', extensions: { code: 'FORBIDDEN' } }] });
      const parsed = unitBody(req.body ?? {});
      if (parsed.errors) return bad(res, parsed.errors);
      try {
        const [row] = await withActor(user, (trx) => trx('production_units').insert({ ...parsed.data, organization_id: orgId }).returning(UNIT_FIELDS));
        res.status(201).json({ data: unitOut(row) });
      } catch (error) {
        unitDbError(res, error);
      }
    });

    router.get('/uan/units/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const canManage = a.isOwner || a.roles.includes('manager') || a.roles.includes('technical_lead');
      const members = canManage
        ? await database('unit_members as um')
            .join('directus_users as du', 'du.id', 'um.user_id')
            .where('um.unit_id', a.unit.id)
            .orderBy(['du.first_name', 'um.role'])
            .select('um.user_id', 'um.role', 'du.first_name', 'du.last_name', 'du.email')
        : [];
      const invites = canManage
        ? await database('unit_invites').where({ unit_id: a.unit.id }).whereNull('used_at').whereNull('revoked_at')
            .where('expires_at', '>', database.fn.now()).orderBy('date_created', 'desc').select('id', 'role', 'label', 'expires_at', 'date_created')
        : [];
      res.json({
        data: {
          unit: unitOut(a.unit),
          is_owner: a.isOwner,
          roles: a.roles,
          can_edit: a.isOwner || a.roles.includes('manager'),
          can_manage_team: canManage,
          invitable_roles: canManage ? [...invitableRoles(a)] : [],
          members: members.map((m) => ({ ...m, is_self: m.user_id === user })),
          invites,
        },
      });
    });

    router.put('/uan/units/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!a.isOwner && !a.roles.includes('manager')) return res.status(403).json({ errors: [{ message: 'Só o responsável pela empresa ou o gestor da unidade altera os dados.', extensions: { code: 'FORBIDDEN' } }] });
      // Ativar/desativar é do owner (mexe no limite do contrato).
      if (!a.isOwner && req.body?.active !== undefined) return res.status(403).json({ errors: [{ message: 'Só o responsável pela empresa ativa ou desativa unidades.', extensions: { code: 'FORBIDDEN' } }] });
      const parsed = unitBody(req.body ?? {});
      if (parsed.errors) return bad(res, parsed.errors);
      try {
        const [row] = await withActor(user, (trx) => trx('production_units').where('id', a.unit.id).update(parsed.data).returning(UNIT_FIELDS));
        res.json({ data: unitOut(row) });
      } catch (error) {
        unitDbError(res, error);
      }
    });

    // ── Equipe da unidade: convite por link, troca de papel e remoção (RN-220) ──────────────
    // O owner convida e administra qualquer papel; gestor e RT só cozinheiro, estoquista e auditor.
    // Quem aceita entra em unit_members (nunca em organization_members). Regras repetidas no banco (0034).
    const UNIT_ROLES = ['technical_lead', 'manager', 'cook', 'stock_keeper', 'auditor'];
    const STAFF_ROLES = new Set(['cook', 'stock_keeper', 'auditor']);
    const invitableRoles = (a) => (a.isOwner ? new Set(UNIT_ROLES) : a.roles.some((r) => r === 'manager' || r === 'technical_lead') ? STAFF_ROLES : new Set());
    const teamForbidden = (res) => res.status(403).json({ errors: [{ message: 'Você não pode alterar este papel na equipe.', extensions: { code: 'FORBIDDEN' } }] });
    const unitInviteGone = (res) => res.status(410).json({ errors: [{ message: 'Este convite não está mais disponível. Peça um novo ao responsável pela unidade.', extensions: { code: 'INVITE_UNAVAILABLE' } }] });
    const rtTaken = (error) => (error?.code === '23505' && /unit_members_one_rt/.test(error.constraint ?? error.message ?? '')) || (error?.code === 'P0001' && /já tem um RT/.test(error.message ?? ''));
    const RT_TAKEN = 'Esta unidade já tem um RT. Troque o papel do RT atual antes.';

    async function pendingUnitInvite(token) {
      if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) return null;
      return (await database('unit_invites as i')
        .join('production_units as u', 'u.id', 'i.unit_id')
        .join('organizations as o', 'o.id', 'i.organization_id')
        .where('i.token_hash', hashToken(token))
        .whereNull('i.used_at').whereNull('i.revoked_at')
        .where('i.expires_at', '>', database.fn.now())
        .where('u.active', true)
        .whereRaw("'uan' = any (o.modules)")
        .first('i.id', 'i.role', 'i.label', 'i.expires_at', 'u.id as unit_id', 'u.name as unit_name', 'u.kind', 'o.name as org_name')) ?? null;
    }

    /** Aceita dentro de uma transação com o autor; devolve a unidade, null se indisponível. */
    async function acceptUnitInvite(token, userId) {
      return withActor(userId, async (trx) => (await trx.raw('select unit_invite_accept(?, ?) as unit_id', [hashToken(token), userId])).rows[0].unit_id);
    }

    router.post('/uan/units/:id/invites', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const role = req.body?.role;
      if (!UNIT_ROLES.includes(role)) return bad(res, { role: 'Escolha o papel.' });
      if (!invitableRoles(a).has(role)) return teamForbidden(res);
      const label = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim().slice(0, 120) : null;
      if (!a.unit.active) return conflict(res, 'Ative a unidade antes de convidar a equipe.');
      const token = randomBytes(32).toString('base64url');
      try {
        const [row] = await withActor(user, (trx) => trx('unit_invites')
          .insert({ organization_id: a.unit.organization_id, unit_id: a.unit.id, role, label, token_hash: hashToken(token), expires_at: database.raw("now() + interval '7 days'"), user_created: user })
          .returning(['id', 'role', 'label', 'expires_at']));
        res.status(201).json({ data: { ...row, token } });
      } catch (error) {
        if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
        logger.error({ err: error }, 'rafanutri: falha ao criar convite da unidade');
        res.status(500).json({ errors: [{ message: 'Não foi possível criar o convite agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    router.post('/uan/units/:id/invites/:inviteId/revoke', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!isUuid(req.params.inviteId)) return unitInviteGone(res);
      const inv = await database('unit_invites').where({ id: req.params.inviteId, unit_id: a.unit.id }).whereNull('used_at').whereNull('revoked_at').first('id', 'role');
      if (!inv) return unitInviteGone(res);
      if (!invitableRoles(a).has(inv.role)) return teamForbidden(res);
      await withActor(user, (trx) => trx('unit_invites').where({ id: inv.id }).whereNull('used_at').whereNull('revoked_at').update({ revoked_at: trx.fn.now() }));
      res.json({ data: { ok: true } });
    });

    /** Troca de papel ({user_id, role, new_role}) ou remoção ({user_id, role}, sem new_role). */
    router.post('/uan/units/:id/members', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const { user_id: target, role, new_role: newRole } = req.body ?? {};
      if (!isUuid(target) || !UNIT_ROLES.includes(role) || (newRole !== undefined && newRole !== null && !UNIT_ROLES.includes(newRole))) {
        return bad(res, { role: 'Papel inválido.' });
      }
      const allowed = invitableRoles(a);
      if (!allowed.has(role) || (newRole && !allowed.has(newRole))) return teamForbidden(res);
      const exists = await database('unit_members').where({ unit_id: a.unit.id, user_id: target, role }).first('user_id');
      if (!exists) return res.status(404).json({ errors: [{ message: 'Pessoa não encontrada na equipe.', extensions: { code: 'NOT_FOUND' } }] });
      try {
        await withActor(user, async (trx) => {
          await trx('unit_members').where({ unit_id: a.unit.id, user_id: target, role }).del();
          if (newRole) await trx('unit_members').insert({ unit_id: a.unit.id, user_id: target, role: newRole }).onConflict(['unit_id', 'user_id', 'role']).ignore();
        });
        res.json({ data: { ok: true } });
      } catch (error) {
        if (rtTaken(error)) return conflict(res, RT_TAKEN);
        logger.error({ err: error }, 'rafanutri: falha ao alterar a equipe da unidade');
        res.status(500).json({ errors: [{ message: 'Não foi possível alterar a equipe agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    // Público (sem login): ver o convite e criar a conta
    router.post('/public/unit-invites/open', async (req, res) => {
      const inv = await pendingUnitInvite(req.body?.token);
      if (!inv) return unitInviteGone(res);
      res.json({ data: { organization: inv.org_name, unit: inv.unit_name, kind: inv.kind, role: inv.role, label: inv.label, expires_at: inv.expires_at } });
    });

    router.post('/public/unit-invites/accept', async (req, res) => {
      const b = req.body ?? {};
      const fullName = typeof b.full_name === 'string' ? b.full_name.trim().replace(/\s+/g, ' ') : '';
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      const password = typeof b.password === 'string' ? b.password : '';
      const errors = {};
      if (fullName.length < 2 || fullName.length > 120) errors.full_name = 'Informe seu nome.';
      if (!EMAIL.test(email) || email.length > 254) errors.email = 'Informe um e-mail válido.';
      if (password.length < 8 || password.length > 128) errors.password = 'A senha precisa ter de 8 a 128 caracteres.';
      if (b.accept_terms !== true) errors.accept_terms = 'É preciso aceitar os Termos e a Política de Privacidade.';
      if (Object.keys(errors).length) return bad(res, errors);
      const inv = await pendingUnitInvite(b.token);
      if (!inv) return unitInviteGone(res);
      if (await database('directus_users').whereRaw('lower(email) = ?', [email]).first('id')) {
        return res.status(409).json({ errors: [{ message: 'Já existe uma conta com este e-mail. Entre com ela para aceitar o convite.', extensions: { code: 'ACCOUNT_EXISTS' } }] });
      }
      const settings = await database('directus_settings').first('public_registration_role');
      if (!settings?.public_registration_role) {
        logger.error('rafanutri: sem papel de cadastro público para a equipe da UAN');
        return res.status(500).json({ errors: [{ message: 'Não foi possível criar seu acesso agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
      const [first, ...rest] = fullName.split(' ');
      let userId = null;
      try {
        const users = new services.UsersService({ schema: await getSchema(), accountability: null });
        userId = await users.createOne({ email, password, role: settings.public_registration_role, status: 'active', first_name: first, last_name: rest.join(' ') || null });
        const unitId = await acceptUnitInvite(b.token, userId);
        if (!unitId) {
          await users.deleteOne(userId);
          return unitInviteGone(res);
        }
        await recordTerms(userId, ['professional_terms', 'privacy'], req);
        res.status(201).json({ data: { email, unit_id: unitId } });
      } catch (error) {
        if (userId) await database('directus_users').where({ id: userId }).del().catch(() => {});
        if (rtTaken(error)) return conflict(res, 'Esta unidade já tem um RT. Peça um novo convite com outro papel.');
        logger.error({ err: error }, 'rafanutri: falha ao aceitar convite da unidade');
        res.status(500).json({ errors: [{ message: 'Não foi possível criar seu acesso agora. Tente de novo em instantes.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    // Com login: conta já existente (profissional) aceita o convite
    router.post('/unit-invites/accept', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const inv = await pendingUnitInvite(req.body?.token);
      if (!inv) return unitInviteGone(res);
      if (await isPatientAccount(user)) {
        return res.status(403).json({ errors: [{ message: 'Esta é uma conta da área do paciente. Crie um acesso de equipe com outro e-mail.', extensions: { code: 'FORBIDDEN' } }] });
      }
      try {
        const unitId = await acceptUnitInvite(req.body.token, user);
        if (!unitId) return unitInviteGone(res);
        res.json({ data: { unit_id: unitId } });
      } catch (error) {
        if (rtTaken(error)) return conflict(res, 'Esta unidade já tem um RT. Peça um novo convite com outro papel.');
        logger.error({ err: error }, 'rafanutri: falha ao aceitar convite da unidade');
        res.status(500).json({ errors: [{ message: 'Não foi possível aceitar o convite agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    // ── Checklists de Boas Práticas e não conformidades (U1a: RN-146 a RN-148, base do RN-153) ──
    // Executam: owner, RT, gestor, cozinheiro e estoquista. O auditor só consulta. As regras de
    // imutabilidade, pontuação e abertura de não conformidade ficam no banco (0035).
    const RUN_ROLES = new Set(['technical_lead', 'manager', 'cook', 'stock_keeper']);
    const canRun = (a) => a.isOwner || a.roles.some((r) => RUN_ROLES.has(r));
    const canSupervise = (a) => a.isOwner || a.roles.includes('manager') || a.roles.includes('technical_lead');
    const runNotFound = (res) => res.status(404).json({ errors: [{ message: 'Checklist não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const runForbidden = (res) => res.status(403).json({ errors: [{ message: 'Seu papel nesta unidade só permite consultar.', extensions: { code: 'FORBIDDEN' } }] });
    const p0001 = (res, error, what) => {
      if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
      logger.error({ err: error }, `rafanutri: falha ao ${what}`);
      return res.status(500).json({ errors: [{ message: 'Não foi possível salvar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    };
    const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
    const userName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || null;

    async function runAccess(user, runId) {
      if (!isUuid(runId)) return null;
      const run = await database('checklist_runs').where('id', runId).first();
      if (!run) return null;
      const a = await unitAccess(user, run.unit_id);
      return a ? { run, a } : null;
    }
    const runOut = (r) => ({
      id: r.id, unit_id: r.unit_id, template_id: r.template_id, template_name: r.template_name, status: r.status,
      started_at: r.started_at, completed_at: r.completed_at, score: numOrNull(r.score),
      conform_count: r.conform_count, non_conform_count: r.non_conform_count, na_count: r.na_count,
      geo_distance_m: r.geo_distance_m,
    });

    router.get('/uan/units/:id/checklists', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const templates = await database('checklist_templates as t')
        .where('t.active', true)
        .where((q) => q.whereNull('t.organization_id').orWhere('t.organization_id', a.unit.organization_id))
        .orderByRaw("t.organization_id is null, case t.category when 'opening' then 1 when 'hygiene' then 2 when 'bpf_audit' then 9 else 5 end, t.name")
        .select('t.id', 't.name', 't.description', 't.category', 't.frequency_hint', database.raw('(t.organization_id is null) as platform'),
          database.raw('(select count(*)::int from checklist_template_items i where i.template_id = t.id) as item_count'),
          database.raw('(select count(*)::int from checklist_template_items i where i.template_id = t.id and i.critical) as critical_count'));
      const runs = await database('checklist_runs as r').leftJoin('directus_users as u', 'u.id', 'r.started_by')
        .where('r.unit_id', a.unit.id).whereNot('r.status', 'cancelled')
        .orderBy('r.started_at', 'desc').limit(20)
        .select('r.*', 'u.first_name', 'u.last_name');
      const ncs = await database('non_conformities').where('unit_id', a.unit.id).whereIn('status', ['open', 'in_progress'])
        .orderBy('due_at').limit(50)
        .select('id', 'title', 'severity', 'status', 'source', 'run_id', 'due_at', 'opened_at');
      const today = (await database.raw('select * from checklist_day(?)', [a.unit.id])).rows
        .map((r) => ({ ...r, at_time: String(r.at_time).slice(0, 5) }));
      const schedules = canSupervise(a)
        ? (await database('checklist_schedules as s').join('checklist_templates as t', 't.id', 's.template_id')
            .where('s.unit_id', a.unit.id).orderBy('s.at_time')
            .select('s.id', 's.template_id', 't.name as template_name', 's.weekdays', 's.at_time', 's.tolerance_minutes', 's.active'))
            .map((r) => ({ ...r, at_time: String(r.at_time).slice(0, 5) }))
        : [];
      res.json({
        data: {
          can_run: canRun(a) && a.unit.active,
          can_manage: canSupervise(a),
          templates: templates.map((t) => ({ ...t, editable: !t.platform && canSupervise(a) })),
          runs: runs.map((r) => ({ ...runOut(r), started_by_name: userName(r), mine: r.started_by === user })),
          non_conformities: ncs,
          today,
          schedules,
        },
      });
    });

    // ── Editor de modelos e agenda (RN-147, RN-150) ──────────────────────────────────────────
    // Copiar e editar: owner da empresa, ou gestor/RT de alguma unidade dela. Biblioteca: só leitura (0038).
    const TEMPLATE_CATEGORIES = new Set(['bpf_audit', 'opening', 'hygiene', 'receiving', 'cleaning', 'temperature', 'pests', 'water', 'other']);
    const FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'on_demand']);
    async function canEditTemplates(user, orgId) {
      const owner = await database('organization_members').where({ organization_id: orgId, user_id: user, role: 'owner' }).first('id');
      if (owner) return true;
      return Boolean(await database('unit_members as m').join('production_units as u', 'u.id', 'm.unit_id')
        .where({ 'u.organization_id': orgId, 'm.user_id': user }).whereIn('m.role', ['manager', 'technical_lead']).first('m.user_id'));
    }
    const templateNotFound = (res) => res.status(404).json({ errors: [{ message: 'Modelo não encontrado.', extensions: { code: 'NOT_FOUND' } }] });

    function templateItems(list) {
      if (!Array.isArray(list) || list.length < 1 || list.length > 200) return { errors: { items: 'O modelo precisa de 1 a 200 itens.' } };
      const items = [];
      for (const [i, it] of list.entries()) {
        const n = i + 1;
        const prompt = typeof it?.prompt === 'string' ? it.prompt.trim() : '';
        if (prompt.length < 3 || prompt.length > 500) return { errors: { items: `Item ${n}: escreva a pergunta (3 a 500 caracteres).` } };
        const kind = it.kind === 'number' ? 'number' : 'compliance';
        const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
        const min = kind === 'number' ? num(it.min_value) : null;
        const max = kind === 'number' ? num(it.max_value) : null;
        if (kind === 'number') {
          if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) return { errors: { items: `Item ${n}: limites inválidos.` } };
          if (min === null && max === null) return { errors: { items: `Item ${n}: informe o mínimo ou o máximo.` } };
          if (min !== null && max !== null && min > max) return { errors: { items: `Item ${n}: o mínimo passa do máximo.` } };
        }
        const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
        const critical = it.critical === true;
        items.push({
          position: n, prompt, section: str(it.section, 120), help: str(it.help, 500), kind,
          unit: kind === 'number' ? str(it.unit, 10) : null, min_value: min, max_value: max,
          critical, photo_on_fail: critical || it.photo_on_fail === true,
        });
      }
      return { items };
    }

    router.post('/uan/units/:id/checklist-templates/copy', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT personalizam modelos.', extensions: { code: 'FORBIDDEN' } }] });
      if (!isUuid(req.body?.template_id)) return bad(res, { template_id: 'Escolha o modelo.' });
      try {
        const id = await withActor(user, async (trx) => (await trx.raw('select checklist_template_copy(?, ?, ?) as id', [req.body.template_id, a.unit.organization_id, user])).rows[0].id);
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'copiar modelo');
      }
    });

    router.get('/uan/checklist-templates/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      if (!isUuid(req.params.id)) return templateNotFound(res);
      const t = await database('checklist_templates').where('id', req.params.id)
        .first('id', 'organization_id', 'name', 'description', 'category', 'frequency_hint', 'active', 'source_template_id', 'updated_at');
      if (!t) return templateNotFound(res);
      const orgs = await uanOrgs(user);
      if (t.organization_id ? !orgs.some((o) => o.id === t.organization_id) : orgs.length === 0) return templateNotFound(res);
      const items = await database('checklist_template_items').where('template_id', t.id).orderBy('position')
        .select('position', 'section', 'prompt', 'help', 'kind', 'unit', 'min_value', 'max_value', 'critical', 'photo_on_fail');
      res.json({
        data: {
          template: { ...t, organization_id: undefined, platform: !t.organization_id },
          can_edit: Boolean(t.organization_id) && (await canEditTemplates(user, t.organization_id)),
          items: items.map((i) => ({ ...i, min_value: numOrNull(i.min_value), max_value: numOrNull(i.max_value) })),
        },
      });
    });

    router.put('/uan/checklist-templates/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      if (!isUuid(req.params.id)) return templateNotFound(res);
      const t = await database('checklist_templates').where('id', req.params.id).first('id', 'organization_id');
      if (!t || !t.organization_id || !(await uanOrgs(user)).some((o) => o.id === t.organization_id)) return templateNotFound(res);
      if (!(await canEditTemplates(user, t.organization_id))) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT editam modelos.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      const errors = {};
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (name.length < 2 || name.length > 120) errors.name = 'Informe o nome (2 a 120 caracteres).';
      const description = typeof b.description === 'string' && b.description.trim() ? b.description.trim() : null;
      if (description && description.length > 500) errors.description = 'Até 500 caracteres.';
      if (!TEMPLATE_CATEGORIES.has(b.category)) errors.category = 'Categoria inválida.';
      if (!FREQUENCIES.has(b.frequency_hint)) errors.frequency_hint = 'Frequência inválida.';
      if (typeof b.active !== 'boolean') errors.active = 'Valor inválido.';
      const parsed = templateItems(b.items);
      if (parsed.errors) Object.assign(errors, parsed.errors);
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        await withActor(user, async (trx) => {
          await trx('checklist_templates').where('id', t.id).update({ name, description, category: b.category, frequency_hint: b.frequency_hint, active: b.active });
          await trx('checklist_template_items').where('template_id', t.id).del();
          await trx('checklist_template_items').insert(parsed.items.map((i) => ({ ...i, template_id: t.id })));
        });
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'salvar modelo');
      }
    });

    router.post('/uan/units/:id/checklist-schedules', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT agendam checklists.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      const errors = {};
      if (!isUuid(b.template_id)) errors.template_id = 'Escolha o modelo.';
      const days = Array.isArray(b.weekdays) ? b.weekdays.map(Number) : [];
      if (!days.length || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) errors.weekdays = 'Escolha ao menos um dia.';
      if (typeof b.at_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.at_time)) errors.at_time = 'Horário inválido.';
      const tol = b.tolerance_minutes === undefined ? 60 : Number(b.tolerance_minutes);
      if (!Number.isInteger(tol) || tol < 15 || tol > 720) errors.tolerance_minutes = 'Tolerância entre 15 e 720 minutos.';
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        const [row] = await withActor(user, (trx) => trx('checklist_schedules')
          .insert({ unit_id: a.unit.id, organization_id: a.unit.organization_id, template_id: b.template_id, weekdays: days, at_time: b.at_time, tolerance_minutes: tol, created_by: user })
          .returning(['id']));
        res.status(201).json({ data: row });
      } catch (error) {
        p0001(res, error, 'agendar checklist');
      }
    });

    router.delete('/uan/checklist-schedules/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const s = isUuid(req.params.id) ? await database('checklist_schedules').where('id', req.params.id).first('id', 'unit_id') : null;
      const a = s ? await unitAccess(user, s.unit_id) : null;
      if (!a) return res.status(404).json({ errors: [{ message: 'Agenda não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT mudam a agenda.', extensions: { code: 'FORBIDDEN' } }] });
      await withActor(user, (trx) => trx('checklist_schedules').where('id', s.id).del());
      res.json({ data: { ok: true } });
    });

    router.post('/uan/units/:id/checklist-runs', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canRun(a)) return runForbidden(res);
      const b = req.body ?? {};
      if (!isUuid(b.template_id) || !isUuid(b.client_id)) return bad(res, { template_id: 'Escolha o checklist.' });
      const lat = numOrNull(b.geo_lat);
      const lng = numOrNull(b.geo_lng);
      const geoOk = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
      const acc = geoOk && Number.isFinite(Number(b.geo_accuracy_m)) ? Math.min(100000, Math.max(0, Math.round(Number(b.geo_accuracy_m)))) : null;
      try {
        const id = await withActor(user, async (trx) => (await trx.raw('select checklist_start(?, ?, ?, ?, ?, ?, ?) as id',
          [a.unit.id, b.template_id, user, b.client_id, geoOk ? Math.round(lat * 1e6) / 1e6 : null, geoOk ? Math.round(lng * 1e6) / 1e6 : null, acc])).rows[0].id);
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'iniciar checklist');
      }
    });

    router.get('/uan/checklist-runs/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await runAccess(user, req.params.id);
      if (!x) return runNotFound(res);
      const answers = await database('checklist_answers').where('run_id', x.run.id).orderBy('position')
        .select('position', 'section', 'prompt', 'help', 'kind', 'unit', 'min_value', 'max_value', 'critical', 'photo_on_fail',
          'value', 'number_value', 'comment', database.raw('(photo is not null) as has_photo'), 'answered_at');
      const [starter, finisher] = await Promise.all([
        x.run.started_by ? database('directus_users').where('id', x.run.started_by).first('first_name', 'last_name') : null,
        x.run.completed_by ? database('directus_users').where('id', x.run.completed_by).first('first_name', 'last_name') : null,
      ]);
      const ncs = x.run.status === 'completed'
        ? await database('non_conformities').where('run_id', x.run.id).select('id', 'answer_position', 'severity', 'status', 'due_at')
        : [];
      res.json({
        data: {
          run: { ...runOut(x.run), started_by_name: userName(starter), completed_by_name: userName(finisher), has_signature: Boolean(x.run.signature) },
          unit: { id: x.a.unit.id, name: x.a.unit.name, geo_radius_m: x.a.unit.geo_radius_m, has_geo: x.a.unit.geo_lat !== null },
          can_answer: x.run.status === 'in_progress' && canRun(x.a),
          can_cancel: x.run.status === 'in_progress' && (x.run.started_by === user || canSupervise(x.a)),
          answers: answers.map((r) => ({ ...r, min_value: numOrNull(r.min_value), max_value: numOrNull(r.max_value), number_value: numOrNull(r.number_value) })),
          non_conformities: ncs,
        },
      });
    });

    async function answerTarget(req, res) {
      const user = requireUser(req, res);
      if (!user) return null;
      const x = await runAccess(user, req.params.id);
      if (!x) { runNotFound(res); return null; }
      if (!canRun(x.a)) { runForbidden(res); return null; }
      const position = Number(req.params.position);
      const ans = Number.isInteger(position) ? await database('checklist_answers').where({ run_id: x.run.id, position }).first('position', 'kind', 'photo') : null;
      if (!ans) { res.status(404).json({ errors: [{ message: 'Item não encontrado.', extensions: { code: 'NOT_FOUND' } }] }); return null; }
      return { user, ...x, ans };
    }

    router.put('/uan/checklist-runs/:id/answers/:position', async (req, res) => {
      const t = await answerTarget(req, res);
      if (!t) return;
      const b = req.body ?? {};
      const patch = { answered_by: t.user };
      if (t.ans.kind === 'number' && b.value !== 'na') {
        const n = Number(b.number_value);
        if (b.number_value === null || b.number_value === undefined || b.number_value === '' || !Number.isFinite(n) || Math.abs(n) >= 1e6) {
          return bad(res, { number_value: 'Informe o valor medido.' });
        }
        patch.number_value = Math.round(n * 100) / 100;
        patch.value = null;
      } else {
        if (!['conform', 'non_conform', 'na'].includes(b.value)) return bad(res, { value: 'Escolha uma resposta.' });
        patch.value = b.value;
      }
      // Modo offline: horário em que a resposta foi dada no aparelho (o banco aceita até 72 h atrás).
      if (typeof b.answered_at === 'string' && !Number.isNaN(Date.parse(b.answered_at))) patch.answered_at = new Date(b.answered_at).toISOString();
      if (b.comment !== undefined) {
        if (b.comment !== null && typeof b.comment !== 'string') return bad(res, { comment: 'Comentário inválido.' });
        const c = typeof b.comment === 'string' ? b.comment.trim() : '';
        if (c.length > 1000) return bad(res, { comment: 'Até 1.000 caracteres.' });
        patch.comment = c || null;
      }
      try {
        const [row] = await withActor(t.user, (trx) => trx('checklist_answers').where({ run_id: t.run.id, position: t.ans.position }).update(patch)
          .returning(['position', 'value', 'number_value', 'comment', database.raw('(photo is not null) as has_photo')]));
        res.json({ data: { ...row, number_value: numOrNull(row.number_value) } });
      } catch (error) {
        p0001(res, error, 'salvar resposta do checklist');
      }
    });

    router.post('/uan/checklist-runs/:id/answers/:position/photo', async (req, res) => {
      const t = await answerTarget(req, res);
      if (!t) return;
      if (t.run.status !== 'in_progress') return conflict(res, 'Checklist concluído ou cancelado não pode ser alterado');
      const img = parseImageDataUrl(req.body?.image);
      if (!img || img.type === 'image/webp') return bad(res, { image: 'Envie a foto em JPG ou PNG de até 600 KB.' });
      let fileId = null;
      try {
        const files = new services.FilesService({ schema: await getSchema(), accountability: null });
        fileId = await files.uploadOne(Readable.from(img.buffer), {
          filename_download: `checklist-${t.run.id}-${t.ans.position}.${img.type === 'image/png' ? 'png' : 'jpg'}`, type: img.type, title: `Evidência ${t.run.id} item ${t.ans.position}`,
        });
        await withActor(t.user, (trx) => trx('checklist_answers').where({ run_id: t.run.id, position: t.ans.position }).update({ photo: fileId, answered_by: t.user }));
        if (t.ans.photo) await files.deleteOne(t.ans.photo).catch(() => {});
        res.json({ data: { has_photo: true } });
      } catch (error) {
        if (fileId) await new services.FilesService({ schema: await getSchema(), accountability: null }).deleteOne(fileId).catch(() => {});
        p0001(res, error, 'salvar foto do checklist');
      }
    });

    router.get('/uan/checklist-runs/:id/answers/:position/photo', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await runAccess(user, req.params.id);
      const position = Number(req.params.position);
      const ans = x && Number.isInteger(position) ? await database('checklist_answers').where({ run_id: x.run.id, position }).first('photo') : null;
      if (!ans?.photo) return res.status(404).json({ errors: [{ message: 'Foto não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
      try {
        const assets = new services.AssetsService({ schema: await getSchema(), accountability: null });
        const { stream, file } = await assets.getAsset(ans.photo);
        res.setHeader('Content-Type', file.type ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        stream.pipe(res);
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao ler foto do checklist');
        res.status(404).json({ errors: [{ message: 'Foto não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
      }
    });

    // Assinatura (PNG desenhado no aparelho), só com o checklist em andamento.
    router.post('/uan/checklist-runs/:id/signature', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await runAccess(user, req.params.id);
      if (!x) return runNotFound(res);
      if (!canRun(x.a)) return runForbidden(res);
      if (x.run.status !== 'in_progress') return conflict(res, 'Checklist concluído ou cancelado não pode ser alterado');
      const img = parseImageDataUrl(req.body?.image);
      if (!img || img.type !== 'image/png') return bad(res, { image: 'Assinatura inválida.' });
      let fileId = null;
      try {
        const files = new services.FilesService({ schema: await getSchema(), accountability: null });
        fileId = await files.uploadOne(Readable.from(img.buffer), { filename_download: `assinatura-${x.run.id}.png`, type: 'image/png', title: `Assinatura ${x.run.id}` });
        await withActor(user, (trx) => trx('checklist_runs').where('id', x.run.id).update({ signature: fileId, signed_by: user }));
        if (x.run.signature) await files.deleteOne(x.run.signature).catch(() => {});
        res.json({ data: { has_signature: true } });
      } catch (error) {
        await dropFile(fileId);
        p0001(res, error, 'salvar assinatura');
      }
    });

    router.get('/uan/checklist-runs/:id/signature', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await runAccess(user, req.params.id);
      if (!x?.run.signature) return res.status(404).json({ errors: [{ message: 'Assinatura não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
      try {
        const assets = new services.AssetsService({ schema: await getSchema(), accountability: null });
        const { stream } = await assets.getAsset(x.run.signature);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        stream.pipe(res);
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao ler assinatura');
        res.status(404).json({ errors: [{ message: 'Assinatura não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
      }
    });

    router.post('/uan/checklist-runs/:id/complete', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await runAccess(user, req.params.id);
      if (!x) return runNotFound(res);
      if (!canRun(x.a)) return runForbidden(res);
      try {
        const run = await withActor(user, async (trx) => (await trx.raw('select * from checklist_complete(?, ?)', [x.run.id, user])).rows[0]);
        const ncs = await database('non_conformities').where('run_id', x.run.id).count('* as n').first();
        res.json({ data: { ...runOut(run), non_conformities_opened: Number(ncs?.n ?? 0) } });
      } catch (error) {
        p0001(res, error, 'concluir checklist');
      }
    });

    router.post('/uan/checklist-runs/:id/cancel', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await runAccess(user, req.params.id);
      if (!x) return runNotFound(res);
      if (!(x.run.started_by === user && canRun(x.a)) && !canSupervise(x.a)) return runForbidden(res);
      try {
        await withActor(user, (trx) => trx('checklist_runs').where('id', x.run.id).update({ status: 'cancelled' }));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'cancelar checklist');
      }
    });

    // ── Equipamentos e temperaturas (RN-151, base do RN-152) ─────────────────────────────────
    // Cadastram e ajustam limites: owner, gestor e RT. Registram: quem executa checklists.
    // Limites padrão, ação corretiva obrigatória, imutabilidade e NC por leituras seguidas: banco (0036).
    const EQUIPMENT_KINDS = new Set(['refrigerator', 'freezer', 'cold_room', 'freezer_room', 'hot_holding', 'cold_holding', 'other']);
    const FOOD_STAGES = new Set(['cooking', 'reheating', 'holding_hot', 'holding_cold', 'cooling']);
    const EQUIPMENT_FIELDS = ['id', 'unit_id', 'name', 'kind', 'min_temp', 'max_temp', 'reading_interval_hours', 'active', 'created_at'];
    const READING_FIELDS = ['id', 'equipment_id', 'food_stage', 'food_name', 'value', 'min_temp', 'max_temp', 'out_of_range', 'corrective_action', 'source', 'recorded_at', 'non_conformity_id'];
    const tempOut = (r) => ({ ...r, value: numOrNull(r.value), min_temp: numOrNull(r.min_temp), max_temp: numOrNull(r.max_temp) });
    const equipmentNotFound = (res) => res.status(404).json({ errors: [{ message: 'Equipamento não encontrado.', extensions: { code: 'NOT_FOUND' } }] });

    function equipmentBody(b, partial) {
      const errors = {};
      const data = {};
      if (!partial || b.name !== undefined) {
        const name = typeof b.name === 'string' ? b.name.trim() : '';
        if (name.length < 2 || name.length > 80) errors.name = 'Informe o nome (2 a 80 caracteres).';
        data.name = name;
      }
      if (!partial || b.kind !== undefined) {
        if (!EQUIPMENT_KINDS.has(b.kind)) errors.kind = 'Tipo inválido.';
        data.kind = b.kind;
      }
      for (const k of ['min_temp', 'max_temp']) {
        if (b[k] === undefined) continue;
        if (b[k] === null || b[k] === '') { data[k] = null; continue; }
        const n = Number(b[k]);
        if (!Number.isFinite(n) || n < -60 || n > 300) errors[k] = 'Temperatura entre -60 e 300 °C.';
        else data[k] = Math.round(n * 10) / 10;
      }
      if (data.min_temp !== undefined && data.max_temp !== undefined) {
        if (data.min_temp === null && data.max_temp === null && (data.kind === 'other' || partial)) errors.max_temp = 'Informe ao menos um limite.';
        if (data.min_temp !== null && data.max_temp !== null && data.min_temp > data.max_temp) errors.max_temp = 'O máximo precisa ser maior que o mínimo.';
      }
      if (b.reading_interval_hours !== undefined) {
        const h = Number(b.reading_interval_hours);
        if (!Number.isInteger(h) || h < 1 || h > 168) errors.reading_interval_hours = 'Intervalo entre 1 e 168 horas.';
        else data.reading_interval_hours = h;
      }
      if (b.active !== undefined) {
        if (typeof b.active !== 'boolean') errors.active = 'Valor inválido.';
        else data.active = b.active;
      }
      return Object.keys(errors).length ? { errors } : { data };
    }
    const dbCheck = (res, error, what) => {
      if (error?.code === '23514') return bad(res, { max_temp: 'Revise os limites de temperatura.' });
      return p0001(res, error, what);
    };

    async function equipmentAccess(user, id) {
      if (!isUuid(id)) return null;
      const eq = await database('equipment').where('id', id).first(...EQUIPMENT_FIELDS);
      if (!eq) return null;
      const a = await unitAccess(user, eq.unit_id);
      return a ? { eq: tempOut(eq), a } : null;
    }
    /** Última leitura de cada equipamento e se está atrasada (mais velha que o intervalo). */
    async function withLastReading(list) {
      if (!list.length) return [];
      const last = await database.raw(
        `select distinct on (equipment_id) equipment_id, value, out_of_range, recorded_at from temperature_readings
          where equipment_id = any(?) order by equipment_id, recorded_at desc, seq desc`, [list.map((e) => e.id)]);
      const byId = new Map(last.rows.map((r) => [r.equipment_id, r]));
      const now = Date.now();
      return list.map((e) => {
        const r = byId.get(e.id);
        return {
          ...tempOut(e),
          last: r ? { value: numOrNull(r.value), out_of_range: r.out_of_range, recorded_at: r.recorded_at } : null,
          overdue: e.active && (!r || now - new Date(r.recorded_at).getTime() > e.reading_interval_hours * 3600e3),
        };
      });
    }

    router.get('/uan/units/:id/temperatures', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const list = await database('equipment').where('unit_id', a.unit.id).orderBy([{ column: 'active', order: 'desc' }, { column: 'name' }]).select(...EQUIPMENT_FIELDS);
      const food = await database('temperature_readings').where('unit_id', a.unit.id).whereNull('equipment_id')
        .orderBy('recorded_at', 'desc').limit(10).select(...READING_FIELDS);
      res.json({
        data: {
          can_record: canRun(a) && a.unit.active,
          can_manage: canSupervise(a),
          equipment: await withLastReading(list),
          food_readings: food.map(tempOut),
        },
      });
    });

    router.post('/uan/units/:id/equipment', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT cadastram equipamentos.', extensions: { code: 'FORBIDDEN' } }] });
      const parsed = equipmentBody(req.body ?? {}, false);
      if (parsed.errors) return bad(res, parsed.errors);
      try {
        const [row] = await withActor(user, (trx) => trx('equipment').insert({ ...parsed.data, unit_id: a.unit.id, organization_id: a.unit.organization_id }).returning(EQUIPMENT_FIELDS));
        res.status(201).json({ data: tempOut(row) });
      } catch (error) {
        dbCheck(res, error, 'cadastrar equipamento');
      }
    });

    router.get('/uan/equipment/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await equipmentAccess(user, req.params.id);
      if (!x) return equipmentNotFound(res);
      const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
      const readings = await database('temperature_readings as t').leftJoin('directus_users as u', 'u.id', 't.recorded_by')
        .where('t.equipment_id', x.eq.id).where('t.recorded_at', '>', database.raw(`now() - interval '${days} days'`))
        .orderBy([{ column: 't.recorded_at', order: 'desc' }, { column: 't.seq', order: 'desc' }]).limit(500)
        .select(...READING_FIELDS.map((f) => `t.${f}`), 'u.first_name', 'u.last_name');
      const [withLast] = await withLastReading([x.eq]);
      res.json({
        data: {
          equipment: withLast,
          unit: { id: x.a.unit.id, name: x.a.unit.name, active: x.a.unit.active },
          can_record: canRun(x.a) && x.a.unit.active && x.eq.active,
          can_manage: canSupervise(x.a),
          days,
          readings: readings.map((r) => ({ ...tempOut(r), recorded_by_name: userName(r), first_name: undefined, last_name: undefined })),
        },
      });
    });

    router.put('/uan/equipment/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await equipmentAccess(user, req.params.id);
      if (!x) return equipmentNotFound(res);
      if (!canSupervise(x.a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT alteram equipamentos.', extensions: { code: 'FORBIDDEN' } }] });
      const parsed = equipmentBody({ min_temp: x.eq.min_temp, max_temp: x.eq.max_temp, ...(req.body ?? {}) }, true);
      if (parsed.errors) return bad(res, parsed.errors);
      try {
        const [row] = await withActor(user, (trx) => trx('equipment').where('id', x.eq.id).update(parsed.data).returning(EQUIPMENT_FIELDS));
        res.json({ data: tempOut(row) });
      } catch (error) {
        dbCheck(res, error, 'alterar equipamento');
      }
    });

    router.post('/uan/units/:id/temperatures', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canRun(a)) return runForbidden(res);
      const b = req.body ?? {};
      if (!isUuid(b.client_id)) return bad(res, { value: 'Registro inválido.' });
      const existing = await database('temperature_readings').where('client_id', b.client_id).first(...READING_FIELDS, 'unit_id');
      if (existing) {
        if (existing.unit_id !== a.unit.id) return conflict(res, 'Identificador de registro já usado.');
        return res.json({ data: tempOut({ ...existing, unit_id: undefined }) });
      }
      const value = Number(b.value);
      const errors = {};
      if (b.value === null || b.value === undefined || b.value === '' || !Number.isFinite(value) || value < -60 || value > 300) errors.value = 'Informe a temperatura medida (-60 a 300 °C).';
      const row = { unit_id: a.unit.id, value: Math.round(value * 10) / 10, client_id: b.client_id, recorded_by: user, source: 'manual' };
      if (b.equipment_id !== undefined && b.equipment_id !== null) {
        if (!isUuid(b.equipment_id)) errors.equipment_id = 'Equipamento inválido.';
        else {
          const eq = await database('equipment').where({ id: b.equipment_id, unit_id: a.unit.id }).first('id');
          if (!eq) return equipmentNotFound(res);
          row.equipment_id = eq.id;
        }
      } else {
        if (!FOOD_STAGES.has(b.food_stage)) errors.food_stage = 'Escolha a etapa.';
        const name = typeof b.food_name === 'string' ? b.food_name.trim() : '';
        if (name.length < 2 || name.length > 120) errors.food_name = 'Informe o alimento ou a preparação.';
        row.food_stage = b.food_stage;
        row.food_name = name;
      }
      if (b.corrective_action !== undefined && b.corrective_action !== null) {
        if (typeof b.corrective_action !== 'string' || b.corrective_action.length > 1000) errors.corrective_action = 'Até 1.000 caracteres.';
        else row.corrective_action = b.corrective_action;
      }
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        const [saved] = await withActor(user, (trx) => trx('temperature_readings').insert(row).returning(READING_FIELDS));
        const fresh = await database('temperature_readings').where('id', saved.id).first(...READING_FIELDS);
        res.status(201).json({ data: tempOut(fresh) });
      } catch (error) {
        if (error?.code === 'P0001' && /ação corretiva/.test(error.message ?? '')) return bad(res, { corrective_action: 'Temperatura fora do limite: registre a ação corretiva.' });
        p0001(res, error, 'registrar temperatura');
      }
    });

    // ── Não conformidades e plano de ação 5W2H (RN-153, RN-154) ──────────────────────────────
    // Ver: equipe da unidade. Abrir manualmente: quem executa. Planejar e apagar plano pendente: owner,
    // gestor e RT. Concluir plano: o responsável ou quem supervisiona. Fechar (eficácia, com foto): owner ou RT.
    const NC_FIELDS = ['id', 'unit_id', 'source', 'run_id', 'answer_position', 'equipment_id', 'title', 'description', 'severity', 'status', 'due_at', 'opened_at', 'closed_at', 'closing_note'];
    const PLAN_FIELDS = ['id', 'non_conformity_id', 'what', 'why', 'where_', 'due_date', 'who_user', 'who_text', 'how', 'how_much_cents', 'status', 'done_note', 'done_at', 'created_at'];
    const NC_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
    const ncNotFound = (res) => res.status(404).json({ errors: [{ message: 'Não conformidade não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
    const canClose = (a) => a.isOwner || a.roles.includes('technical_lead');
    const dateOut = (d) => (d ? String(d instanceof Date ? d.toISOString() : d).slice(0, 10) : null);

    async function ncAccess(user, id) {
      if (!isUuid(id)) return null;
      const nc = await database('non_conformities').where('id', id).first(...NC_FIELDS, 'photo', 'closing_photo', 'opened_by', 'closed_by');
      if (!nc) return null;
      const a = await unitAccess(user, nc.unit_id);
      return a ? { nc, a } : null;
    }
    async function uploadEvidence(image, name) {
      const img = parseImageDataUrl(image);
      if (!img || img.type === 'image/webp') return null;
      const files = new services.FilesService({ schema: await getSchema(), accountability: null });
      return files.uploadOne(Readable.from(img.buffer), { filename_download: `${name}.${img.type === 'image/png' ? 'png' : 'jpg'}`, type: img.type, title: name });
    }
    async function dropFile(id) {
      if (id) await new services.FilesService({ schema: await getSchema(), accountability: null }).deleteOne(id).catch(() => {});
    }

    router.get('/uan/units/:id/non-conformities', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const rows = await database('non_conformities as n')
        .where('n.unit_id', a.unit.id)
        .where((q) => q.whereNot('n.status', 'closed').orWhere('n.closed_at', '>', database.raw("now() - interval '30 days'")))
        .orderBy([{ column: 'n.due_at' }])
        .limit(300)
        .select(...NC_FIELDS.map((f) => `n.${f}`), database.raw('(n.photo is not null) as has_photo'),
          database.raw("(select count(*)::int from action_plans p where p.non_conformity_id = n.id) as plan_count"),
          database.raw("(select count(*)::int from action_plans p where p.non_conformity_id = n.id and p.status = 'done') as plans_done"));
      res.json({ data: { unit: { id: a.unit.id, name: a.unit.name }, can_open: canRun(a) && a.unit.active, can_plan: canSupervise(a), can_close: canClose(a), items: rows } });
    });

    router.post('/uan/units/:id/non-conformities', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canRun(a)) return runForbidden(res);
      const b = req.body ?? {};
      const title = typeof b.title === 'string' ? b.title.trim() : '';
      const description = typeof b.description === 'string' && b.description.trim() ? b.description.trim() : null;
      const errors = {};
      if (title.length < 3 || title.length > 500) errors.title = 'Descreva o problema (3 a 500 caracteres).';
      if (description && description.length > 2000) errors.description = 'Até 2.000 caracteres.';
      if (!NC_SEVERITIES.has(b.severity)) errors.severity = 'Escolha a gravidade.';
      if (b.image !== undefined && b.image !== null && !parseImageDataUrl(b.image)) errors.image = 'Envie a foto em JPG ou PNG de até 600 KB.';
      if (Object.keys(errors).length) return bad(res, errors);
      let photo = null;
      try {
        if (b.image) photo = await uploadEvidence(b.image, `nc-${a.unit.id}-${Date.now()}`);
        const [row] = await withActor(user, (trx) => trx('non_conformities')
          .insert({ unit_id: a.unit.id, organization_id: a.unit.organization_id, source: 'manual', title, description, severity: b.severity, due_at: null, photo, opened_by: user })
          .returning(NC_FIELDS));
        res.status(201).json({ data: row });
      } catch (error) {
        await dropFile(photo);
        p0001(res, error, 'abrir não conformidade');
      }
    });

    router.get('/uan/non-conformities/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await ncAccess(user, req.params.id);
      if (!x) return ncNotFound(res);
      const plans = await database('action_plans as p').leftJoin('directus_users as u', 'u.id', 'p.who_user')
        .where('p.non_conformity_id', x.nc.id).orderBy('p.created_at')
        .select(...PLAN_FIELDS.map((f) => `p.${f}`), 'u.first_name', 'u.last_name');
      const people = await database('directus_users').whereIn('id', [x.nc.opened_by, x.nc.closed_by].filter(Boolean)).select('id', 'first_name', 'last_name');
      const nameOf = (id) => userName(people.find((p) => p.id === id));
      const team = canSupervise(x.a)
        ? await database('unit_members as m').join('directus_users as u', 'u.id', 'm.user_id').where('m.unit_id', x.a.unit.id)
            .distinct('u.id', 'u.first_name', 'u.last_name', 'u.email').orderBy('u.first_name')
        : [];
      const equipment = x.nc.equipment_id ? await database('equipment').where('id', x.nc.equipment_id).first('id', 'name') : null;
      res.json({
        data: {
          nc: {
            ...x.nc, photo: undefined, closing_photo: undefined, opened_by: undefined, closed_by: undefined,
            has_photo: Boolean(x.nc.photo), has_closing_photo: Boolean(x.nc.closing_photo),
            opened_by_name: nameOf(x.nc.opened_by), closed_by_name: nameOf(x.nc.closed_by), equipment,
          },
          unit: { id: x.a.unit.id, name: x.a.unit.name },
          can_plan: x.nc.status !== 'closed' && canSupervise(x.a),
          can_close: x.nc.status === 'resolved' && canClose(x.a),
          plans: plans.map((p) => ({
            ...p, due_date: dateOut(p.due_date), who_name: userName(p) ?? p.who_text, first_name: undefined, last_name: undefined,
            can_complete: p.status === 'planned' && x.nc.status !== 'closed' && canRun(x.a) && (p.who_user === user || canSupervise(x.a)),
          })),
          team: team.map((t) => ({ id: t.id, name: userName(t) ?? t.email })),
        },
      });
    });

    router.get('/uan/non-conformities/:id/photo/:which', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await ncAccess(user, req.params.id);
      const file = x ? (req.params.which === 'closing' ? x.nc.closing_photo : x.nc.photo) : null;
      if (!file) return res.status(404).json({ errors: [{ message: 'Foto não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
      try {
        const assets = new services.AssetsService({ schema: await getSchema(), accountability: null });
        const { stream, file: meta } = await assets.getAsset(file);
        res.setHeader('Content-Type', meta.type ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        stream.pipe(res);
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao ler foto da não conformidade');
        res.status(404).json({ errors: [{ message: 'Foto não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
      }
    });

    router.post('/uan/non-conformities/:id/plans', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await ncAccess(user, req.params.id);
      if (!x) return ncNotFound(res);
      if (!canSupervise(x.a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT planejam ações.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
      const errors = {};
      const what = typeof b.what === 'string' ? b.what.trim() : '';
      if (what.length < 3 || what.length > 500) errors.what = 'Descreva a ação (o quê).';
      if (!isIsoDate(b.due_date)) errors.due_date = 'Informe o prazo (quando).';
      let whoUser = null;
      if (b.who_user) {
        const member = isUuid(b.who_user) && (await database('unit_members').where({ unit_id: x.a.unit.id, user_id: b.who_user }).first('user_id'));
        if (!member) errors.who_user = 'Escolha alguém da equipe da unidade.';
        else whoUser = b.who_user;
      }
      const whoText = str(b.who_text, 120);
      if (!whoUser && !whoText) errors.who_user = 'Informe o responsável (quem).';
      let cents = null;
      if (b.how_much !== undefined && b.how_much !== null && b.how_much !== '') {
        const n = Number(String(b.how_much).replace(',', '.'));
        if (!Number.isFinite(n) || n < 0 || n > 1_000_000) errors.how_much = 'Valor inválido.';
        else cents = Math.round(n * 100);
      }
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        const [row] = await withActor(user, (trx) => trx('action_plans').insert({
          non_conformity_id: x.nc.id, organization_id: x.nc.organization_id ?? x.a.unit.organization_id, what, why: str(b.why, 1000), where_: str(b.where, 200),
          due_date: b.due_date, who_user: whoUser, who_text: whoUser ? null : whoText, how: str(b.how, 1000), how_much_cents: cents, created_by: user,
        }).returning(PLAN_FIELDS));
        res.status(201).json({ data: { ...row, due_date: dateOut(row.due_date) } });
      } catch (error) {
        p0001(res, error, 'criar plano de ação');
      }
    });

    async function planAccess(user, id) {
      if (!isUuid(id)) return null;
      const plan = await database('action_plans').where('id', id).first('id', 'non_conformity_id', 'who_user', 'status');
      if (!plan) return null;
      const x = await ncAccess(user, plan.non_conformity_id);
      return x ? { plan, ...x } : null;
    }

    router.post('/uan/action-plans/:id/done', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await planAccess(user, req.params.id);
      if (!x) return res.status(404).json({ errors: [{ message: 'Plano não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      if (!canRun(x.a) || (x.plan.who_user !== user && !canSupervise(x.a))) return res.status(403).json({ errors: [{ message: 'Só o responsável pela ação ou quem supervisiona marca como feita.', extensions: { code: 'FORBIDDEN' } }] });
      const note = typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 1000) : null;
      try {
        await withActor(user, (trx) => trx('action_plans').where('id', x.plan.id).update({ status: 'done', done_by: user, done_note: note }));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'concluir plano de ação');
      }
    });

    router.delete('/uan/action-plans/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await planAccess(user, req.params.id);
      if (!x) return res.status(404).json({ errors: [{ message: 'Plano não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      if (!canSupervise(x.a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT apagam ações.', extensions: { code: 'FORBIDDEN' } }] });
      try {
        await withActor(user, (trx) => trx('action_plans').where('id', x.plan.id).del());
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'apagar plano de ação');
      }
    });

    router.post('/uan/non-conformities/:id/close', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await ncAccess(user, req.params.id);
      if (!x) return ncNotFound(res);
      if (!canClose(x.a)) return res.status(403).json({ errors: [{ message: 'Só o RT ou o responsável pela empresa fecham não conformidades.', extensions: { code: 'FORBIDDEN' } }] });
      const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
      if (note.length < 3) return bad(res, { note: 'Descreva a verificação de eficácia.' });
      if (!parseImageDataUrl(req.body?.image)) return bad(res, { image: 'Anexe a foto da evidência (JPG ou PNG de até 600 KB).' });
      let photo = null;
      try {
        photo = await uploadEvidence(req.body.image, `nc-${x.nc.id}-fechamento`);
        if (!photo) return bad(res, { image: 'Anexe a foto da evidência (JPG ou PNG de até 600 KB).' });
        const row = await withActor(user, async (trx) => (await trx.raw('select * from nc_close(?, ?, ?, ?)', [x.nc.id, user, note, photo])).rows[0]);
        res.json({ data: { id: row.id, status: row.status, closed_at: row.closed_at } });
      } catch (error) {
        await dropFile(photo);
        p0001(res, error, 'fechar não conformidade');
      }
    });

    // ── Painel de conformidade (RN-165) ──────────────────────────────────────────────────────
    // Índice por unidade ativa (fórmula em uan_compliance, 0039). O owner vê todas as unidades da empresa;
    // a equipe, só as unidades em que tem papel.
    // Pendências documentais da unidade (fora do índice): POPs obrigatórios sem versão aprovada, documentos
    // com revisão vencida, licenças vencidas e pessoas da equipe sem treinamento há 12 meses.
    async function legalPending(unitId) {
      const r = (await database.raw(
        `select
           4 - (select count(distinct d.code) from quality_documents d join quality_document_current c on c.document_id = d.id
                 where d.unit_id = :u and not d.archived and d.code in ('pop-higienizacao', 'pop-agua', 'pop-pragas', 'pop-manipuladores'))::int as pops_missing,
           (select count(*) from quality_documents d join quality_document_current c on c.document_id = d.id
             where d.unit_id = :u and not d.archived and c.next_review_on < (now() at time zone 'America/Sao_Paulo')::date)::int as docs_overdue,
           ((select count(*) from unit_licenses l where l.unit_id = :u and not l.archived and l.valid_until < (now() at time zone 'America/Sao_Paulo')::date)
             + (select count(*) from production_units pu where pu.id = :u and pu.sanitary_license_expires_at < (now() at time zone 'America/Sao_Paulo')::date))::int as licenses_expired,
           (select count(distinct m.user_id) from unit_members m where m.unit_id = :u and not exists (
              select 1 from training_attendees a join trainings t on t.id = a.training_id
               where a.user_id = m.user_id and t.unit_id = :u and t.held_on > (now() at time zone 'America/Sao_Paulo')::date - interval '12 months'))::int as training_overdue`,
        { u: unitId })).rows[0];
      return r;
    }

    router.get('/uan/compliance', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
      const out = [];
      for (const o of await uanOrgs(user)) {
        let q = database('production_units').where({ organization_id: o.id, active: true }).orderBy('name');
        if (!o.is_owner) q = q.whereIn('id', database('unit_members').where('user_id', user).select('unit_id'));
        const units = await q.select('id', 'name', 'kind');
        const rows = [];
        for (const u of units) {
          const c = (await database.raw('select uan_compliance(?, ?) as c', [u.id, days])).rows[0].c;
          rows.push({ ...u, ...c, index: c.index === null ? null : Number(c.index), legal: await legalPending(u.id) });
        }
        out.push({ id: o.id, name: o.name, is_owner: o.is_owner, units: rows });
      }
      res.json({ data: { days, organizations: out } });
    });

    // ── Insumos, fornecedores e preços (U2a: RN-125 a RN-128) ───────────────────────────────
    // Da empresa (compartilhados pelas unidades). Veem: owner e equipe de alguma unidade. Cadastram e
    // registram preço: owner, gestor, RT e estoquista. Regras de dados no banco (0042).
    const ING_CATEGORIES = new Set(['produce', 'meat', 'dairy', 'grains', 'bakery', 'beverages', 'frozen', 'grocery', 'cleaning', 'disposables', 'other']);
    const PURCHASE_UNITS = new Set(['kg', 'g', 'l', 'ml', 'un', 'dz', 'cx', 'pct']);
    const STORAGES = new Set(['ambient', 'chilled', 'frozen']);
    const ALLERGENS = new Set(['gluten', 'crustaceans', 'eggs', 'fish', 'peanut', 'soy', 'milk', 'lactose', 'almond', 'hazelnut', 'cashew', 'brazil_nut', 'macadamia', 'walnut', 'pecan', 'pistachio', 'pine_nut', 'chestnut', 'latex']);
    const ING_FIELDS = ['id', 'organization_id', 'name', 'category', 'food_id', 'default_fc', 'purchase_unit', 'density_g_ml', 'unit_weight_g', 'pack_grams', 'storage', 'min_stock', 'allergens', 'added_sugar_g_100g', 'active', 'created_at'];
    const SUP_FIELDS = ['id', 'organization_id', 'name', 'cnpj', 'contact_name', 'phone', 'email', 'notes', 'active', 'created_at'];
    const CATALOG_ROLES = new Set(['manager', 'technical_lead', 'stock_keeper']);
    const ingOut = (r) => ({ ...r, added_sugar_g_100g: numOrNull(r.added_sugar_g_100g), default_fc: numOrNull(r.default_fc), density_g_ml: numOrNull(r.density_g_ml), unit_weight_g: numOrNull(r.unit_weight_g), pack_grams: numOrNull(r.pack_grams), min_stock: numOrNull(r.min_stock) });
    const notFoundMsg = (res, what) => res.status(404).json({ errors: [{ message: `${what} não encontrado.`, extensions: { code: 'NOT_FOUND' } }] });

    /** Acesso à empresa no módulo UAN: null se não atua nela; senão, se pode mexer no catálogo. */
    async function catalogAccess(user, orgId) {
      if (!isUuid(orgId)) return null;
      const org = (await uanOrgs(user)).find((o) => o.id === orgId);
      if (!org) return null;
      if (org.is_owner) return { orgId, canManage: true };
      const roles = await database('unit_members as m').join('production_units as u', 'u.id', 'm.unit_id').where({ 'u.organization_id': orgId, 'm.user_id': user }).pluck('m.role');
      return { orgId, canManage: roles.some((r) => CATALOG_ROLES.has(r)) };
    }
    const catalogForbidden = (res) => res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor, o RT ou o estoquista mexem no cadastro.', extensions: { code: 'FORBIDDEN' } }] });

    function ingredientBody(b) {
      const errors = {};
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (name.length < 2 || name.length > 120) errors.name = 'Informe o nome (2 a 120 caracteres).';
      if (!ING_CATEGORIES.has(b.category)) errors.category = 'Categoria inválida.';
      if (!PURCHASE_UNITS.has(b.purchase_unit)) errors.purchase_unit = 'Unidade inválida.';
      if (!STORAGES.has(b.storage)) errors.storage = 'Armazenamento inválido.';
      const num = (v) => (v === null || v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));
      const fc = num(b.default_fc) ?? 1;
      if (!Number.isFinite(fc) || fc < 1 || fc > 20) errors.default_fc = 'O fator de correção vai de 1 a 20.';
      const density = num(b.density_g_ml);
      if (density !== null && (!Number.isFinite(density) || density < 0.1 || density > 5)) errors.density_g_ml = 'Densidade entre 0,1 e 5 g/mL.';
      const unitW = num(b.unit_weight_g);
      if (unitW !== null && (!Number.isFinite(unitW) || unitW <= 0)) errors.unit_weight_g = 'Peso inválido.';
      const pack = num(b.pack_grams);
      if (pack !== null && (!Number.isFinite(pack) || pack <= 0)) errors.pack_grams = 'Peso inválido.';
      if (['un', 'dz'].includes(b.purchase_unit) && unitW === null) errors.unit_weight_g = 'Informe o peso da unidade em gramas.';
      if (['cx', 'pct'].includes(b.purchase_unit) && pack === null) errors.pack_grams = 'Informe o peso da embalagem em gramas.';
      const minStock = num(b.min_stock);
      if (minStock !== null && (!Number.isFinite(minStock) || minStock < 0)) errors.min_stock = 'Estoque mínimo inválido.';
      const allergens = Array.isArray(b.allergens) ? [...new Set(b.allergens)] : [];
      if (allergens.some((a) => !ALLERGENS.has(a))) errors.allergens = 'Alergênico inválido.';
      const foodId = b.food_id === null || b.food_id === undefined || b.food_id === '' ? null : Number(b.food_id);
      if (foodId !== null && !Number.isInteger(foodId)) errors.food_id = 'Alimento inválido.';
      if (b.active !== undefined && typeof b.active !== 'boolean') errors.active = 'Valor inválido.';
      const addedSugar = num(b.added_sugar_g_100g);
      if (addedSugar !== null && (!Number.isFinite(addedSugar) || addedSugar < 0 || addedSugar > 100)) errors.added_sugar_g_100g = 'Açúcares adicionados de 0 a 100 g por 100 g.';
      if (Object.keys(errors).length) return { errors };
      return { data: { name, category: b.category, purchase_unit: b.purchase_unit, storage: b.storage, default_fc: fc, density_g_ml: density, unit_weight_g: unitW, pack_grams: pack, min_stock: minStock, allergens, food_id: foodId, ...(b.added_sugar_g_100g === undefined ? {} : { added_sugar_g_100g: addedSugar }), ...(b.active === undefined ? {} : { active: b.active }) } };
    }
    async function publicFood(id) {
      return id === null ? true : Boolean(await database('foods').where({ id }).whereNull('organization_id').first('id'));
    }
    const catalogDbError = (res, error, what) => {
      if (error?.code === '23505') return conflict(res, 'Já existe um cadastro com esse nome.');
      if (error?.code === '23514') return bad(res, { name: 'Revise os campos.' });
      return p0001(res, error, what);
    };

    router.get('/uan/foods', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      if (!(await uanOrgs(user)).length) return res.json({ data: [] });
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
      if (q.length < 2) return res.json({ data: [] });
      const rows = (await database.raw('select id, name, food_group, source from search_foods(?, null, 12)', [q])).rows;
      res.json({ data: rows });
    });

    router.get('/uan/organizations/:id/ingredients', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const acc = await catalogAccess(user, req.params.id);
      if (!acc) return notFoundMsg(res, 'Empresa');
      let q = database('ingredients as i').leftJoin('foods as f', 'f.id', 'i.food_id').where('i.organization_id', acc.orgId).orderBy('i.name').limit(500);
      if (typeof req.query.q === 'string' && req.query.q.trim()) q = q.whereRaw('f_unaccent(lower(i.name)) like f_unaccent(lower(?))', [`%${req.query.q.trim().slice(0, 80)}%`]);
      if (ING_CATEGORIES.has(req.query.category)) q = q.where('i.category', req.query.category);
      // Situação: em uso (active), fora de uso (inactive) ou todos (padrão, compatível com chamadas antigas).
      if (req.query.status === 'active') q = q.where('i.active', true);
      else if (req.query.status === 'inactive') q = q.where('i.active', false);
      const counts = await database('ingredients').where('organization_id', acc.orgId)
        .select(database.raw('count(*) filter (where active)::int as active'), database.raw('count(*) filter (where not active)::int as inactive')).first();
      const rows = await q.select(...ING_FIELDS.map((f) => `i.${f}`), 'f.name as food_name',
        database.raw('(select p.price_cents from ingredient_price_at(i.id) p) as price_cents'),
        database.raw('(select p.valid_from from ingredient_price_at(i.id) p) as price_valid_from'));
      const org = await database('organizations').where('id', acc.orgId).first('id', 'name');
      res.json({ data: { organization: org, can_manage: acc.canManage, counts: { active: counts?.active ?? 0, inactive: counts?.inactive ?? 0 }, starter_size: STARTER_INGREDIENTS.length, items: rows.map((r) => ({ ...ingOut(r), price_valid_from: dateOut(r.price_valid_from) })) } });
    });

    // Catálogo básico: cadastra os insumos comuns que a empresa ainda não tem (pelo nome). Pode repetir sem duplicar.
    router.post('/uan/organizations/:id/ingredients/starter', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const acc = await catalogAccess(user, req.params.id);
      if (!acc) return notFoundMsg(res, 'Empresa');
      if (!acc.canManage) return catalogForbidden(res);
      try {
        const existing = await database('ingredients').where('organization_id', acc.orgId).pluck('name');
        const rows = missingStarter(existing).map((i) => ingredientBody(i)).filter((r) => r.data).map((r) => ({ ...r.data, organization_id: acc.orgId }));
        if (rows.length) await withActor(user, (trx) => trx('ingredients').insert(rows));
        res.status(201).json({ data: { added: rows.length, skipped: STARTER_INGREDIENTS.length - rows.length } });
      } catch (error) {
        catalogDbError(res, error, 'cadastrar o catálogo básico');
      }
    });

    router.post('/uan/organizations/:id/ingredients', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const acc = await catalogAccess(user, req.params.id);
      if (!acc) return notFoundMsg(res, 'Empresa');
      if (!acc.canManage) return catalogForbidden(res);
      const parsed = ingredientBody(req.body ?? {});
      if (parsed.errors) return bad(res, parsed.errors);
      if (!(await publicFood(parsed.data.food_id))) return bad(res, { food_id: 'Alimento inválido.' });
      try {
        const [row] = await withActor(user, (trx) => trx('ingredients').insert({ ...parsed.data, organization_id: acc.orgId }).returning(ING_FIELDS));
        res.status(201).json({ data: ingOut(row) });
      } catch (error) {
        catalogDbError(res, error, 'cadastrar insumo');
      }
    });

    async function ingredientAccess(user, id) {
      if (!isUuid(id)) return null;
      const ing = await database('ingredients').where('id', id).first(...ING_FIELDS);
      if (!ing) return null;
      const acc = await catalogAccess(user, ing.organization_id);
      return acc ? { ing, acc } : null;
    }

    router.get('/uan/ingredients/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await ingredientAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Insumo');
      const [food, prices, suppliers] = await Promise.all([
        x.ing.food_id ? database('foods').where('id', x.ing.food_id).first('id', 'name', 'food_group') : null,
        database('ingredient_prices as p').leftJoin('suppliers as s', 's.id', 'p.supplier_id').leftJoin('directus_users as u', 'u.id', 'p.created_by')
          .where('p.ingredient_id', x.ing.id).orderBy([{ column: 'p.valid_from', order: 'desc' }, { column: 'p.created_at', order: 'desc' }]).limit(200)
          .select('p.id', 'p.price_cents', 'p.valid_from', 'p.source', 'p.created_at', 's.name as supplier_name', 'u.first_name', 'u.last_name'),
        database('suppliers').where({ organization_id: x.ing.organization_id, active: true }).orderBy('name').select('id', 'name'),
      ]);
      const current = (await database.raw('select * from ingredient_price_at(?)', [x.ing.id])).rows[0];
      res.json({
        data: {
          ingredient: ingOut(x.ing),
          food: food ?? null,
          can_manage: x.acc.canManage,
          current_price: current?.id ? { id: current.id, price_cents: current.price_cents, valid_from: dateOut(current.valid_from) } : null,
          prices: prices.map((p) => ({ ...p, valid_from: dateOut(p.valid_from), created_by_name: userName(p), first_name: undefined, last_name: undefined })),
          suppliers,
        },
      });
    });

    router.put('/uan/ingredients/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await ingredientAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Insumo');
      if (!x.acc.canManage) return catalogForbidden(res);
      const parsed = ingredientBody(req.body ?? {});
      if (parsed.errors) return bad(res, parsed.errors);
      if (!(await publicFood(parsed.data.food_id))) return bad(res, { food_id: 'Alimento inválido.' });
      try {
        const [row] = await withActor(user, (trx) => trx('ingredients').where('id', x.ing.id).update(parsed.data).returning(ING_FIELDS));
        res.json({ data: ingOut(row) });
      } catch (error) {
        catalogDbError(res, error, 'alterar insumo');
      }
    });

    router.post('/uan/ingredients/:id/prices', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await ingredientAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Insumo');
      if (!x.acc.canManage) return catalogForbidden(res);
      const b = req.body ?? {};
      const errors = {};
      const price = Number(String(b.price ?? '').replace(',', '.'));
      if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) errors.price = 'Informe o preço (R$).';
      const validFrom = b.valid_from || null;
      if (validFrom !== null && !isIsoDate(validFrom)) errors.valid_from = 'Data inválida.';
      if (b.supplier_id && !isUuid(b.supplier_id)) errors.supplier_id = 'Fornecedor inválido.';
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        const [row] = await withActor(user, (trx) => trx('ingredient_prices').insert({
          ingredient_id: x.ing.id, organization_id: x.ing.organization_id, supplier_id: b.supplier_id || null, price_cents: Math.round(price * 100),
          ...(validFrom ? { valid_from: validFrom } : {}), source: 'manual', created_by: user,
        }).returning(['id', 'price_cents', 'valid_from']));
        res.status(201).json({ data: { ...row, valid_from: dateOut(row.valid_from) } });
      } catch (error) {
        p0001(res, error, 'registrar preço');
      }
    });

    function supplierBody(b) {
      const errors = {};
      const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (name.length < 2 || name.length > 120) errors.name = 'Informe o nome (2 a 120 caracteres).';
      const cnpj = typeof b.cnpj === 'string' && b.cnpj.trim() ? b.cnpj.replace(/\D/g, '') : null;
      if (cnpj !== null && cnpj.length !== 14) errors.cnpj = 'CNPJ com 14 dígitos.';
      const email = str(b.email, 254);
      if (email && !EMAIL.test(email)) errors.email = 'E-mail inválido.';
      if (b.active !== undefined && typeof b.active !== 'boolean') errors.active = 'Valor inválido.';
      if (Object.keys(errors).length) return { errors };
      return { data: { name, cnpj, contact_name: str(b.contact_name, 120), phone: str(b.phone, 30), email: email?.toLowerCase() ?? null, notes: str(b.notes, 1000), ...(b.active === undefined ? {} : { active: b.active }) } };
    }

    router.get('/uan/organizations/:id/suppliers', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const acc = await catalogAccess(user, req.params.id);
      if (!acc) return notFoundMsg(res, 'Empresa');
      const rows = await database('suppliers as s').where('s.organization_id', acc.orgId).orderBy([{ column: 's.active', order: 'desc' }, { column: 's.name' }])
        .select(...SUP_FIELDS.map((f) => `s.${f}`), database.raw('(select count(distinct p.ingredient_id)::int from ingredient_prices p where p.supplier_id = s.id) as ingredient_count'));
      const org = await database('organizations').where('id', acc.orgId).first('id', 'name');
      res.json({ data: { organization: org, can_manage: acc.canManage, items: rows } });
    });

    router.post('/uan/organizations/:id/suppliers', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const acc = await catalogAccess(user, req.params.id);
      if (!acc) return notFoundMsg(res, 'Empresa');
      if (!acc.canManage) return catalogForbidden(res);
      const parsed = supplierBody(req.body ?? {});
      if (parsed.errors) return bad(res, parsed.errors);
      try {
        const [row] = await withActor(user, (trx) => trx('suppliers').insert({ ...parsed.data, organization_id: acc.orgId }).returning(SUP_FIELDS));
        res.status(201).json({ data: row });
      } catch (error) {
        catalogDbError(res, error, 'cadastrar fornecedor');
      }
    });

    router.put('/uan/suppliers/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const sup = isUuid(req.params.id) ? await database('suppliers').where('id', req.params.id).first('id', 'organization_id') : null;
      const acc = sup ? await catalogAccess(user, sup.organization_id) : null;
      if (!acc) return notFoundMsg(res, 'Fornecedor');
      if (!acc.canManage) return catalogForbidden(res);
      const parsed = supplierBody(req.body ?? {});
      if (parsed.errors) return bad(res, parsed.errors);
      try {
        const [row] = await withActor(user, (trx) => trx('suppliers').where('id', sup.id).update(parsed.data).returning(SUP_FIELDS));
        res.json({ data: row });
      } catch (error) {
        catalogDbError(res, error, 'alterar fornecedor');
      }
    });

    // ── Fichas técnicas (U2b: RN-129 a RN-134) ──────────────────────────────────────────────
    // Ver: owner e equipe (custos só para owner, gestor, RT e estoquista). Editar: owner, gestor, RT.
    // Aprovar: owner ou RT (tech_sheet_approve confere de novo). Os cálculos são do nutrition-core no app.
    const SHEET_CATEGORIES = new Set(['main', 'side', 'garnish', 'salad', 'soup', 'dessert', 'bread', 'beverage', 'sauce', 'base', 'other']);
    const SHEET_FIELDS = ['id', 'organization_id', 'root_id', 'parent_id', 'version', 'name', 'category', 'servings', 'cooked_weight_g', 'cooking_index', 'prep_minutes', 'equipment', 'notes', 'status', 'computed', 'photo', 'approved_at', 'created_at', 'updated_at'];
    const SHEET_NUTRIENTS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'lipid_g', 'saturated_fat_g', 'fiber_g', 'sodium_mg', 'calcium_mg', 'iron_mg', 'vitamin_c_mg'];
    const sheetOut = (r) => ({ ...r, cooked_weight_g: numOrNull(r.cooked_weight_g), cooking_index: numOrNull(r.cooking_index) });
    const sheetNotFound = (res) => notFoundMsg(res, 'Ficha');

    async function sheetRoles(user, orgId) {
      const org = (await uanOrgs(user)).find((o) => o.id === orgId);
      if (!org) return null;
      if (org.is_owner) return { edit: true, approve: true, cost: true };
      const roles = await database('unit_members as m').join('production_units as u', 'u.id', 'm.unit_id').where({ 'u.organization_id': orgId, 'm.user_id': user }).pluck('m.role');
      return {
        edit: roles.some((r) => r === 'manager' || r === 'technical_lead'),
        approve: roles.includes('technical_lead'),
        cost: roles.some((r) => r === 'manager' || r === 'technical_lead' || r === 'stock_keeper'),
      };
    }
    /** Gramas de uma unidade de compra (mesma regra do nutrition-core/units.ts); null se faltar o peso. */
    function gramsPerPurchaseUnit(i) {
      const n = (v) => (v === null || v === undefined ? null : Number(v));
      switch (i.purchase_unit) {
        case 'kg': return 1000;
        case 'g': return 1;
        case 'l': return 1000 * (n(i.density_g_ml) ?? 1);
        case 'ml': return n(i.density_g_ml) ?? 1;
        case 'un': return n(i.unit_weight_g);
        case 'dz': return n(i.unit_weight_g) === null ? null : 12 * n(i.unit_weight_g);
        default: return n(i.pack_grams);
      }
    }

    /** Insumos com FC padrão, alergênicos, nutrientes por 100 g e (se pode ver custo) preço por kg vigente. */
    async function ingredientInfos(ingIds, withCost) {
      const ings = ingIds.length ? await database('ingredients as i').leftJoin('foods as f', 'f.id', 'i.food_id').whereIn('i.id', ingIds)
        .select('i.id', 'i.name', 'i.default_fc', 'i.purchase_unit', 'i.density_g_ml', 'i.unit_weight_g', 'i.pack_grams', 'i.allergens', 'i.added_sugar_g_100g', 'i.food_id', 'f.name as food_name',
          database.raw('(select p.price_cents from ingredient_price_at(i.id) p) as price_cents')) : [];
      const foodIds = [...new Set(ings.map((i) => i.food_id).filter((x) => x !== null))];
      const nutr = foodIds.length ? await database('food_nutrients as fn').join('nutrients as n', 'n.id', 'fn.nutrient_id')
        .whereIn('fn.food_id', foodIds).whereIn('n.code', SHEET_NUTRIENTS).select('fn.food_id', 'n.code', 'fn.amount_per_100g') : [];
      const ingredients = ings.map((i) => {
        const grams = gramsPerPurchaseUnit(i);
        const per100g = i.food_id === null ? null : Object.fromEntries(SHEET_NUTRIENTS.map((c) => {
          const row = nutr.find((n) => n.food_id === i.food_id && n.code === c);
          return [c, row && row.amount_per_100g !== null ? Number(row.amount_per_100g) : null];
        }));
        // Açúcares adicionados não vêm da TACO: do cadastro do insumo (sem valor = 0)
        if (per100g) per100g.added_sugar_g = i.added_sugar_g_100g === null ? 0 : Number(i.added_sugar_g_100g);
        return {
          id: i.id, name: i.name, default_fc: Number(i.default_fc), allergens: i.allergens, food_name: i.food_name, per100g,
          price_per_kg_cents: withCost && i.price_cents !== null && grams ? Math.round((i.price_cents * 1000) / grams) : null,
          purchase_unit: i.purchase_unit, grams_per_unit: grams,
        };
      });
      return ingredients;
    }

    /** Ficha + sub-receitas alcançáveis, insumos (com preço por kg vigente) e nutrientes por 100 g. */
    async function sheetGraph(rootId, withCost) {
      const sheets = new Map();
      let frontier = [rootId];
      while (frontier.length) {
        const rows = await database('tech_sheets').whereIn('id', frontier).select(...SHEET_FIELDS);
        const items = await database('tech_sheet_items').whereIn('sheet_id', frontier).orderBy('position').select('sheet_id', 'position', 'ingredient_id', 'sub_sheet_id', 'gross_g', 'fc', 'note');
        const next = [];
        for (const r of rows) {
          sheets.set(r.id, { ...sheetOut(r), computed: withCost ? r.computed : null, items: items.filter((i) => i.sheet_id === r.id).map((i) => ({ ...i, sheet_id: undefined, gross_g: Number(i.gross_g), fc: numOrNull(i.fc) })) });
          for (const i of items) if (i.sheet_id === r.id && i.sub_sheet_id && !sheets.has(i.sub_sheet_id) && !next.includes(i.sub_sheet_id)) next.push(i.sub_sheet_id);
        }
        frontier = next.filter((id) => !sheets.has(id));
      }
      const ingIds = [...new Set([...sheets.values()].flatMap((s) => s.items.map((i) => i.ingredient_id).filter(Boolean)))];
      const ingredients = await ingredientInfos(ingIds, withCost);
      return { sheets: [...sheets.values()], ingredients };
    }

    router.get('/uan/organizations/:id/tech-sheets', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const orgId = req.params.id;
      const roles = isUuid(orgId) ? await sheetRoles(user, orgId) : null;
      if (!roles) return notFoundMsg(res, 'Empresa');
      let q = database('tech_sheets').where('organization_id', orgId).whereNot('status', 'archived').orderBy([{ column: 'name' }, { column: 'version', order: 'desc' }]).limit(500);
      if (typeof req.query.q === 'string' && req.query.q.trim()) q = q.whereRaw('f_unaccent(lower(name)) like f_unaccent(lower(?))', [`%${req.query.q.trim().slice(0, 80)}%`]);
      const rows = await q.select('id', 'root_id', 'version', 'name', 'category', 'servings', 'status', 'approved_at', 'updated_at', 'computed',
        database.raw('(select count(*)::int from tech_sheet_items i where i.sheet_id = tech_sheets.id) as item_count'));
      const org = await database('organizations').where('id', orgId).first('id', 'name');
      res.json({
        data: {
          organization: org, can_edit: roles.edit, can_see_cost: roles.cost,
          items: rows.map((r) => ({ ...r, cost_per_serving_cents: roles.cost ? (r.computed?.costPerServingCents ?? null) : null, computed: undefined })),
        },
      });
    });

    router.post('/uan/organizations/:id/tech-sheets', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const orgId = req.params.id;
      const roles = isUuid(orgId) ? await sheetRoles(user, orgId) : null;
      if (!roles) return notFoundMsg(res, 'Empresa');
      if (!roles.edit) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT criam fichas.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      const servings = Number(b.servings ?? 10);
      const errors = {};
      if (name.length < 2 || name.length > 120) errors.name = 'Informe o nome (2 a 120 caracteres).';
      if (!SHEET_CATEGORIES.has(b.category ?? 'main')) errors.category = 'Categoria inválida.';
      if (!Number.isInteger(servings) || servings < 1 || servings > 10000) errors.servings = 'Porções entre 1 e 10.000.';
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        const [row] = await withActor(user, (trx) => trx('tech_sheets').insert({ organization_id: orgId, name, category: b.category ?? 'main', servings, created_by: user }).returning(['id']));
        res.status(201).json({ data: row });
      } catch (error) {
        p0001(res, error, 'criar ficha');
      }
    });

    async function sheetAccess(user, id) {
      if (!isUuid(id)) return null;
      const sheet = await database('tech_sheets').where('id', id).first(...SHEET_FIELDS);
      if (!sheet) return null;
      const roles = await sheetRoles(user, sheet.organization_id);
      return roles ? { sheet: sheetOut(sheet), roles } : null;
    }

    router.get('/uan/tech-sheets/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await sheetAccess(user, req.params.id);
      if (!x) return sheetNotFound(res);
      const graph = await sheetGraph(x.sheet.id, x.roles.cost);
      const [steps, versions, catalog, subs] = await Promise.all([
        database('tech_sheet_steps').where('sheet_id', x.sheet.id).orderBy('position').select('position', 'text', 'critical', 'target_temp'),
        database('tech_sheets').where('root_id', x.sheet.root_id).orderBy('version', 'desc').select('id', 'version', 'status', 'approved_at', 'updated_at'),
        x.roles.edit ? database('ingredients').where({ organization_id: x.sheet.organization_id, active: true }).orderBy('name').pluck('id').then((ids) => ingredientInfos(ids, x.roles.cost)) : [],
        x.roles.edit ? database('tech_sheets').where('organization_id', x.sheet.organization_id).whereNot('root_id', x.sheet.root_id).whereNot('status', 'archived').orderBy('name').select('id', 'name', 'version', 'status') : [],
      ]);
      res.json({
        data: {
          sheet: { ...x.sheet, computed: x.roles.cost ? x.sheet.computed : null },
          graph,
          steps: steps.map((s) => ({ ...s, target_temp: numOrNull(s.target_temp) })),
          versions,
          can_edit: x.roles.edit && x.sheet.status === 'draft',
          can_approve: x.roles.approve && x.sheet.status === 'draft',
          can_new_version: x.roles.edit && x.sheet.status !== 'draft' && !versions.some((v) => v.status === 'draft'),
          can_see_cost: x.roles.cost,
          can_photo: x.roles.edit,
          catalog: catalog.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
          sub_sheets: subs,
        },
      });
    });

    // Grafo de uma ficha (para o editor calcular uma sub-receita recém-escolhida)
    router.get('/uan/tech-sheets/:id/graph', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await sheetAccess(user, req.params.id);
      if (!x) return sheetNotFound(res);
      res.json({ data: await sheetGraph(x.sheet.id, x.roles.cost) });
    });

    router.put('/uan/tech-sheets/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await sheetAccess(user, req.params.id);
      if (!x) return sheetNotFound(res);
      if (!x.roles.edit) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT editam fichas.', extensions: { code: 'FORBIDDEN' } }] });
      if (x.sheet.status !== 'draft') return conflict(res, 'Ficha aprovada não se altera; crie uma nova versão');
      const b = req.body ?? {};
      const errors = {};
      const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
      const num = (v) => (v === null || v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (name.length < 2 || name.length > 120) errors.name = 'Informe o nome (2 a 120 caracteres).';
      if (!SHEET_CATEGORIES.has(b.category)) errors.category = 'Categoria inválida.';
      const servings = Number(b.servings);
      if (!Number.isInteger(servings) || servings < 1 || servings > 10000) errors.servings = 'Porções entre 1 e 10.000.';
      const cooked = num(b.cooked_weight_g);
      if (cooked !== null && !(cooked > 0)) errors.cooked_weight_g = 'Peso pronto inválido.';
      const ic = num(b.cooking_index);
      if (ic !== null && !(ic >= 0.05 && ic <= 10)) errors.cooking_index = 'IC entre 0,05 e 10.';
      const prep = num(b.prep_minutes);
      if (prep !== null && !(Number.isInteger(prep) && prep >= 1 && prep <= 2880)) errors.prep_minutes = 'Tempo inválido.';
      const items = Array.isArray(b.items) ? b.items : [];
      if (items.length > 200) errors.items = 'Até 200 ingredientes.';
      const rows = [];
      for (const [i, it] of items.entries()) {
        const gross = num(it?.gross_g);
        const fc = num(it?.fc);
        if (!(gross > 0 && gross <= 1_000_000)) { errors.items = `Ingrediente ${i + 1}: peso bruto inválido.`; break; }
        if (it.ingredient_id && it.sub_sheet_id) { errors.items = `Ingrediente ${i + 1}: escolha insumo ou sub-receita.`; break; }
        if (!isUuid(it.ingredient_id) && !isUuid(it.sub_sheet_id)) { errors.items = `Ingrediente ${i + 1}: escolha o insumo.`; break; }
        if (fc !== null && !(fc >= 1 && fc <= 20)) { errors.items = `Ingrediente ${i + 1}: FC entre 1 e 20.`; break; }
        rows.push({ position: i + 1, ingredient_id: it.ingredient_id || null, sub_sheet_id: it.sub_sheet_id || null, gross_g: Math.round(gross * 10) / 10, fc: it.sub_sheet_id ? null : fc, note: str(it.note, 200) });
      }
      const steps = Array.isArray(b.steps) ? b.steps : [];
      const stepRows = [];
      for (const [i, st] of steps.entries()) {
        const text = typeof st?.text === 'string' ? st.text.trim() : '';
        if (text.length < 2 || text.length > 1000) { errors.steps = `Passo ${i + 1}: descreva o passo.`; break; }
        const t = num(st.target_temp);
        if (t !== null && !(t >= -60 && t <= 300)) { errors.steps = `Passo ${i + 1}: temperatura inválida.`; break; }
        stepRows.push({ position: i + 1, text, critical: st.critical === true, target_temp: t });
      }
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        await withActor(user, async (trx) => {
          await trx('tech_sheets').where('id', x.sheet.id).update({ name, category: b.category, servings, cooked_weight_g: cooked, cooking_index: ic, prep_minutes: prep, equipment: str(b.equipment, 500), notes: str(b.notes, 2000) });
          await trx('tech_sheet_items').where('sheet_id', x.sheet.id).del();
          if (rows.length) await trx('tech_sheet_items').insert(rows.map((r) => ({ ...r, sheet_id: x.sheet.id })));
          await trx('tech_sheet_steps').where('sheet_id', x.sheet.id).del();
          if (stepRows.length) await trx('tech_sheet_steps').insert(stepRows.map((r) => ({ ...r, sheet_id: x.sheet.id })));
        });
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'salvar ficha');
      }
    });

    router.post('/uan/tech-sheets/:id/approve', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await sheetAccess(user, req.params.id);
      if (!x) return sheetNotFound(res);
      if (!x.roles.approve) return res.status(403).json({ errors: [{ message: 'Só o RT ou o responsável pela empresa aprovam fichas.', extensions: { code: 'FORBIDDEN' } }] });
      const computed = req.body?.computed;
      if (computed !== null && computed !== undefined && (typeof computed !== 'object' || JSON.stringify(computed).length > 20000)) return bad(res, { computed: 'Cálculo inválido.' });
      try {
        await withActor(user, (trx) => trx.raw('select * from tech_sheet_approve(?, ?, ?::jsonb)', [x.sheet.id, user, JSON.stringify(computed ?? {})]));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'aprovar ficha');
      }
    });

    router.post('/uan/tech-sheets/:id/new-version', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await sheetAccess(user, req.params.id);
      if (!x) return sheetNotFound(res);
      if (!x.roles.edit) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT editam fichas.', extensions: { code: 'FORBIDDEN' } }] });
      try {
        const id = await withActor(user, async (trx) => (await trx.raw('select tech_sheet_new_version(?, ?) as id', [x.sheet.id, user])).rows[0].id);
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'criar nova versão');
      }
    });

    router.post('/uan/tech-sheets/:id/duplicate', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await sheetAccess(user, req.params.id);
      if (!x) return sheetNotFound(res);
      if (!x.roles.edit) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT criam fichas.', extensions: { code: 'FORBIDDEN' } }] });
      try {
        const id = await withActor(user, async (trx) => {
          const s = x.sheet;
          const [row] = await trx('tech_sheets').insert({ organization_id: s.organization_id, name: `${s.name} (cópia)`.slice(0, 120), category: s.category, servings: s.servings, cooked_weight_g: s.cooked_weight_g, cooking_index: s.cooking_index, prep_minutes: s.prep_minutes, equipment: s.equipment, notes: s.notes, created_by: user }).returning(['id']);
          await trx.raw('insert into tech_sheet_items (sheet_id, position, ingredient_id, sub_sheet_id, gross_g, fc, note) select ?, position, ingredient_id, sub_sheet_id, gross_g, fc, note from tech_sheet_items where sheet_id = ?', [row.id, s.id]);
          await trx.raw('insert into tech_sheet_steps (sheet_id, position, text, critical, target_temp) select ?, position, text, critical, target_temp from tech_sheet_steps where sheet_id = ?', [row.id, s.id]);
          return row.id;
        });
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'duplicar ficha');
      }
    });

    router.delete('/uan/tech-sheets/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await sheetAccess(user, req.params.id);
      if (!x) return sheetNotFound(res);
      if (!x.roles.edit) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT apagam fichas.', extensions: { code: 'FORBIDDEN' } }] });
      if (x.sheet.status !== 'draft') return conflict(res, 'Só rascunho pode ser apagado; arquive a ficha aprovada');
      if (await database('tech_sheet_items').where('sub_sheet_id', x.sheet.id).first('id')) return conflict(res, 'Esta ficha é usada como sub-receita em outra ficha.');
      try {
        await withActor(user, (trx) => trx('tech_sheets').where('id', x.sheet.id).del());
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'apagar ficha');
      }
    });

    // ── Cardápio cíclico e aprovação (U2c: RN-135, RN-136, RN-224) ───────────────────────────
    // Ver: equipe da unidade (cozinheiro, estoquista e auditor só os aprovados). Montar e enviar: owner, gestor, RT.
    // Aprovar e devolver: owner ou gestor. O custo vem do cálculo gravado na aprovação de cada ficha.
    const MENU_SERVICES = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'];
    const MENU_SLOTS = ['main', 'side', 'garnish', 'salad', 'soup', 'dessert', 'bread', 'beverage', 'sauce', 'other'];
    const CYCLE_FIELDS = ['id', 'unit_id', 'name', 'starts_on', 'length_days', 'services', 'slots', 'cost_target_cents', 'profile_id', 'autonomy', 'status', 'justification', 'submitted_at', 'approved_at', 'created_at', 'updated_at'];
    const cycleOut = (c) => ({ ...c, starts_on: dateOut(c.starts_on) });
    const menuNotFound = (res) => notFoundMsg(res, 'Cardápio');
    const canApproveMenu = (a) => a.isOwner || a.roles.includes('manager');
    const localToday = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // America/Sao_Paulo (sem horário de verão)

    /** Versão aprovada mais recente de cada raiz de ficha. */
    async function currentSheets(rootIds) {
      if (!rootIds.length) return new Map();
      const rows = await database('tech_sheets').whereIn('root_id', rootIds).where('status', 'approved').select('id', 'root_id', 'name', 'category', 'version', 'computed');
      return new Map(rows.map((r) => [r.root_id, r]));
    }
    /** Custo por refeição (dia × serviço) e o que passa do teto. */
    function menuCost(cycle, items, sheets) {
      const totals = {};
      for (const it of items) {
        const c = sheets.get(it.sheet_root_id)?.computed?.costPerServingCents;
        const k = `${it.day_index}:${it.service}`;
        totals[k] = (totals[k] ?? 0) + (Number.isFinite(c) ? c : 0);
      }
      const over = cycle.cost_target_cents
        ? Object.entries(totals).filter(([, v]) => v > cycle.cost_target_cents).map(([k, v]) => ({ day: Number(k.split(':')[0]), service: k.split(':')[1], cost_cents: v, pct: Math.round(((v - cycle.cost_target_cents) / cycle.cost_target_cents) * 1000) / 10 }))
        : [];
      return { totals, over };
    }
    async function menuAccess(user, id) {
      if (!isUuid(id)) return null;
      const cycle = await database('menu_cycles').where('id', id).first(...CYCLE_FIELDS);
      if (!cycle) return null;
      const a = await unitAccess(user, cycle.unit_id);
      if (!a) return null;
      if (!canSupervise(a) && cycle.status !== 'approved') return null;
      return { cycle: cycleOut(cycle), a };
    }

    router.get('/uan/units/:id/menus', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      let q = database('menu_cycles').where('unit_id', a.unit.id).orderBy('starts_on', 'desc').limit(100);
      if (!canSupervise(a)) q = q.where('status', 'approved');
      const cycles = (await q.select(...CYCLE_FIELDS)).map(cycleOut);
      // Cardápio de hoje: ciclos aprovados já iniciados
      const today = localToday();
      const active = cycles.filter((c) => c.status === 'approved' && c.starts_on <= today);
      const todayItems = [];
      for (const c of active) {
        const day = (await database.raw('select menu_day_index(?, ?::date) as d', [c.id, today])).rows[0].d;
        const items = await database('menu_items').where({ cycle_id: c.id, day_index: day }).select('service', 'slot', 'sheet_root_id');
        const sheets = await currentSheets([...new Set(items.map((i) => i.sheet_root_id))]);
        todayItems.push({ cycle_id: c.id, cycle_name: c.name, day_index: day, items: items.map((i) => ({ service: i.service, slot: i.slot, sheet_id: sheets.get(i.sheet_root_id)?.id ?? null, name: sheets.get(i.sheet_root_id)?.name ?? '—' })) });
      }
      res.json({ data: { unit: { id: a.unit.id, name: a.unit.name, organization_id: a.unit.organization_id }, can_edit: canSupervise(a) && a.unit.active, today, today_menus: todayItems, cycles } });
    });

    function cycleBody(b) {
      const errors = {};
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (name.length < 2 || name.length > 120) errors.name = 'Informe o nome (2 a 120 caracteres).';
      if (!isIsoDate(b.starts_on)) errors.starts_on = 'Informe a data de início.';
      const len = Number(b.length_days);
      if (!Number.isInteger(len) || len < 7 || len > 56) errors.length_days = 'Ciclo de 7 a 56 dias.';
      const services = Array.isArray(b.services) ? MENU_SERVICES.filter((x) => b.services.includes(x)) : [];
      if (!services.length) errors.services = 'Escolha ao menos um serviço.';
      const slots = Array.isArray(b.slots) ? MENU_SLOTS.filter((x) => b.slots.includes(x)) : [];
      if (!slots.length) errors.slots = 'Escolha ao menos uma posição do prato.';
      let target = null;
      if (b.cost_target !== undefined && b.cost_target !== null && b.cost_target !== '') {
        const n = Number(String(b.cost_target).replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0 || n > 10000) errors.cost_target = 'Teto de custo inválido.';
        else target = Math.round(n * 100);
      }
      const profile = b.profile_id ? String(b.profile_id) : null;
      if (profile !== null && !isUuid(profile)) errors.profile_id = 'Perfil inválido.';
      const autonomy = b.autonomy ?? 'free';
      if (!['standardized', 'decentralized', 'free'].includes(autonomy)) errors.autonomy = 'Modelo inválido.';
      return Object.keys(errors).length ? { errors } : { data: { name, starts_on: b.starts_on, length_days: len, services, slots, cost_target_cents: target, profile_id: profile, autonomy } };
    }

    router.post('/uan/units/:id/menus', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT montam cardápios.', extensions: { code: 'FORBIDDEN' } }] });
      const parsed = cycleBody(req.body ?? {});
      if (parsed.errors) return bad(res, parsed.errors);
      try {
        const [row] = await withActor(user, (trx) => trx('menu_cycles').insert({ ...parsed.data, unit_id: a.unit.id, organization_id: a.unit.organization_id, created_by: user }).returning(['id']));
        res.status(201).json({ data: row });
      } catch (error) {
        p0001(res, error, 'criar cardápio');
      }
    });

    /** Perfil do ciclo (metas), regras do contrato aplicáveis e insumos de cada ficha (com sub-receitas). */
    async function menuPlanning(x, sheetRows) {
      const org = x.a.unit.organization_id;
      const profile = x.cycle.profile_id ? await database('diner_profiles').where('id', x.cycle.profile_id).first('id', 'name', 'segment', 'stage', 'targets', 'validated', 'reference') : null;
      const rules = await database('menu_rules').where({ organization_id: org, active: true }).where((q) => q.whereNull('profile_id').orWhere('profile_id', x.cycle.profile_id ?? null))
        .select('id', 'kind', 'ingredient_id', 'sheet_category', 'slot', 'service', 'max_count', 'cost_cents', 'note');
      const ids = sheetRows.map((r) => r.id);
      const ingredients = {};
      if (ids.length) {
        const rows = (await database.raw(
          `with recursive t(origin, sheet_id) as (
             select s.id, s.id from unnest(?::uuid[]) s(id)
             union select t.origin, i.sub_sheet_id from tech_sheet_items i join t on i.sheet_id = t.sheet_id where i.sub_sheet_id is not null)
           select t.origin, array_agg(distinct i.ingredient_id) as ids from t join tech_sheet_items i on i.sheet_id = t.sheet_id
            where i.ingredient_id is not null group by t.origin`, [ids])).rows;
        for (const r of rows) ingredients[r.origin] = r.ids;
      }
      const names = rules.some((r) => r.ingredient_id) ? await database('ingredients').whereIn('id', rules.map((r) => r.ingredient_id).filter(Boolean)).select('id', 'name') : [];
      const profiles = canSupervise(x.a) ? await database('diner_profiles').where('active', true).where((q) => q.whereNull('organization_id').orWhere('organization_id', org)).orderBy([{ column: 'organization_id', nulls: 'first' }, { column: 'name' }]).select('id', 'name', 'organization_id', 'validated') : [];
      return {
        profile: profile ? { ...profile } : null,
        autonomy: x.cycle.autonomy ?? 'free',
        rules: rules.map((r) => ({ ...r, ingredient_name: names.find((n) => n.id === r.ingredient_id)?.name ?? null })),
        ingredients,
        profiles: profiles.map((p) => ({ id: p.id, name: p.name, platform: p.organization_id === null, validated: p.validated })),
      };
    }

    router.get('/uan/menus/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await menuAccess(user, req.params.id);
      if (!x) return menuNotFound(res);
      const items = await database('menu_items').where('cycle_id', x.cycle.id).select('day_index', 'service', 'slot', 'sheet_root_id');
      const sheets = await currentSheets([...new Set(items.map((i) => i.sheet_root_id))]);
      const seeCost = canSupervise(x.a) || x.a.roles.includes('stock_keeper');
      const editor = canSupervise(x.a);
      const options = editor
        ? await database('tech_sheets').where({ organization_id: x.a.unit.organization_id, status: 'approved' }).orderBy('name').select('root_id', 'name', 'category', 'computed')
        : [];
      const history = await database('menu_approvals as h').leftJoin('directus_users as u', 'u.id', 'h.user_id').where('h.cycle_id', x.cycle.id)
        .orderBy('h.created_at', 'desc').limit(50).select('h.action', 'h.note', 'h.cost_check', 'h.created_at', 'u.first_name', 'u.last_name');
      const cost = menuCost(x.cycle, items, sheets);
      const planning = await menuPlanning(x, [...sheets.values()]);
      res.json({
        data: {
          cycle: x.cycle,
          planning,
          unit: { id: x.a.unit.id, name: x.a.unit.name },
          items: items.map((i) => {
            const sh = sheets.get(i.sheet_root_id);
            return { ...i, sheet_id: sh?.id ?? null, name: sh?.name ?? '—', category: sh?.category ?? null, cost_cents: seeCost ? (sh?.computed?.costPerServingCents ?? null) : null, nutrients: sh?.computed?.perServing ?? null, ingredient_ids: planning.ingredients[sh?.id] ?? [] };
          }),
          options: options.map((o) => ({ root_id: o.root_id, name: o.name, category: o.category, cost_cents: seeCost ? (o.computed?.costPerServingCents ?? null) : null, nutrients: o.computed?.perServing ?? null })),
          cost: seeCost ? cost : null,
          history: history.map((h) => ({ ...h, user_name: userName(h), first_name: undefined, last_name: undefined })),
          can_edit: editor,
          can_submit: editor && x.cycle.status === 'draft',
          can_approve: canApproveMenu(x.a) && x.cycle.status === 'submitted',
        },
      });
    });

    router.put('/uan/menus/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await menuAccess(user, req.params.id);
      if (!x) return menuNotFound(res);
      if (!canSupervise(x.a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT alteram cardápios.', extensions: { code: 'FORBIDDEN' } }] });
      const parsed = cycleBody(req.body ?? {});
      if (parsed.errors) return bad(res, parsed.errors);
      try {
        await withActor(user, async (trx) => {
          await trx('menu_cycles').where('id', x.cycle.id).update(parsed.data);
          // Itens que ficaram fora do ciclo (dia, serviço ou posição removidos) saem
          await trx('menu_items').where('cycle_id', x.cycle.id)
            .where((q) => q.where('day_index', '>', parsed.data.length_days).orWhereNotIn('service', parsed.data.services).orWhereNotIn('slot', parsed.data.slots)).del();
        });
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'alterar cardápio');
      }
    });

    router.put('/uan/menus/:id/items', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await menuAccess(user, req.params.id);
      if (!x) return menuNotFound(res);
      if (!canSupervise(x.a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT alteram cardápios.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      const day = Number(b.day_index);
      if (!Number.isInteger(day) || day < 1 || day > x.cycle.length_days || !x.cycle.services.includes(b.service) || !x.cycle.slots.includes(b.slot)) return bad(res, { day_index: 'Posição inválida.' });
      if (b.sheet_root_id !== null && !isUuid(b.sheet_root_id)) return bad(res, { sheet_root_id: 'Ficha inválida.' });
      try {
        await withActor(user, async (trx) => {
          if (b.sheet_root_id === null) await trx('menu_items').where({ cycle_id: x.cycle.id, day_index: day, service: b.service, slot: b.slot }).del();
          else await trx('menu_items').insert({ cycle_id: x.cycle.id, day_index: day, service: b.service, slot: b.slot, sheet_root_id: b.sheet_root_id })
            .onConflict(['cycle_id', 'day_index', 'service', 'slot']).merge(['sheet_root_id']);
        });
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'alterar item do cardápio');
      }
    });

    for (const action of ['submit', 'approve', 'return']) router.post(`/uan/menus/:id/${action}`, async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await menuAccess(user, req.params.id);
      if (!x) return menuNotFound(res);
      if (action === 'submit' ? !canSupervise(x.a) : !canApproveMenu(x.a)) {
        return res.status(403).json({ errors: [{ message: action === 'submit' ? 'Só o responsável, o gestor ou o RT enviam cardápios.' : 'Só o gestor ou o responsável pela empresa aprovam cardápios.', extensions: { code: 'FORBIDDEN' } }] });
      }
      const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';
      let check = null;
      if (action === 'submit') {
        const items = await database('menu_items').where('cycle_id', x.cycle.id).select('day_index', 'service', 'slot', 'sheet_root_id');
        const cost = menuCost(x.cycle, items, await currentSheets([...new Set(items.map((i) => i.sheet_root_id))]));
        check = { target_cents: x.cycle.cost_target_cents, over: cost.over };
        if (cost.over.length && note.length < 10) {
          return res.status(400).json({ errors: [{ message: `Cardápio acima do teto de custo em ${cost.over.length} refeição(ões): escreva a justificativa (ao menos 10 caracteres).`, extensions: { code: 'COST_OVER', fields: { note: 'Justifique o custo acima do teto.' }, over: cost.over } }] });
        }
      }
      try {
        await withActor(user, (trx) => trx.raw('select * from menu_transition(?, ?, ?, ?, ?::jsonb)', [x.cycle.id, user, action, note || null, check ? JSON.stringify(check) : null]));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'mudar situação do cardápio');
      }
    });

    router.post('/uan/menus/:id/duplicate', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await menuAccess(user, req.params.id);
      if (!x) return menuNotFound(res);
      if (!canSupervise(x.a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT montam cardápios.', extensions: { code: 'FORBIDDEN' } }] });
      try {
        const id = await withActor(user, async (trx) => {
          const c = x.cycle;
          const [row] = await trx('menu_cycles').insert({ unit_id: c.unit_id, organization_id: x.a.unit.organization_id, name: `${c.name} (cópia)`.slice(0, 120), starts_on: c.starts_on, length_days: c.length_days, services: c.services, slots: c.slots, cost_target_cents: c.cost_target_cents, created_by: user }).returning(['id']);
          await trx.raw('insert into menu_items (cycle_id, day_index, service, slot, sheet_root_id) select ?, day_index, service, slot, sheet_root_id from menu_items where cycle_id = ?', [row.id, c.id]);
          return row.id;
        });
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'duplicar cardápio');
      }
    });

    // ── Produção do dia: comensais, lista de preparo, requisição e desperdício (U3a) ────────────
    // Ver: equipe da unidade. Comensais (previsto e realizado): owner, gestor, RT. Pesagem: quem executa.
    const WASTE_REASONS = new Set(['taste', 'temperature', 'portion', 'presentation', 'repeated', 'overproduction', 'other']);

    /** Ajuste local de per capita (RN-221): fator sobre as quantidades da ficha da rede nesta unidade. */
    async function unitAdjustments(unitId) {
      const rows = await database('unit_sheet_adjustments').where('unit_id', unitId).select('sheet_root_id', 'portion_factor', 'notes');
      return rows.map((r) => ({ sheet_root_id: r.sheet_root_id, portion_factor: Number(r.portion_factor), notes: r.notes }));
    }

    router.get('/uan/units/:id/sheet-adjustments', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const rows = await database('unit_sheet_adjustments as x').join('tech_sheets as s', 's.id', 'x.sheet_root_id').where('x.unit_id', a.unit.id).orderBy('s.name')
        .select('x.sheet_root_id', 's.name', 'x.portion_factor', 'x.notes', 'x.updated_at');
      const sheets = canSupervise(a) ? await database('tech_sheets').where({ organization_id: a.unit.organization_id, status: 'approved' }).orderBy('name').select('root_id', 'name') : [];
      res.json({ data: { can_edit: canSupervise(a), adjustments: rows.map((r) => ({ ...r, portion_factor: Number(r.portion_factor) })), sheets } });
    });

    router.put('/uan/units/:id/sheet-adjustments', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT ajustam o per capita.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      if (!isUuid(b.sheet_root_id)) return bad(res, { sheet_root_id: 'Escolha a ficha.' });
      try {
        if (b.portion_factor === null || b.portion_factor === '' || b.portion_factor === undefined) {
          await withActor(user, (trx) => trx('unit_sheet_adjustments').where({ unit_id: a.unit.id, sheet_root_id: b.sheet_root_id }).del());
          return res.json({ data: { ok: true } });
        }
        const f = Number(String(b.portion_factor).replace(',', '.'));
        if (!Number.isFinite(f) || f < 0.1 || f > 5) return bad(res, { portion_factor: 'Fator entre 0,1 e 5 (1 = igual à ficha).' });
        const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 500) : null;
        await withActor(user, (trx) => trx('unit_sheet_adjustments').insert({ unit_id: a.unit.id, organization_id: a.unit.organization_id, sheet_root_id: b.sheet_root_id, portion_factor: f, notes, updated_by: user })
          .onConflict(['unit_id', 'sheet_root_id']).merge({ portion_factor: f, notes, updated_by: user }));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'salvar ajuste');
      }
    });

    /** RN-161 — PCC de temperatura do APPCC aprovado das preparações do dia, com as medições já feitas. */
    async function dayCcps(unitId, day, roots, current) {
      if (!roots.length) return [];
      const rows = (await database.raw(
        `select p.sheet_root_id, p.title as plan, st.name as step, h.id, h.ccp_number, h.description, h.critical_limit, h.limit_min, h.limit_max,
                h.monitoring_what, h.monitoring_frequency, h.corrective_action
           from haccp_plans p join haccp_steps st on st.plan_id = p.id join haccp_hazards h on h.step_id = st.id
          where p.unit_id = ? and p.status = 'approved' and h.decision = 'ccp' and h.monitoring_kind = 'temperature'
            and h.equipment_id is null and p.sheet_root_id = any(?::uuid[])
          order by st.position, h.ccp_number`, [unitId, roots])).rows;
      if (!rows.length) return [];
      const names = [...new Set(rows.map((r) => current.get(r.sheet_root_id)?.name).filter(Boolean))];
      const readings = names.length ? await database('temperature_readings').where('unit_id', unitId).whereNotNull('food_name').whereIn('food_name', names)
        .where(database.raw(`recorded_at >= ?::timestamp at time zone 'America/Sao_Paulo' and recorded_at < (?::date + 1)::timestamp at time zone 'America/Sao_Paulo'`, [day, day]))
        .orderBy('recorded_at', 'desc').select('food_name', 'value', 'recorded_at') : [];
      return rows.map((r) => {
        const dish = current.get(r.sheet_root_id)?.name ?? '—';
        const mine = readings.filter((x) => x.food_name === dish);
        return {
          id: r.id, sheet_root_id: r.sheet_root_id, dish, plan: r.plan, step: r.step, ccp_number: r.ccp_number, description: r.description, critical_limit: r.critical_limit,
          limit_min: numOrNull(r.limit_min), limit_max: numOrNull(r.limit_max), monitoring_what: r.monitoring_what, monitoring_frequency: r.monitoring_frequency, corrective_action: r.corrective_action,
          readings: mine.slice(0, 5).map((x) => ({ value: Number(x.value), recorded_at: x.recorded_at })),
        };
      });
    }

    router.get('/uan/units/:id/production', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const day = isIsoDate(req.query.date) ? req.query.date : localToday();
      const seeCost = canSupervise(a) || a.roles.includes('stock_keeper');
      const diners = await database('diner_counts').where({ unit_id: a.unit.id, day }).select('service', 'planned', 'actual');
      // Cardápio aprovado do dia
      const cycles = await database('menu_cycles').where({ unit_id: a.unit.id, status: 'approved' }).where('starts_on', '<=', day).select('id', 'name');
      const menu = [];
      for (const c of cycles) {
        const idx = (await database.raw('select menu_day_index(?, ?::date) as d', [c.id, day])).rows[0].d;
        const items = await database('menu_items').where({ cycle_id: c.id, day_index: idx }).select('service', 'slot', 'sheet_root_id');
        menu.push(...items.map((i) => ({ ...i, cycle_name: c.name })));
      }
      const roots = [...new Set(menu.map((m) => m.sheet_root_id))];
      const current = await currentSheets(roots);
      const graph = { sheets: [], ingredients: [] };
      for (const r of roots) {
        const sh = current.get(r);
        if (!sh) continue;
        const g = await sheetGraph(sh.id, seeCost);
        for (const x of g.sheets) if (!graph.sheets.some((y) => y.id === x.id)) graph.sheets.push(x);
        for (const x of g.ingredients) if (!graph.ingredients.some((y) => y.id === x.id)) graph.ingredients.push(x);
      }
      // Adesão média por preparação nos últimos 30 dias (porções servidas ÷ comensais realizados)
      const adhesion = roots.length ? (await database.raw(
        `select w.sheet_root_id, sum(w.portions_served)::int as served, sum(d.actual)::int as diners
           from waste_records w join diner_counts d on d.unit_id = w.unit_id and d.day = w.day and d.service = w.service
          where w.unit_id = ? and w.sheet_root_id = any(?) and w.portions_served is not null and d.actual > 0
            and w.day between ?::date - 30 and ?::date - 1
          group by w.sheet_root_id`, [a.unit.id, roots, day, day])).rows : [];
      const waste = await database('waste_records').where({ unit_id: a.unit.id, day })
        .select('service', 'sheet_root_id', 'produced_g', 'leftover_g', 'plate_waste_g', 'prep_waste_g', 'portions_served', 'reason', 'notes', 'recorded_at');
      const history = await database('waste_records as w')
        .leftJoin('diner_counts as d', function () { this.on('d.unit_id', 'w.unit_id').andOn('d.day', 'w.day').andOn('d.service', 'w.service'); })
        .where('w.unit_id', a.unit.id).whereBetween('w.day', [database.raw("?::date - 13", [day]), day])
        .groupBy('w.day', 'w.service', 'd.actual')
        .orderBy([{ column: 'w.day', order: 'desc' }, { column: 'w.service' }])
        .select('w.day', 'w.service', 'd.actual as diners',
          database.raw('coalesce(sum(w.produced_g), 0)::int as produced_g'), database.raw('coalesce(sum(w.leftover_g), 0)::int as leftover_g'),
          database.raw('coalesce(sum(w.plate_waste_g), 0)::int as plate_waste_g'));
      res.json({
        data: {
          unit: { id: a.unit.id, name: a.unit.name },
          day,
          can_plan: canSupervise(a),
          can_record: canRun(a) && a.unit.active,
          can_see_cost: seeCost,
          diners,
          menu: menu.map((m) => ({ ...m, sheet_id: current.get(m.sheet_root_id)?.id ?? null, name: current.get(m.sheet_root_id)?.name ?? '—' })),
          graph,
          adhesion: adhesion.map((r) => ({ sheet_root_id: r.sheet_root_id, rate: r.diners > 0 ? Math.round((r.served / r.diners) * 1000) / 1000 : null })),
          adjustments: await unitAdjustments(a.unit.id),
          ccps: await dayCcps(a.unit.id, day, roots, current),
          waste,
          history: history.map((h) => ({ ...h, day: dateOut(h.day) })),
        },
      });
    });

    router.post('/uan/units/:id/diners', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT registram comensais.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      if (!isIsoDate(b.day) || !MENU_SERVICES.includes(b.service)) return bad(res, { day: 'Dia ou serviço inválido.' });
      const n = (v) => (v === undefined ? undefined : v === null || v === '' ? null : Number(v));
      const planned = n(b.planned);
      const actual = n(b.actual);
      for (const [k, v] of [['planned', planned], ['actual', actual]]) {
        if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 0 || v > 100000)) return bad(res, { [k]: 'Número de comensais inválido.' });
      }
      const patch = { ...(planned !== undefined ? { planned } : {}), ...(actual !== undefined ? { actual } : {}), updated_by: user, updated_at: database.fn.now() };
      await withActor(user, (trx) => trx('diner_counts').insert({ unit_id: a.unit.id, day: b.day, service: b.service, ...patch }).onConflict(['unit_id', 'day', 'service']).merge(Object.keys(patch)));
      res.json({ data: { ok: true } });
    });

    router.post('/uan/units/:id/diners/pattern', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT registram comensais.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      const planned = Number(b.planned);
      const days = Array.isArray(b.weekdays) ? b.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) : [];
      if (!isIsoDate(b.from) || !isIsoDate(b.to) || b.to < b.from) return bad(res, { from: 'Período inválido.' });
      if ((Date.parse(b.to) - Date.parse(b.from)) / 86_400_000 > 92) return bad(res, { to: 'Até 3 meses por vez.' });
      if (!MENU_SERVICES.includes(b.service) || !days.length || !Number.isInteger(planned) || planned < 0 || planned > 100000) return bad(res, { planned: 'Informe serviço, dias e comensais.' });
      const r = await withActor(user, (trx) => trx.raw(
        `insert into diner_counts (unit_id, day, service, planned, updated_by)
         select ?, d::date, ?, ?, ? from generate_series(?::date, ?::date, interval '1 day') d
          where extract(isodow from d)::int = any(?)
         on conflict (unit_id, day, service) do update set planned = excluded.planned, updated_by = excluded.updated_by, updated_at = now()`,
        [a.unit.id, b.service, planned, user, b.from, b.to, days]));
      res.json({ data: { days: r.rowCount } });
    });

    router.put('/uan/units/:id/waste', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canRun(a)) return runForbidden(res);
      const b = req.body ?? {};
      if (!isIsoDate(b.day) || !MENU_SERVICES.includes(b.service)) return bad(res, { day: 'Dia ou serviço inválido.' });
      if (b.sheet_root_id !== null && b.sheet_root_id !== undefined && !isUuid(b.sheet_root_id)) return bad(res, { sheet_root_id: 'Preparação inválida.' });
      const g = (v) => (v === null || v === undefined || v === '' ? null : Math.round(Number(String(v).replace(',', '.'))));
      const row = {
        unit_id: a.unit.id, organization_id: a.unit.organization_id, day: b.day, service: b.service, sheet_root_id: b.sheet_root_id || null,
        produced_g: b.sheet_root_id ? g(b.produced_g) : null, leftover_g: b.sheet_root_id ? g(b.leftover_g) : null,
        plate_waste_g: g(b.plate_waste_g), prep_waste_g: g(b.prep_waste_g), portions_served: b.sheet_root_id ? g(b.portions_served) : null,
        reason: WASTE_REASONS.has(b.reason) ? b.reason : null,
        notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 500) : null,
        recorded_by: user,
      };
      for (const k of ['produced_g', 'leftover_g', 'plate_waste_g', 'prep_waste_g', 'portions_served']) {
        if (row[k] !== null && (!Number.isFinite(row[k]) || row[k] < 0 || row[k] > 10_000_000)) return bad(res, { [k]: 'Valor inválido.' });
      }
      if (row.produced_g !== null && row.leftover_g !== null && row.leftover_g > row.produced_g) return bad(res, { leftover_g: 'A sobra não pode passar do produzido.' });
      try {
        await withActor(user, async (trx) => {
          const q = trx('waste_records').where({ unit_id: a.unit.id, day: b.day, service: b.service });
          const existing = await (row.sheet_root_id ? q.where('sheet_root_id', row.sheet_root_id) : q.whereNull('sheet_root_id')).first('id');
          if (existing) await trx('waste_records').where('id', existing.id).update(row);
          else await trx('waste_records').insert(row);
        });
        res.json({ data: { ok: true } });
      } catch (error) {
        if (error?.code === '23514') return bad(res, { produced_g: 'Revise os pesos.' });
        p0001(res, error, 'registrar pesagem');
      }
    });

    // ── Estoque por lote com FEFO e inventário (U4a: RN-142 a RN-145) ─────────────────────────
    // Ver: equipe da unidade. Movimentar e contar: owner, gestor, RT, estoquista. Aprovar inventário: owner ou RT.
    // Quantidades em gramas no banco; a tela usa a unidade de compra do insumo (gramsPerPurchaseUnit).
    const canStock = (a) => a.isOwner || a.roles.some((r) => r === 'manager' || r === 'technical_lead' || r === 'stock_keeper');
    const stockForbidden = (res) => res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor, o RT ou o estoquista movimentam o estoque.', extensions: { code: 'FORBIDDEN' } }] });
    const ING_UNIT_FIELDS = ['id', 'name', 'category', 'purchase_unit', 'density_g_ml', 'unit_weight_g', 'pack_grams', 'min_stock', 'active'];
    async function unitIngredient(a, id) {
      if (!isUuid(id)) return null;
      return database('ingredients').where({ id, organization_id: a.unit.organization_id }).first(...ING_UNIT_FIELDS);
    }
    const parseQty = (v) => {
      const n = Number(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) && n > 0 && n < 1e7 ? n : null;
    };

    router.get('/uan/units/:id/stock', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const ings = await database('ingredients').where('organization_id', a.unit.organization_id).orderBy('name').select(...ING_UNIT_FIELDS);
      const lots = await database('stock_lots as l').leftJoin('suppliers as s', 's.id', 'l.supplier_id').where('l.unit_id', a.unit.id).where('l.quantity_g', '>', 0)
        .orderBy([{ column: 'l.expires_on', order: 'asc', nulls: 'last' }, { column: 'l.received_at' }])
        .select('l.id', 'l.ingredient_id', 'l.lot_code', 'l.expires_on', 'l.quantity_g', 'l.received_at', 's.name as supplier_name');
      const moves = await database('stock_movements as m').join('ingredients as i', 'i.id', 'm.ingredient_id').leftJoin('directus_users as u', 'u.id', 'm.created_by')
        .where('m.unit_id', a.unit.id).orderBy('m.created_at', 'desc').limit(50)
        .select('m.id', 'm.kind', 'm.quantity_g', 'm.reason', 'm.created_at', 'i.name as ingredient_name', 'i.id as ingredient_id', 'u.first_name', 'u.last_name');
      const open = await database('inventories').where({ unit_id: a.unit.id, status: 'open' }).first('id', 'created_at');
      const suppliers = canStock(a) ? await database('suppliers').where({ organization_id: a.unit.organization_id, active: true }).orderBy('name').select('id', 'name') : [];
      res.json({
        data: {
          unit: { id: a.unit.id, name: a.unit.name },
          today: localToday(),
          can_move: canStock(a) && a.unit.active,
          can_approve: a.isOwner || a.roles.includes('technical_lead'),
          open_inventory: open ?? null,
          suppliers,
          ingredients: ings.map((i) => ({ ...ingOut(i), grams_per_unit: gramsPerPurchaseUnit(i) })),
          lots: lots.map((l) => ({ ...l, expires_on: dateOut(l.expires_on), quantity_g: Number(l.quantity_g) })),
          movements: moves.map((m) => ({ ...m, quantity_g: Number(m.quantity_g), user_name: userName(m), first_name: undefined, last_name: undefined })),
        },
      });
    });

    router.post('/uan/units/:id/stock/in', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canStock(a)) return stockForbidden(res);
      const b = req.body ?? {};
      const ing = await unitIngredient(a, b.ingredient_id);
      if (!ing) return bad(res, { ingredient_id: 'Escolha o insumo.' });
      const gpu = gramsPerPurchaseUnit(ing);
      const qty = parseQty(b.quantity);
      if (!qty || !gpu) return bad(res, { quantity: 'Informe a quantidade.' });
      if (b.expires_on && !isIsoDate(b.expires_on)) return bad(res, { expires_on: 'Data inválida.' });
      if (b.supplier_id && !isUuid(b.supplier_id)) return bad(res, { supplier_id: 'Fornecedor inválido.' });
      const cost = b.cost === undefined || b.cost === null || b.cost === '' ? null : parseQty(b.cost);
      if (b.cost && cost === null) return bad(res, { cost: 'Custo inválido.' });
      const grams = Math.round(qty * gpu * 10) / 10;
      try {
        const lot = await withActor(user, async (trx) => (await trx.raw('select stock_receive(?, ?, ?, ?, ?, ?, ?, ?) as id',
          [a.unit.id, ing.id, grams, typeof b.lot_code === 'string' ? b.lot_code.slice(0, 60) : null, b.expires_on || null, b.supplier_id || null, cost === null ? null : Math.round((cost * 100 * 1000) / gpu), user])).rows[0].id);
        res.status(201).json({ data: { lot_id: lot, quantity_g: grams } });
      } catch (error) {
        p0001(res, error, 'registrar entrada no estoque');
      }
    });

    router.post('/uan/units/:id/stock/out', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canStock(a)) return stockForbidden(res);
      const b = req.body ?? {};
      if (!['out_production', 'out_loss'].includes(b.kind)) return bad(res, { kind: 'Tipo de saída inválido.' });
      // Várias linhas (requisição do dia) em uma transação: tudo ou nada
      const lines = Array.isArray(b.lines) ? b.lines : [{ ingredient_id: b.ingredient_id, quantity: b.quantity }];
      if (!lines.length || lines.length > 300) return bad(res, { lines: 'Nada para retirar.' });
      const rows = [];
      for (const l of lines) {
        const ing = await unitIngredient(a, l.ingredient_id);
        if (!ing) return bad(res, { ingredient_id: 'Insumo inválido.' });
        let grams = null;
        if (l.quantity_g !== undefined) grams = parseQty(l.quantity_g);
        else {
          const gpu = gramsPerPurchaseUnit(ing);
          const q = parseQty(l.quantity);
          grams = q && gpu ? Math.round(q * gpu * 10) / 10 : null;
        }
        if (!grams) return bad(res, { quantity: `Quantidade inválida para ${ing.name}.` });
        rows.push({ ing, grams });
      }
      const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 300) : null;
      try {
        await withActor(user, async (trx) => {
          for (const r of rows) await trx.raw('select stock_out_fefo(?, ?, ?, ?, ?, ?)', [a.unit.id, r.ing.id, r.grams, b.kind, reason, user]);
        });
        res.json({ data: { lines: rows.length } });
      } catch (error) {
        if (error?.code === 'P0001' && /Saldo insuficiente/.test(error.message ?? '')) {
          const which = rows.find((r) => error.message.includes(`${r.grams}`))?.ing.name;
          return conflict(res, `${which ? `${which}: ` : ''}${error.message.split('\n')[0].replace(/^.* - /, '')}`);
        }
        p0001(res, error, 'registrar saída do estoque');
      }
    });

    router.post('/uan/units/:id/inventories', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canStock(a)) return stockForbidden(res);
      try {
        const id = await withActor(user, async (trx) => (await trx.raw('select inventory_open(?, ?) as id', [a.unit.id, user])).rows[0].id);
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'abrir inventário');
      }
    });

    async function inventoryAccess(user, id) {
      if (!isUuid(id)) return null;
      const inv = await database('inventories').where('id', id).first('id', 'unit_id', 'status', 'created_at', 'approved_at');
      if (!inv) return null;
      const a = await unitAccess(user, inv.unit_id);
      return a && canStock(a) ? { inv, a } : null;
    }

    router.get('/uan/inventories/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await inventoryAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Inventário');
      const approver = x.a.isOwner || x.a.roles.includes('technical_lead');
      const counts = await database('inventory_counts as c').join('ingredients as i', 'i.id', 'c.ingredient_id').where('c.inventory_id', x.inv.id).orderBy('i.name')
        .select('c.ingredient_id', 'c.system_g', 'c.counted_g', 'c.reason', ...ING_UNIT_FIELDS.filter((f) => f !== 'id').map((f) => `i.${f}`));
      res.json({
        data: {
          inventory: x.inv,
          unit: { id: x.a.unit.id, name: x.a.unit.name },
          can_approve: approver && x.inv.status === 'open',
          // contagem cega: o saldo do sistema só aparece para quem aprova
          counts: counts.map((c) => ({
            ingredient_id: c.ingredient_id, name: c.name, category: c.category, purchase_unit: c.purchase_unit, grams_per_unit: gramsPerPurchaseUnit(c),
            system_g: approver ? Number(c.system_g) : null, counted_g: c.counted_g === null ? null : Number(c.counted_g), reason: c.reason,
          })),
        },
      });
    });

    router.put('/uan/inventories/:id/counts', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await inventoryAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Inventário');
      if (x.inv.status !== 'open') return conflict(res, 'Inventário encerrado.');
      const b = req.body ?? {};
      const ing = await unitIngredient(x.a, b.ingredient_id);
      if (!ing) return bad(res, { ingredient_id: 'Insumo inválido.' });
      const gpu = gramsPerPurchaseUnit(ing);
      let counted = null;
      if (b.counted !== null && b.counted !== '' && b.counted !== undefined) {
        const n = Number(String(b.counted).replace(',', '.'));
        if (!Number.isFinite(n) || n < 0 || !gpu) return bad(res, { counted: 'Quantidade inválida.' });
        counted = Math.round(n * gpu * 10) / 10;
      }
      const reason = typeof b.reason === 'string' && b.reason.trim() ? b.reason.trim().slice(0, 300) : null;
      const n = await database('inventory_counts').where({ inventory_id: x.inv.id, ingredient_id: ing.id }).update({ counted_g: counted, reason, counted_by: user });
      if (!n) return notFoundMsg(res, 'Item do inventário');
      res.json({ data: { ok: true } });
    });

    for (const action of ['approve', 'cancel']) router.post(`/uan/inventories/:id/${action}`, async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await inventoryAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Inventário');
      try {
        if (action === 'approve') {
          const n = await withActor(user, async (trx) => (await trx.raw('select inventory_approve(?, ?) as n', [x.inv.id, user])).rows[0].n);
          return res.json({ data: { adjustments: n } });
        }
        await withActor(user, (trx) => trx('inventories').where({ id: x.inv.id, status: 'open' }).update({ status: 'cancelled' }));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'concluir inventário');
      }
    });

    // ── Compras: necessidade, pedido e recebimento (U4b: RN-139 a RN-141) ───────────────────────
    // Owner, gestor, RT e estoquista. A necessidade é calculada no app (nutrition-core/purchaseRequirements)
    // com os dados deste endpoint; o recebimento passa pela função receive_order (0047).
    const PO_FIELDS = ['id', 'unit_id', 'supplier_id', 'status', 'expected_on', 'notes', 'created_at', 'sent_at', 'received_at'];
    const poOut = (o) => ({ ...o, expected_on: dateOut(o.expected_on) });

    /** Plano do período: cardápios aprovados por dia, comensais, grafo das fichas, adesão, estoque e pedidos abertos. */
    async function planData(a, qFrom, qTo) {
      const from = isIsoDate(qFrom) ? qFrom : localToday();
      const to = isIsoDate(qTo) ? qTo : from;
      const span = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
      if (span < 0 || span > 31) return { error: 'Período de até 31 dias.' };
      const cycles = await database('menu_cycles').where({ unit_id: a.unit.id, status: 'approved' }).where('starts_on', '<=', to).select('id', 'starts_on', 'length_days');
      const days = [];
      const roots = new Set();
      for (let i = 0; i <= span; i++) {
        const d = new Date(Date.parse(`${from}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
        const items = [];
        for (const c of cycles) {
          const start = dateOut(c.starts_on);
          if (start > d) continue;
          const idx = (Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) % c.length_days) + 1;
          const rows = await database('menu_items').where({ cycle_id: c.id, day_index: idx }).select('service', 'slot', 'sheet_root_id');
          for (const r of rows) { items.push(r); roots.add(r.sheet_root_id); }
        }
        days.push({ day: d, items });
      }
      const diners = await database('diner_counts').where('unit_id', a.unit.id).whereBetween('day', [from, to]).select('day', 'service', 'planned', 'actual');
      const current = await currentSheets([...roots]);
      const graph = { sheets: [], ingredients: [] };
      for (const r of roots) {
        const sh = current.get(r);
        if (!sh) continue;
        const g = await sheetGraph(sh.id, true);
        for (const x of g.sheets) if (!graph.sheets.some((y) => y.id === x.id)) graph.sheets.push(x);
        for (const x of g.ingredients) if (!graph.ingredients.some((y) => y.id === x.id)) graph.ingredients.push(x);
      }
      const adhesion = roots.size ? (await database.raw(
        `select w.sheet_root_id, sum(w.portions_served)::int as served, sum(d.actual)::int as diners
           from waste_records w join diner_counts d on d.unit_id = w.unit_id and d.day = w.day and d.service = w.service
          where w.unit_id = ? and w.sheet_root_id = any(?) and w.portions_served is not null and d.actual > 0 and w.day between ?::date - 30 and ?::date - 1
          group by w.sheet_root_id`, [a.unit.id, [...roots], from, from])).rows : [];
      const stock = await database('stock_balance').where('unit_id', a.unit.id).select('ingredient_id', 'quantity_g');
      const openRows = await database('purchase_order_items as i').join('purchase_orders as o', 'o.id', 'i.order_id').join('ingredients as g', 'g.id', 'i.ingredient_id')
        .where({ 'o.unit_id': a.unit.id, 'o.status': 'sent' }).select('i.ingredient_id', 'i.quantity_units', 'i.received_units', ...['purchase_unit', 'density_g_ml', 'unit_weight_g', 'pack_grams'].map((f) => `g.${f}`));
      const openG = {};
      for (const r of openRows) {
        const gpu = gramsPerPurchaseUnit(r);
        if (gpu) openG[r.ingredient_id] = (openG[r.ingredient_id] ?? 0) + Math.max(0, Number(r.quantity_units) - Number(r.received_units)) * gpu;
      }
      const ingIds = graph.ingredients.map((i) => i.id);
      const prefs = ingIds.length ? (await database.raw(
        `select distinct on (p.ingredient_id) p.ingredient_id, p.supplier_id, s.name as supplier_name, p.price_cents
           from ingredient_prices p left join suppliers s on s.id = p.supplier_id
          where p.ingredient_id = any(?) and p.valid_from <= current_date order by p.ingredient_id, p.valid_from desc, p.created_at desc`, [ingIds])).rows : [];
      return {
        data: {
          unit: { id: a.unit.id, name: a.unit.name }, from, to,
          days: days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i, sheet_id: current.get(i.sheet_root_id)?.id ?? null, name: current.get(i.sheet_root_id)?.name ?? '—' })) })),
          diners: diners.map((d) => ({ ...d, day: dateOut(d.day) })),
          graph,
          adhesion: adhesion.map((r) => ({ sheet_root_id: r.sheet_root_id, rate: r.diners > 0 ? Math.round((r.served / r.diners) * 1000) / 1000 : null })),
          adjustments: await unitAdjustments(a.unit.id),
          stock: stock.map((s2) => ({ ingredient_id: s2.ingredient_id, quantity_g: Number(s2.quantity_g) })),
          open_orders: Object.entries(openG).map(([ingredient_id, g]) => ({ ingredient_id, quantity_g: g })),
          preferred: prefs,
          suppliers: await database('suppliers').where({ organization_id: a.unit.organization_id, active: true }).orderBy('name').select('id', 'name'),
        },
      };
    }

    router.get('/uan/units/:id/purchase-needs', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canStock(a)) return stockForbidden(res);
      const r = await planData(a, req.query.from, req.query.to);
      if (r.error) return bad(res, { to: r.error });
      res.json({ data: r.data });
    });

    // RN-229 — Custos: o plano do período + o consumo real (retiradas para produção valorizadas pelo custo do
    // lote; sem custo no lote, pelo preço vigente do insumo, sinalizado em `estimated`).
    router.get('/uan/units/:id/costs', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canStock(a)) return stockForbidden(res);
      const r = await planData(a, req.query.from, req.query.to);
      if (r.error) return bad(res, { to: r.error });
      const rows = (await database.raw(
        `select (m.created_at at time zone 'America/Sao_Paulo')::date as day, m.ingredient_id, g.name, l.supplier_id, s.name as supplier_name,
                sum(-m.quantity_g)::numeric as grams,
                sum(-m.quantity_g * l.cost_per_kg_cents / 1000.0) filter (where l.cost_per_kg_cents is not null) as cost_lot,
                sum(-m.quantity_g) filter (where l.cost_per_kg_cents is null) as grams_no_cost
           from stock_movements m join stock_lots l on l.id = m.lot_id join ingredients g on g.id = m.ingredient_id
           left join suppliers s on s.id = l.supplier_id
          where m.unit_id = ? and m.kind = 'out_production'
            and (m.created_at at time zone 'America/Sao_Paulo')::date between ?::date and ?::date
          group by 1, 2, 3, 4, 5`, [a.unit.id, r.data.from, r.data.to])).rows;
      // Sem custo no lote: preço vigente por kg do insumo
      const noCost = [...new Set(rows.filter((x) => Number(x.grams_no_cost) > 0).map((x) => x.ingredient_id))];
      const fallback = new Map();
      if (noCost.length) {
        const ings = await database('ingredients').whereIn('id', noCost).select('id', 'purchase_unit', 'density_g_ml', 'unit_weight_g', 'pack_grams', database.raw('(select p.price_cents from ingredient_price_at(ingredients.id) p) as price_cents'));
        for (const i of ings) {
          const gpu = gramsPerPurchaseUnit(i);
          if (gpu && i.price_cents !== null) fallback.set(i.id, (i.price_cents * 1000) / gpu);
        }
      }
      const consumption = rows.map((x) => {
        const est = Number(x.grams_no_cost ?? 0);
        const perKg = fallback.get(x.ingredient_id);
        return {
          day: dateOut(x.day), ingredient_id: x.ingredient_id, name: x.name, supplier_id: x.supplier_id, supplier_name: x.supplier_name,
          grams: Number(x.grams), cost_cents: Math.round(Number(x.cost_lot ?? 0) + (est && perKg ? (est * perKg) / 1000 : 0)), estimated: est > 0, missing_cost: est > 0 && !perKg,
        };
      });
      res.json({ data: { ...r.data, consumption, criterion: 'Consumo = retiradas do estoque para produção, valorizadas pelo custo do lote (ou pelo preço vigente quando o lote não tem custo).' } });
    });

    function poItems(list) {
      if (!Array.isArray(list) || !list.length || list.length > 300) return { error: 'Inclua de 1 a 300 itens.' };
      const items = [];
      for (const it of list) {
        const q = parseQty(it?.quantity_units);
        if (!isUuid(it?.ingredient_id) || !q) return { error: 'Item inválido: confira insumo e quantidade.' };
        const price = it.unit_price === undefined || it.unit_price === null || it.unit_price === '' ? null : Number(String(it.unit_price).replace(',', '.'));
        if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1_000_000)) return { error: 'Preço inválido.' };
        if (items.some((x) => x.ingredient_id === it.ingredient_id)) return { error: 'Insumo repetido no pedido.' };
        items.push({ ingredient_id: it.ingredient_id, quantity_units: Math.round(q * 100) / 100, unit_price_cents: price === null ? null : Math.round(price * 100) });
      }
      return { items };
    }
    async function fillPrices(items) {
      const missing = items.filter((i) => i.unit_price_cents === null).map((i) => i.ingredient_id);
      if (!missing.length) return items;
      const rows = (await database.raw('select ingredient_id, price_cents from (select distinct on (ingredient_id) ingredient_id, price_cents from ingredient_prices where ingredient_id = any(?) and valid_from <= current_date order by ingredient_id, valid_from desc, created_at desc) p', [missing])).rows;
      return items.map((i) => (i.unit_price_cents === null ? { ...i, unit_price_cents: rows.find((r) => r.ingredient_id === i.ingredient_id)?.price_cents ?? null } : i));
    }

    router.get('/uan/units/:id/purchase-orders', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canStock(a)) return stockForbidden(res);
      const rows = await database('purchase_orders as o').leftJoin('suppliers as s', 's.id', 'o.supplier_id').where('o.unit_id', a.unit.id)
        .orderBy('o.created_at', 'desc').limit(100)
        .select(...PO_FIELDS.map((f) => `o.${f}`), 's.name as supplier_name',
          database.raw('(select count(*)::int from purchase_order_items i where i.order_id = o.id) as item_count'),
          database.raw('(select coalesce(sum(round(i.quantity_units * coalesce(i.unit_price_cents, 0))), 0)::bigint from purchase_order_items i where i.order_id = o.id) as total_cents'));
      res.json({ data: { unit: { id: a.unit.id, name: a.unit.name }, items: rows.map((r) => ({ ...poOut(r), total_cents: Number(r.total_cents) })) } });
    });

    router.post('/uan/units/:id/purchase-orders', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canStock(a)) return stockForbidden(res);
      const orders = Array.isArray(req.body?.orders) ? req.body.orders : [req.body ?? {}];
      if (!orders.length || orders.length > 50) return bad(res, { orders: 'Nada para gerar.' });
      const parsed = [];
      for (const o of orders) {
        if (o.supplier_id && !isUuid(o.supplier_id)) return bad(res, { supplier_id: 'Fornecedor inválido.' });
        if (o.expected_on && !isIsoDate(o.expected_on)) return bad(res, { expected_on: 'Data inválida.' });
        const p = poItems(o.items);
        if (p.error) return bad(res, { items: p.error });
        parsed.push({ supplier_id: o.supplier_id || null, expected_on: o.expected_on || null, items: await fillPrices(p.items) });
      }
      try {
        const ids = await withActor(user, async (trx) => {
          const out = [];
          for (const o of parsed) {
            const [row] = await trx('purchase_orders').insert({ unit_id: a.unit.id, organization_id: a.unit.organization_id, supplier_id: o.supplier_id, expected_on: o.expected_on, created_by: user }).returning(['id']);
            await trx('purchase_order_items').insert(o.items.map((i) => ({ ...i, order_id: row.id })));
            out.push(row.id);
          }
          return out;
        });
        res.status(201).json({ data: { ids, id: ids[0] } });
      } catch (error) {
        p0001(res, error, 'criar pedido');
      }
    });

    async function poAccess(user, id) {
      if (!isUuid(id)) return null;
      const order = await database('purchase_orders').where('id', id).first(...PO_FIELDS);
      if (!order) return null;
      const a = await unitAccess(user, order.unit_id);
      return a && canStock(a) ? { order: poOut(order), a } : null;
    }

    router.get('/uan/purchase-orders/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await poAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Pedido');
      const items = await database('purchase_order_items as i').join('ingredients as g', 'g.id', 'i.ingredient_id').where('i.order_id', x.order.id).orderBy('g.name')
        .select('i.ingredient_id', 'i.quantity_units', 'i.unit_price_cents', 'i.received_units', 'g.name', 'g.storage', 'g.category', ...['purchase_unit', 'density_g_ml', 'unit_weight_g', 'pack_grams'].map((f) => `g.${f}`));
      const supplier = x.order.supplier_id ? await database('suppliers').where('id', x.order.supplier_id).first('id', 'name', 'phone', 'email') : null;
      const receipts = await database('goods_receipts as r').leftJoin('directus_users as u', 'u.id', 'r.received_by').where('r.order_id', x.order.id)
        .select('r.id', 'r.invoice_number', 'r.received_at', 'u.first_name', 'u.last_name');
      const receiptItems = receipts.length ? await database('goods_receipt_items').whereIn('receipt_id', receipts.map((r) => r.id))
        .select('receipt_id', 'ingredient_id', 'quantity_units', 'accepted', 'lot_code', 'expires_on', 'temperature', 'reject_reason', 'non_conformity_id') : [];
      res.json({
        data: {
          order: x.order,
          unit: { id: x.a.unit.id, name: x.a.unit.name },
          supplier,
          suppliers: await database('suppliers').where({ organization_id: x.a.unit.organization_id, active: true }).orderBy('name').select('id', 'name'),
          catalog: x.order.status === 'draft' ? await database('ingredients').where({ organization_id: x.a.unit.organization_id, active: true }).orderBy('name').select('id', 'name', 'purchase_unit') : [],
          items: items.map((i) => ({ ingredient_id: i.ingredient_id, name: i.name, storage: i.storage, category: i.category, purchase_unit: i.purchase_unit, quantity_units: Number(i.quantity_units), unit_price_cents: i.unit_price_cents, received_units: Number(i.received_units) })),
          receipts: receipts.map((r) => ({ id: r.id, invoice_number: r.invoice_number, received_at: r.received_at, received_by_name: userName(r), items: receiptItems.filter((ri) => ri.receipt_id === r.id).map((ri) => ({ ...ri, quantity_units: Number(ri.quantity_units), temperature: numOrNull(ri.temperature), expires_on: dateOut(ri.expires_on) })) })),
        },
      });
    });

    router.put('/uan/purchase-orders/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await poAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Pedido');
      if (x.order.status !== 'draft') return conflict(res, 'Só o pedido em rascunho pode ser alterado.');
      const b = req.body ?? {};
      if (b.supplier_id && !isUuid(b.supplier_id)) return bad(res, { supplier_id: 'Fornecedor inválido.' });
      if (b.expected_on && !isIsoDate(b.expected_on)) return bad(res, { expected_on: 'Data inválida.' });
      const p = poItems(b.items);
      if (p.error) return bad(res, { items: p.error });
      try {
        await withActor(user, async (trx) => {
          await trx('purchase_orders').where('id', x.order.id).update({ supplier_id: b.supplier_id || null, expected_on: b.expected_on || null, notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null });
          await trx('purchase_order_items').where('order_id', x.order.id).del();
          await trx('purchase_order_items').insert(p.items.map((i) => ({ ...i, order_id: x.order.id })));
        });
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'salvar pedido');
      }
    });

    for (const action of ['send', 'cancel']) router.post(`/uan/purchase-orders/:id/${action}`, async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await poAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Pedido');
      const allowed = action === 'send' ? x.order.status === 'draft' : ['draft', 'sent'].includes(x.order.status);
      if (!allowed) return conflict(res, 'Ação não permitida na situação atual do pedido.');
      await withActor(user, (trx) => trx('purchase_orders').where('id', x.order.id).update({ status: action === 'send' ? 'sent' : 'cancelled' }));
      res.json({ data: { ok: true } });
    });

    router.post('/uan/purchase-orders/:id/receive', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await poAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Pedido');
      const b = req.body ?? {};
      const list = Array.isArray(b.items) ? b.items : [];
      if (!list.length) return bad(res, { items: 'Confira ao menos um item.' });
      const items = [];
      for (const it of list) {
        if (!isUuid(it?.ingredient_id)) return bad(res, { items: 'Item inválido.' });
        const qty = Number(String(it.quantity_units ?? '').replace(',', '.'));
        const temp = it.temperature === undefined || it.temperature === null || it.temperature === '' ? null : Number(String(it.temperature).replace(',', '.').replace('−', '-'));
        const price = it.unit_price === undefined || it.unit_price === null || it.unit_price === '' ? null : Number(String(it.unit_price).replace(',', '.'));
        if (!Number.isFinite(qty) || qty < 0) return bad(res, { items: 'Quantidade inválida.' });
        if (temp !== null && (!Number.isFinite(temp) || temp < -60 || temp > 100)) return bad(res, { items: 'Temperatura inválida.' });
        if (price !== null && (!Number.isFinite(price) || price < 0)) return bad(res, { items: 'Preço inválido.' });
        if (it.expires_on && !isIsoDate(it.expires_on)) return bad(res, { items: 'Validade inválida.' });
        items.push({
          ingredient_id: it.ingredient_id, quantity_units: qty, accepted: it.accepted === true, lot_code: typeof it.lot_code === 'string' ? it.lot_code.slice(0, 60) : null,
          expires_on: it.expires_on || null, temperature: temp, unit_price_cents: price === null ? null : Math.round(price * 100),
          reject_reason: typeof it.reject_reason === 'string' ? it.reject_reason.slice(0, 500) : null,
          image: it.accepted !== true && typeof it.image === 'string' ? it.image : null,
        });
      }
      // RN-141: foto da recusa (vai para o item e para a não conformidade)
      const uploaded = [];
      for (const it of items) {
        if (it.image) {
          const photo = await uploadEvidence(it.image, `recusa-${x.order.id}`);
          if (!photo) { for (const f of uploaded) await dropFile(f); return bad(res, { items: 'Foto da recusa inválida (JPG ou PNG de até 600 KB).' }); }
          uploaded.push(photo);
          it.photo = photo;
        }
        delete it.image;
      }
      try {
        const id = await withActor(user, async (trx) => (await trx.raw('select receive_order(?, ?, ?, ?, ?::jsonb) as id',
          [x.order.id, user, typeof b.invoice_number === 'string' ? b.invoice_number.slice(0, 60) : null, typeof b.notes === 'string' ? b.notes.slice(0, 1000) : null, JSON.stringify(items)])).rows[0].id);
        res.json({ data: { id } });
      } catch (error) {
        for (const f of uploaded) await dropFile(f);
        p0001(res, error, 'receber pedido');
      }
    });

    // RN-129: foto da preparação (muda em qualquer situação da ficha; cada versão tem a sua)
    router.post('/uan/tech-sheets/:id/photo', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await sheetAccess(user, req.params.id);
      if (!x) return sheetNotFound(res);
      if (!x.roles.edit) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT mudam a foto.', extensions: { code: 'FORBIDDEN' } }] });
      const old = x.sheet.photo;
      let photo = null;
      if (req.body?.image !== null) {
        photo = await uploadEvidence(req.body?.image, `ficha-${x.sheet.id}`);
        if (!photo) return bad(res, { image: 'Use uma foto JPG ou PNG de até 600 KB.' });
      }
      try {
        await withActor(user, (trx) => trx('tech_sheets').where('id', x.sheet.id).update({ photo }));
        if (old) await dropFile(old);
        res.json({ data: { ok: true } });
      } catch (error) {
        await dropFile(photo);
        p0001(res, error, 'salvar foto da ficha');
      }
    });

    router.get('/uan/tech-sheets/:id/photo', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await sheetAccess(user, req.params.id);
      if (!x?.sheet.photo) return res.status(404).json({ errors: [{ message: 'Foto não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
      try {
        const assets = new services.AssetsService({ schema: await getSchema(), accountability: null });
        const { stream, file } = await assets.getAsset(x.sheet.photo);
        res.setHeader('Content-Type', file.type ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        stream.pipe(res);
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao ler foto da ficha');
        res.status(404).json({ errors: [{ message: 'Foto não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
      }
    });

    // ── Documentos de BPF, ciência e treinamentos (U6a: RN-155, RN-156, RN-158, RN-159) ─────────
    // Ver e dar ciência: equipe da unidade. Criar e editar rascunho, registrar treinamento: owner, gestor, RT.
    // Aprovar versão: RT da unidade ou owner (doc_version_approve confere de novo).
    const canApproveDoc = (a) => a.isOwner || a.roles.includes('technical_lead');
    const DOC_KINDS = new Set(['pop', 'manual', 'other']);

    router.get('/uan/units/:id/documents', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const docs = await database('quality_documents as d').leftJoin('quality_document_current as c', 'c.document_id', 'd.id')
        .where({ 'd.unit_id': a.unit.id, 'd.archived': false }).orderBy([{ column: 'd.kind' }, { column: 'd.title' }])
        .select('d.id', 'd.kind', 'd.code', 'd.title', 'd.review_every_months', 'c.version_id', 'c.version', 'c.approved_at', 'c.next_review_on',
          database.raw("exists (select 1 from quality_document_versions v where v.document_id = d.id and v.status = 'draft') as has_draft"),
          database.raw('exists (select 1 from document_acknowledgements k where k.version_id = c.version_id and k.user_id = ?) as acknowledged', [user]));
      const team = await database('unit_members').where('unit_id', a.unit.id).distinct('user_id');
      const ackCounts = docs.some((d) => d.version_id) ? await database('document_acknowledgements').whereIn('version_id', docs.map((d) => d.version_id).filter(Boolean))
        .whereIn('user_id', team.map((t) => t.user_id)).groupBy('version_id').select('version_id').count({ n: '*' }) : [];
      const rt = await database('unit_members as m').join('directus_users as u', 'u.id', 'm.user_id').where({ 'm.unit_id': a.unit.id, 'm.role': 'technical_lead' }).first('u.first_name', 'u.last_name');
      const equipment = await database('equipment').where({ unit_id: a.unit.id, active: true }).orderBy('name').select('name', 'kind');
      const today = localToday();
      res.json({
        data: {
          unit: { id: a.unit.id, name: a.unit.name, address: a.unit.address, city: a.unit.city, state: a.unit.state, cnpj: a.unit.cnpj },
          technical_lead: userName(rt),
          equipment,
          can_edit: canSupervise(a),
          can_approve: canApproveDoc(a),
          team_size: team.length,
          documents: docs.map((d) => ({
            ...d, next_review_on: dateOut(d.next_review_on), review_overdue: Boolean(d.next_review_on && dateOut(d.next_review_on) < today),
            ack_count: Number(ackCounts.find((c) => c.version_id === d.version_id)?.n ?? 0),
          })),
        },
      });
    });

    router.post('/uan/units/:id/documents', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT criam documentos.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      const title = typeof b.title === 'string' ? b.title.trim() : '';
      const body = typeof b.body_md === 'string' ? b.body_md : '';
      const errors = {};
      if (title.length < 3 || title.length > 160) errors.title = 'Informe o título (3 a 160 caracteres).';
      if (!DOC_KINDS.has(b.kind ?? 'pop')) errors.kind = 'Tipo inválido.';
      if (b.code && !/^[a-z0-9-]{2,60}$/.test(b.code)) errors.code = 'Código inválido.';
      if (!body.trim() || body.length > 100000) errors.body_md = 'Escreva o conteúdo (até 100.000 caracteres).';
      const months = b.review_every_months === undefined ? 12 : Number(b.review_every_months);
      if (!Number.isInteger(months) || months < 1 || months > 60) errors.review_every_months = 'Revisão entre 1 e 60 meses.';
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        const id = await withActor(user, async (trx) => {
          const [d] = await trx('quality_documents').insert({ unit_id: a.unit.id, organization_id: a.unit.organization_id, kind: b.kind ?? 'pop', code: b.code || null, title, review_every_months: months, created_by: user }).returning(['id']);
          await trx('quality_document_versions').insert({ document_id: d.id, version: 1, body_md: body, change_summary: 'Primeira versão', created_by: user });
          return d.id;
        });
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'criar documento');
      }
    });

    async function docAccess(user, id) {
      if (!isUuid(id)) return null;
      const doc = await database('quality_documents').where('id', id).first('id', 'unit_id', 'kind', 'code', 'title', 'review_every_months', 'archived');
      if (!doc) return null;
      const a = await unitAccess(user, doc.unit_id);
      return a ? { doc, a } : null;
    }

    router.get('/uan/documents/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await docAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Documento');
      const versions = await database('quality_document_versions as v').leftJoin('directus_users as u', 'u.id', 'v.approved_by').where('v.document_id', x.doc.id).orderBy('v.version', 'desc')
        .select('v.id', 'v.version', 'v.status', 'v.change_summary', 'v.approved_at', 'v.next_review_on', 'v.content_hash', 'v.body_md', 'u.first_name', 'u.last_name');
      const current = versions.find((v) => v.status === 'approved') ?? null;
      const draft = versions.find((v) => v.status === 'draft') ?? null;
      let acks = [];
      if (current && (canSupervise(x.a))) {
        acks = await database('unit_members as m').join('directus_users as u', 'u.id', 'm.user_id').where('m.unit_id', x.a.unit.id)
          .leftJoin('document_acknowledgements as k', function () { this.on('k.user_id', 'm.user_id').andOn('k.version_id', database.raw('?', [current.id])); })
          .distinct('m.user_id', 'u.first_name', 'u.last_name', 'u.email', 'k.acknowledged_at').orderBy('u.first_name');
      }
      const mine = current ? Boolean(await database('document_acknowledgements').where({ version_id: current.id, user_id: user }).first('user_id')) : false;
      const strip = (v) => v && ({ id: v.id, version: v.version, status: v.status, change_summary: v.change_summary, approved_at: v.approved_at, next_review_on: dateOut(v.next_review_on), content_hash: v.content_hash, approved_by_name: userName(v) });
      res.json({
        data: {
          document: x.doc,
          unit: { id: x.a.unit.id, name: x.a.unit.name },
          current: current ? { ...strip(current), body_md: current.body_md } : null,
          // o rascunho só para quem edita ou aprova
          draft: draft && (canSupervise(x.a) || canApproveDoc(x.a)) ? { ...strip(draft), body_md: draft.body_md } : null,
          versions: versions.map(strip),
          acknowledged: mine,
          acks: acks.map((k) => ({ user_id: k.user_id, name: userName(k) ?? k.email, acknowledged_at: k.acknowledged_at })),
          can_edit: canSupervise(x.a),
          can_approve: canApproveDoc(x.a),
        },
      });
    });

    router.put('/uan/documents/:id/draft', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await docAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Documento');
      if (!canSupervise(x.a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT editam documentos.', extensions: { code: 'FORBIDDEN' } }] });
      const body = typeof req.body?.body_md === 'string' ? req.body.body_md : '';
      if (!body.trim() || body.length > 100000) return bad(res, { body_md: 'Escreva o conteúdo (até 100.000 caracteres).' });
      const summary = typeof req.body?.change_summary === 'string' && req.body.change_summary.trim() ? req.body.change_summary.trim().slice(0, 500) : null;
      try {
        await withActor(user, async (trx) => {
          const draft = await trx('quality_document_versions').where({ document_id: x.doc.id, status: 'draft' }).first('id');
          if (draft) await trx('quality_document_versions').where('id', draft.id).update({ body_md: body, change_summary: summary });
          else {
            const max = await trx('quality_document_versions').where('document_id', x.doc.id).max('version as v').first();
            await trx('quality_document_versions').insert({ document_id: x.doc.id, version: Number(max?.v ?? 0) + 1, body_md: body, change_summary: summary, created_by: user });
          }
        });
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'salvar rascunho');
      }
    });

    router.post('/uan/documents/:id/approve', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await docAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Documento');
      if (!canApproveDoc(x.a)) return res.status(403).json({ errors: [{ message: 'Só o RT da unidade ou o responsável pela empresa aprovam documentos.', extensions: { code: 'FORBIDDEN' } }] });
      const draft = await database('quality_document_versions').where({ document_id: x.doc.id, status: 'draft' }).first('id');
      if (!draft) return conflict(res, 'Não há rascunho para aprovar.');
      try {
        await withActor(user, (trx) => trx.raw('select * from doc_version_approve(?, ?)', [draft.id, user]));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'aprovar documento');
      }
    });

    router.post('/uan/documents/:id/acknowledge', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await docAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Documento');
      const current = await database('quality_document_current').where('document_id', x.doc.id).first('version_id');
      if (!current) return conflict(res, 'O documento ainda não tem versão aprovada.');
      await database('document_acknowledgements').insert({ version_id: current.version_id, user_id: user }).onConflict(['version_id', 'user_id']).ignore();
      res.json({ data: { ok: true } });
    });

    router.get('/uan/units/:id/trainings', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const list = await database('trainings').where('unit_id', a.unit.id).orderBy('held_on', 'desc').limit(200).select('id', 'topic', 'held_on', 'hours', 'instructor', 'notes');
      const att = list.length ? await database('training_attendees as t').leftJoin('directus_users as u', 'u.id', 't.user_id').whereIn('t.training_id', list.map((t) => t.id))
        .select('t.training_id', 't.user_id', 't.name', 'u.first_name', 'u.last_name') : [];
      const team = await database('unit_members as m').join('directus_users as u', 'u.id', 'm.user_id').where('m.unit_id', a.unit.id)
        .distinct('m.user_id', 'u.first_name', 'u.last_name', 'u.email').orderBy('u.first_name');
      const last = (await database.raw(
        `select a.user_id, max(t.held_on) as last_on from training_attendees a join trainings t on t.id = a.training_id
          where t.unit_id = ? and a.user_id is not null group by a.user_id`, [a.unit.id])).rows;
      res.json({
        data: {
          unit: { id: a.unit.id, name: a.unit.name },
          can_edit: canSupervise(a),
          trainings: list.map((t) => ({ ...t, held_on: dateOut(t.held_on), hours: Number(t.hours), attendees: att.filter((x) => x.training_id === t.id).map((x) => userName(x) ?? x.name) })),
          team: team.map((m) => ({ user_id: m.user_id, name: userName(m) ?? m.email, last_training_on: dateOut(last.find((l) => l.user_id === m.user_id)?.last_on ?? null) })),
        },
      });
    });

    router.post('/uan/units/:id/trainings', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT registram treinamentos.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      const topic = typeof b.topic === 'string' ? b.topic.trim() : '';
      const hours = Number(String(b.hours ?? '').replace(',', '.'));
      const errors = {};
      if (topic.length < 3 || topic.length > 200) errors.topic = 'Informe o tema.';
      if (!isIsoDate(b.held_on)) errors.held_on = 'Informe a data.';
      if (!Number.isFinite(hours) || hours <= 0 || hours > 200) errors.hours = 'Carga horária entre 0,5 e 200 h.';
      const ids = Array.isArray(b.attendee_ids) ? [...new Set(b.attendee_ids.filter(isUuid))] : [];
      const others = Array.isArray(b.other_names) ? b.other_names.map((n) => String(n).trim()).filter((n) => n.length >= 2).map((n) => n.slice(0, 120)) : [];
      if (!ids.length && !others.length) errors.attendee_ids = 'Marque quem participou.';
      if (ids.length) {
        const members = await database('unit_members').where('unit_id', a.unit.id).whereIn('user_id', ids).distinct('user_id');
        if (members.length !== ids.length) errors.attendee_ids = 'Participante fora da equipe da unidade.';
      }
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        const id = await withActor(user, async (trx) => {
          const [t] = await trx('trainings').insert({ unit_id: a.unit.id, organization_id: a.unit.organization_id, topic, held_on: b.held_on, hours: Math.round(hours * 10) / 10, instructor: typeof b.instructor === 'string' && b.instructor.trim() ? b.instructor.trim().slice(0, 120) : null, notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null, created_by: user }).returning(['id']);
          const rows = [...ids.map((user_id) => ({ training_id: t.id, user_id })), ...others.map((name) => ({ training_id: t.id, name }))];
          await trx('training_attendees').insert(rows);
          return t.id;
        });
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'registrar treinamento');
      }
    });

    // ── U6b: licenças, integridade, dossiê e Manual de Boas Práticas (RN-157, RN-166, RN-167) ─────────
    const LICENSE_KINDS = new Set(['sanitary_permit', 'rt_certificate', 'pest_control', 'water_tank_cleaning', 'fire_permit', 'other']);
    const canAudit = (a) => canSupervise(a) || a.roles.includes('auditor');
    const auditForbidden = (res) => res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor, o RT ou o auditor veem os registros consolidados.', extensions: { code: 'FORBIDDEN' } }] });
    const LICENSE_FIELDS = ['id', 'kind', 'title', 'number', 'issued_on', 'valid_until', 'provider', 'notes', 'archived', 'created_at'];
    const licenseOut = (l) => ({ ...l, issued_on: dateOut(l.issued_on), valid_until: dateOut(l.valid_until) });

    function licenseBody(b) {
      const errors = {};
      const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
      if (!LICENSE_KINDS.has(b.kind)) errors.kind = 'Escolha o tipo.';
      const issued = b.issued_on ? b.issued_on : null;
      const until = b.valid_until ? b.valid_until : null;
      if (issued !== null && !isIsoDate(issued)) errors.issued_on = 'Data inválida.';
      if (until !== null && !isIsoDate(until)) errors.valid_until = 'Data inválida.';
      if (issued && until && isIsoDate(issued) && isIsoDate(until) && until < issued) errors.valid_until = 'A validade vem depois da emissão.';
      if (b.kind === 'other' && !str(b.title, 160)) errors.title = 'Dê um nome ao documento.';
      return { errors, data: { kind: b.kind, title: str(b.title, 160), number: str(b.number, 80), issued_on: issued, valid_until: until, provider: str(b.provider, 160), notes: str(b.notes, 1000) } };
    }

    router.get('/uan/units/:id/licenses', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const list = await database('unit_licenses').where('unit_id', a.unit.id).orderBy([{ column: 'archived' }, { column: 'valid_until', nulls: 'last' }]).select(LICENSE_FIELDS);
      res.json({ data: { unit: { id: a.unit.id, name: a.unit.name }, can_edit: canSupervise(a), today: localToday(), licenses: list.map(licenseOut) } });
    });

    router.post('/uan/units/:id/licenses', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT registram licenças.', extensions: { code: 'FORBIDDEN' } }] });
      const { errors, data } = licenseBody(req.body ?? {});
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        const [row] = await withActor(user, (trx) => trx('unit_licenses').insert({ ...data, unit_id: a.unit.id, organization_id: a.unit.organization_id, created_by: user }).returning(['id']));
        res.status(201).json({ data: { id: row.id } });
      } catch (error) {
        p0001(res, error, 'registrar licença');
      }
    });

    router.patch('/uan/licenses/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const lic = isUuid(req.params.id) ? await database('unit_licenses').where('id', req.params.id).first('id', 'unit_id', 'kind') : null;
      const a = lic ? await unitAccess(user, lic.unit_id) : null;
      if (!a) return notFoundMsg(res, 'Licença');
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT editam licenças.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      let patch;
      if (typeof b.archived === 'boolean' && Object.keys(b).length === 1) patch = { archived: b.archived };
      else {
        const { errors, data } = licenseBody({ kind: lic.kind, ...b });
        if (Object.keys(errors).length) return bad(res, errors);
        patch = data;
      }
      try {
        await withActor(user, (trx) => trx('unit_licenses').where('id', lic.id).update(patch));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'salvar licença');
      }
    });

    function periodOf(req, res, maxDays = 366) {
      const today = localToday();
      const to = isIsoDate(req.query.to) ? req.query.to : today;
      const from = isIsoDate(req.query.from) ? req.query.from : new Date(Date.parse(`${to}T12:00:00Z`) - 29 * 86400e3).toISOString().slice(0, 10);
      const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400e3);
      if (days < 0 || days > maxDays) {
        bad(res, { from: `Período de até ${maxDays + 1} dias.` });
        return null;
      }
      return { from, to };
    }

    async function integrityRows(unitId, from, to) {
      const rows = (await database.raw('select * from uan_integrity_check(?, ?, ?)', [unitId, from, to])).rows;
      return rows.map((r) => ({ kind: r.kind, record_id: r.record_id, label: r.label, recorded_at: r.recorded_at, stored_hash: r.stored_hash, computed_hash: r.computed_hash, ok: r.ok }));
    }

    router.get('/uan/units/:id/integrity', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canAudit(a)) return auditForbidden(res);
      const p = periodOf(req, res);
      if (!p) return;
      const rows = await integrityRows(a.unit.id, p.from, p.to);
      res.json({ data: { unit: { id: a.unit.id, name: a.unit.name }, ...p, total: rows.length, divergent: rows.filter((r) => !r.ok).length, rows } });
    });

    async function unitRt(unitId) {
      const rt = await database('unit_members as m').join('directus_users as u', 'u.id', 'm.user_id').where({ 'm.unit_id': unitId, 'm.role': 'technical_lead' }).first('u.first_name', 'u.last_name', 'u.email');
      return rt ? userName(rt) ?? rt.email : null;
    }

    async function currentDocs(unitId, withBody) {
      const rows = await database('quality_documents as d').join('quality_document_current as c', 'c.document_id', 'd.id')
        .join('quality_document_versions as v', 'v.id', 'c.version_id').leftJoin('directus_users as u', 'u.id', 'v.approved_by')
        .where({ 'd.unit_id': unitId, 'd.archived': false }).orderBy([{ column: 'd.kind' }, { column: 'd.code' }, { column: 'd.title' }])
        .select('d.id', 'd.kind', 'd.code', 'd.title', 'v.id as version_id', 'v.version', 'v.approved_at', 'v.next_review_on', 'v.content_hash', 'v.body_md', 'u.first_name', 'u.last_name');
      return rows.map((r) => ({ id: r.id, kind: r.kind, code: r.code, title: r.title, version_id: r.version_id, version: r.version, approved_at: r.approved_at,
        next_review_on: dateOut(r.next_review_on), content_hash: r.content_hash, approved_by_name: userName(r), ...(withBody ? { body_md: r.body_md } : {}) }));
    }

    router.get('/uan/units/:id/dossier', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canAudit(a)) return auditForbidden(res);
      const p = periodOf(req, res, 91);
      if (!p) return;
      const tz = 'America/Sao_Paulo';
      const inPeriod = (col) => database.raw(`${col} >= ?::timestamp at time zone '${tz}' and ${col} < (?::date + 1)::timestamp at time zone '${tz}'`, [p.from, p.to]);
      const [rt, licenses, docs, manual, trainings, runs, ncItems, readings, ncs, integrity, org] = await Promise.all([
        unitRt(a.unit.id),
        database('unit_licenses').where({ unit_id: a.unit.id, archived: false }).orderBy('valid_until').select(LICENSE_FIELDS),
        currentDocs(a.unit.id, true),
        database('compliance_exports').where({ unit_id: a.unit.id, kind: 'manual' }).orderBy('edition', 'desc').first('edition', 'created_at', 'signed_name', 'file_hash'),
        database('trainings').where('unit_id', a.unit.id).whereBetween('held_on', [p.from, p.to]).orderBy('held_on').select('id', 'topic', 'held_on', 'hours', 'instructor'),
        database('checklist_runs as r').leftJoin('directus_users as u', 'u.id', 'r.completed_by').where({ 'r.unit_id': a.unit.id, 'r.status': 'completed' }).where(inPeriod('r.completed_at'))
          .orderBy('r.completed_at').limit(2000).select('r.id', 'r.template_name', 'r.completed_at', 'r.score', 'r.conform_count', 'r.non_conform_count', 'r.na_count', 'r.content_hash', 'u.first_name', 'u.last_name'),
        database('checklist_answers as x').join('checklist_runs as r', 'r.id', 'x.run_id').where({ 'r.unit_id': a.unit.id, 'r.status': 'completed', 'x.value': 'non_conform' }).where(inPeriod('r.completed_at'))
          .orderBy([{ column: 'r.completed_at' }, { column: 'x.position' }]).limit(2000).select('x.run_id', 'x.prompt', 'x.critical', 'x.comment', 'x.number_value', 'x.unit'),
        database('temperature_readings as t').leftJoin('equipment as e', 'e.id', 't.equipment_id').leftJoin('directus_users as u', 'u.id', 't.recorded_by')
          .where('t.unit_id', a.unit.id).where(inPeriod('t.recorded_at')).orderBy([{ column: 't.recorded_at' }, { column: 't.seq' }]).limit(5000)
          .select('t.recorded_at', 'e.name as equipment', 't.food_stage', 't.food_name', 't.value', 't.min_temp', 't.max_temp', 't.out_of_range', 't.corrective_action', 'u.first_name', 'u.last_name'),
        database('non_conformities').where('unit_id', a.unit.id).where(inPeriod('opened_at')).orderBy('opened_at').limit(1000)
          .select('id', 'source', 'title', 'severity', 'status', 'opened_at', 'due_at', 'closed_at', 'closing_note',
            database.raw('(select count(*) from action_plans ap where ap.non_conformity_id = non_conformities.id)::int as plans')),
        integrityRows(a.unit.id, p.from, p.to),
        database('organizations').where('id', a.unit.organization_id).first('name'),
      ]);
      const att = trainings.length ? await database('training_attendees as t').leftJoin('directus_users as u', 'u.id', 't.user_id').whereIn('t.training_id', trainings.map((t) => t.id)).select('t.training_id', 't.name', 'u.first_name', 'u.last_name') : [];
      const u = a.unit;
      res.json({
        data: {
          period: p,
          generated_at: new Date().toISOString(),
          organization: org?.name ?? null,
          unit: { id: u.id, name: u.name, cnpj: u.cnpj, address: u.address, city: u.city, state: u.state, sanitary_license: u.sanitary_license, sanitary_license_expires_at: dateOut(u.sanitary_license_expires_at) },
          technical_lead: rt,
          licenses: licenses.map(licenseOut),
          documents: docs,
          manual: manual ? { ...manual } : null,
          trainings: trainings.map((t) => ({ ...t, held_on: dateOut(t.held_on), hours: Number(t.hours), attendees: att.filter((x) => x.training_id === t.id).map((x) => userName(x) ?? x.name) })),
          checklists: runs.map((r) => ({ id: r.id, template_name: r.template_name, completed_at: r.completed_at, score: numOrNull(r.score), conform: r.conform_count, non_conform: r.non_conform_count, na: r.na_count,
            completed_by: userName(r), content_hash: r.content_hash, failures: ncItems.filter((x) => x.run_id === r.id).map((x) => ({ prompt: x.prompt, critical: x.critical, comment: x.comment, value: numOrNull(x.number_value), unit: x.unit })) })),
          temperatures: readings.map((t) => ({ recorded_at: t.recorded_at, target: t.equipment ?? `${t.food_name} (${t.food_stage})`, value: Number(t.value), min: numOrNull(t.min_temp), max: numOrNull(t.max_temp), out_of_range: t.out_of_range, corrective_action: t.corrective_action, by: userName(t) })),
          non_conformities: ncs.map((n) => ({ ...n, plans: Number(n.plans) })),
          integrity: { total: integrity.length, divergent: integrity.filter((r) => !r.ok).length, rows: integrity.filter((r) => !r.ok) },
          truncated: runs.length >= 2000 || readings.length >= 5000 || ncs.length >= 1000,
        },
      });
    });

    router.get('/uan/units/:id/manual', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const [rt, docs, equipment, licenses, editions, org, team, lastTraining] = await Promise.all([
        unitRt(a.unit.id),
        currentDocs(a.unit.id, true),
        database('equipment').where({ unit_id: a.unit.id, active: true }).orderBy('name').select('name', 'kind', 'min_temp', 'max_temp'),
        database('unit_licenses').where({ unit_id: a.unit.id, archived: false }).orderBy('valid_until').select(LICENSE_FIELDS),
        database('compliance_exports as e').leftJoin('directus_users as u', 'u.id', 'e.created_by').where({ 'e.unit_id': a.unit.id, 'e.kind': 'manual' }).orderBy('e.edition', 'desc').limit(20)
          .select('e.id', 'e.edition', 'e.created_at', 'e.signed_name', 'e.file_hash', 'e.includes', 'u.first_name', 'u.last_name'),
        database('organizations').where('id', a.unit.organization_id).first('name'),
        database('unit_members').where('unit_id', a.unit.id).countDistinct({ n: 'user_id' }).first(),
        database('trainings').where('unit_id', a.unit.id).max('held_on as d').first(),
      ]);
      const u = a.unit;
      res.json({
        data: {
          organization: org?.name ?? null,
          unit: { id: u.id, name: u.name, kind: u.kind, cnpj: u.cnpj, address: u.address, city: u.city, state: u.state, sanitary_license: u.sanitary_license, sanitary_license_expires_at: dateOut(u.sanitary_license_expires_at) },
          technical_lead: rt,
          team_size: Number(team?.n ?? 0),
          last_training_on: dateOut(lastTraining?.d ?? null),
          equipment: equipment.map((e) => ({ ...e, min_temp: numOrNull(e.min_temp), max_temp: numOrNull(e.max_temp) })),
          licenses: licenses.map(licenseOut),
          documents: docs,
          editions: editions.map((e) => ({ id: e.id, edition: e.edition, created_at: e.created_at, signed_name: e.signed_name, file_hash: e.file_hash, created_by_name: userName(e), documents: (e.includes?.documents ?? []).length })),
          can_issue: canApproveDoc(a),
          can_audit: canAudit(a),
        },
      });
    });

    router.get('/uan/units/:id/exports', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canAudit(a)) return auditForbidden(res);
      const list = await database('compliance_exports as e').leftJoin('directus_users as u', 'u.id', 'e.created_by').where('e.unit_id', a.unit.id).orderBy('e.created_at', 'desc').limit(50)
        .select('e.id', 'e.kind', 'e.edition', 'e.period_from', 'e.period_to', 'e.integrity', 'e.file_hash', 'e.signed_name', 'e.created_at', 'u.first_name', 'u.last_name');
      res.json({ data: list.map((e) => ({ ...e, period_from: dateOut(e.period_from), period_to: dateOut(e.period_to), created_by_name: userName(e), first_name: undefined, last_name: undefined })) });
    });

    // Registra a emissão (o PDF é gerado no app; aqui fica o hash do arquivo e o que entrou nele).
    router.post('/uan/units/:id/exports', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const b = req.body ?? {};
      if (b.kind === 'manual' && !canApproveDoc(a)) return res.status(403).json({ errors: [{ message: 'Só o RT da unidade ou o responsável pela empresa emitem o Manual.', extensions: { code: 'FORBIDDEN' } }] });
      if (b.kind === 'dossier' && !canAudit(a)) return auditForbidden(res);
      if (b.kind !== 'manual' && b.kind !== 'dossier') return bad(res, { kind: 'Tipo inválido.' });
      if (typeof b.file_hash !== 'string' || !/^[0-9a-f]{64}$/.test(b.file_hash)) return bad(res, { file_hash: 'Hash do arquivo inválido.' });
      if (b.kind === 'dossier' && (!isIsoDate(b.period_from) || !isIsoDate(b.period_to))) return bad(res, { period_from: 'Informe o período.' });
      const includes = b.includes && typeof b.includes === 'object' && !Array.isArray(b.includes) ? b.includes : {};
      if (JSON.stringify(includes).length > 20000) return bad(res, { includes: 'Conteúdo grande demais.' });
      const integrity = b.integrity && typeof b.integrity === 'object' && !Array.isArray(b.integrity) ? { total: Number(b.integrity.total) || 0, divergent: Number(b.integrity.divergent) || 0 } : null;
      const me = await database('directus_users').where('id', user).first('first_name', 'last_name', 'email');
      try {
        const [row] = await withActor(user, (trx) => trx('compliance_exports').insert({
          unit_id: a.unit.id, organization_id: a.unit.organization_id, kind: b.kind,
          period_from: b.kind === 'dossier' ? b.period_from : null, period_to: b.kind === 'dossier' ? b.period_to : null,
          includes, integrity, file_hash: b.file_hash, signed_by: b.kind === 'manual' ? user : null, signed_name: b.kind === 'manual' ? (userName(me) ?? me?.email ?? null) : null, created_by: user,
        }).returning(['id', 'edition']));
        res.status(201).json({ data: { id: row.id, edition: row.edition } });
      } catch (error) {
        p0001(res, error, 'registrar emissão');
      }
    });

    // ── U7: APPCC (RN-160, RN-161) ─────────────────────────────────────────────────────────────
    // Plano por unidade; rascunho editado de uma vez (etapas e perigos substituídos); aprovação e nova versão
    // pelas funções do banco (0050). Leem: equipe da unidade. Editam: owner, gestor, RT. Aprovam: RT ou owner.
    const HAZARD_KINDS = new Set(['biological', 'chemical', 'physical', 'allergen']);
    const MONITORING_KINDS = new Set(['temperature', 'checklist', 'visual', 'other']);
    const HACCP_FIELDS = ['id', 'unit_id', 'root_id', 'version', 'title', 'scope', 'sheet_root_id', 'status', 'approved_at', 'created_at', 'updated_at'];
    const HZ_TEXT = { description: 500, cause: 500, control_measure: 1000, critical_limit: 300, limit_unit: 20, monitoring_what: 300, monitoring_how: 500, monitoring_frequency: 120, corrective_action: 1000, verification: 500, records: 300 };

    async function haccpAccess(user, id) {
      if (!isUuid(id)) return null;
      const plan = await database('haccp_plans').where('id', id).first(HACCP_FIELDS);
      if (!plan) return null;
      const a = await unitAccess(user, plan.unit_id);
      return a ? { plan, a } : null;
    }
    const haccpForbidden = (res) => res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT editam o APPCC.', extensions: { code: 'FORBIDDEN' } }] });

    router.get('/uan/units/:id/haccp', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      const plans = await database('haccp_plans as p').where('p.unit_id', a.unit.id).whereNot('p.status', 'archived')
        .leftJoin('tech_sheets as s', 's.id', 'p.sheet_root_id').orderBy([{ column: 'p.title' }, { column: 'p.version', order: 'desc' }])
        .select('p.id', 'p.root_id', 'p.version', 'p.title', 'p.status', 'p.approved_at', 'p.updated_at', 's.name as sheet_name',
          database.raw("(select count(*) from haccp_steps st where st.plan_id = p.id)::int as steps"),
          database.raw("(select count(*) from haccp_hazards h join haccp_steps st on st.id = h.step_id where st.plan_id = p.id and h.decision = 'ccp')::int as ccps"));
      const sheets = canSupervise(a) ? await database('tech_sheets').where({ organization_id: a.unit.organization_id }).whereRaw('id = root_id').whereNot('status', 'archived').orderBy('name').limit(500).select('id', 'name') : [];
      res.json({ data: { unit: { id: a.unit.id, name: a.unit.name }, can_edit: canSupervise(a), plans, sheets } });
    });

    router.post('/uan/units/:id/haccp', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return haccpForbidden(res);
      const b = req.body ?? {};
      const title = typeof b.title === 'string' ? b.title.trim() : '';
      if (title.length < 3 || title.length > 160) return bad(res, { title: 'Informe o título (3 a 160 caracteres).' });
      const sheet = b.sheet_root_id ? String(b.sheet_root_id) : null;
      if (sheet !== null && !isUuid(sheet)) return bad(res, { sheet_root_id: 'Ficha inválida.' });
      try {
        const id = await withActor(user, async (trx) => {
          const [p] = await trx('haccp_plans').insert({ unit_id: a.unit.id, organization_id: a.unit.organization_id, title, scope: typeof b.scope === 'string' && b.scope.trim() ? b.scope.trim().slice(0, 2000) : null, sheet_root_id: sheet, created_by: user }).returning(['id']);
          if (sheet) await trx.raw('select haccp_steps_from_sheet(?)', [p.id]);
          return p.id;
        });
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'criar plano APPCC');
      }
    });

    router.get('/uan/haccp/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await haccpAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Plano');
      const steps = await database('haccp_steps').where('plan_id', x.plan.id).orderBy('position').select('id', 'position', 'name', 'description', 'target_temp');
      const hazards = steps.length ? await database('haccp_hazards').whereIn('step_id', steps.map((s) => s.id)).orderBy([{ column: 'kind' }, { column: 'description' }]).select('*') : [];
      const versions = await database('haccp_plans as p').leftJoin('directus_users as u', 'u.id', 'p.approved_by').where('p.root_id', x.plan.root_id).orderBy('p.version', 'desc')
        .select('p.id', 'p.version', 'p.status', 'p.approved_at', 'u.first_name', 'u.last_name');
      const sheet = x.plan.sheet_root_id ? await database('tech_sheets').where('id', x.plan.sheet_root_id).first('id', 'name') : null;
      const editable = canSupervise(x.a);
      const [templates, equipment] = editable ? await Promise.all([
        database('checklist_templates').where('active', true).where((q) => q.whereNull('organization_id').orWhere('organization_id', x.a.unit.organization_id)).orderBy('name').select('id', 'name'),
        database('equipment').where({ unit_id: x.a.unit.id, active: true }).orderBy('name').select('id', 'name'),
      ]) : [[], []];
      res.json({
        data: {
          plan: { ...x.plan },
          unit: { id: x.a.unit.id, name: x.a.unit.name },
          sheet,
          steps: steps.map((s) => ({ ...s, target_temp: numOrNull(s.target_temp), hazards: hazards.filter((h) => h.step_id === s.id).map((h) => ({ ...h, limit_min: numOrNull(h.limit_min), limit_max: numOrNull(h.limit_max) })) })),
          versions: versions.map((v) => ({ id: v.id, version: v.version, status: v.status, approved_at: v.approved_at, approved_by_name: userName(v) })),
          can_edit: editable && x.plan.status === 'draft',
          can_approve: canApproveDoc(x.a) && x.plan.status === 'draft',
          can_new_version: editable && x.plan.status === 'approved' && !versions.some((v) => v.status === 'draft'),
          options: { templates, equipment },
        },
      });
    });

    function hazardRow(h, stepId, errors, prefix) {
      const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
      const bool = (v) => (v === true || v === false ? v : null);
      const num = (v) => (v === null || v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));
      if (!HAZARD_KINDS.has(h.kind)) errors[`${prefix}.kind`] = 'Tipo de perigo inválido.';
      const description = str(h.description, 500);
      if (!description || description.length < 3) errors[`${prefix}.description`] = 'Descreva o perigo.';
      const sev = Number(h.severity), prob = Number(h.probability);
      if (![1, 2, 3].includes(sev) || ![1, 2, 3].includes(prob)) errors[`${prefix}.severity`] = 'Severidade e probabilidade de 1 a 3.';
      const lmin = num(h.limit_min), lmax = num(h.limit_max);
      if ((lmin !== null && !Number.isFinite(lmin)) || (lmax !== null && !Number.isFinite(lmax)) || (lmin !== null && lmax !== null && lmin > lmax)) errors[`${prefix}.limit_min`] = 'Faixa do limite inválida.';
      if (h.monitoring_kind && !MONITORING_KINDS.has(h.monitoring_kind)) errors[`${prefix}.monitoring_kind`] = 'Tipo de monitoramento inválido.';
      const row = { step_id: stepId, kind: h.kind, description, severity: sev, probability: prob, q1: bool(h.q1), q1b: bool(h.q1b), q2: bool(h.q2), q3: bool(h.q3), q4: bool(h.q4),
        limit_min: lmin, limit_max: lmax, monitoring_kind: h.monitoring_kind || null,
        checklist_template_id: isUuid(h.checklist_template_id) ? h.checklist_template_id : null, equipment_id: isUuid(h.equipment_id) ? h.equipment_id : null };
      for (const [k, max] of Object.entries(HZ_TEXT)) if (k !== 'description') row[k] = str(h[k], max);
      return row;
    }

    // Salva o rascunho inteiro: título, escopo, etapas na ordem e perigos de cada etapa.
    router.put('/uan/haccp/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await haccpAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Plano');
      if (!canSupervise(x.a)) return haccpForbidden(res);
      if (x.plan.status !== 'draft') return conflict(res, 'Plano aprovado não se altera; crie uma nova versão.');
      const b = req.body ?? {};
      const title = typeof b.title === 'string' ? b.title.trim() : '';
      const steps = Array.isArray(b.steps) ? b.steps : [];
      const errors = {};
      if (title.length < 3 || title.length > 160) errors.title = 'Informe o título (3 a 160 caracteres).';
      if (steps.length > 200) errors.steps = 'No máximo 200 etapas.';
      steps.forEach((s, i) => {
        const name = typeof s?.name === 'string' ? s.name.trim() : '';
        if (name.length < 2 || name.length > 160) errors[`steps.${i}.name`] = `Dê nome à etapa ${i + 1}.`;
        const t = s?.target_temp === null || s?.target_temp === undefined || s?.target_temp === '' ? null : Number(String(s.target_temp).replace(',', '.'));
        if (t !== null && (!Number.isFinite(t) || t < -60 || t > 300)) errors[`steps.${i}.target_temp`] = 'Temperatura inválida.';
        if (Array.isArray(s?.hazards) && s.hazards.length > 30) errors[`steps.${i}.hazards`] = 'No máximo 30 perigos por etapa.';
      });
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        await withActor(user, async (trx) => {
          await trx('haccp_plans').where('id', x.plan.id).update({ title, scope: typeof b.scope === 'string' && b.scope.trim() ? b.scope.trim().slice(0, 2000) : null });
          await trx('haccp_steps').where('plan_id', x.plan.id).del();
          for (const [i, s] of steps.entries()) {
            const t = s.target_temp === null || s.target_temp === undefined || s.target_temp === '' ? null : Number(String(s.target_temp).replace(',', '.'));
            const [st] = await trx('haccp_steps').insert({ plan_id: x.plan.id, position: i + 1, name: s.name.trim(), description: typeof s.description === 'string' && s.description.trim() ? s.description.trim().slice(0, 1000) : null, target_temp: t }).returning(['id']);
            const hz = Array.isArray(s.hazards) ? s.hazards : [];
            const errs = {};
            const rows = hz.map((h, j) => hazardRow(h ?? {}, st.id, errs, `steps.${i}.hazards.${j}`));
            if (Object.keys(errs).length) { const e = new Error('validation'); e.fields = errs; throw e; }
            if (rows.length) await trx('haccp_hazards').insert(rows);
          }
        });
        res.json({ data: { ok: true } });
      } catch (error) {
        if (error?.fields) return bad(res, error.fields);
        p0001(res, error, 'salvar plano APPCC');
      }
    });

    router.post('/uan/haccp/:id/from-sheet', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await haccpAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Plano');
      if (!canSupervise(x.a)) return haccpForbidden(res);
      try {
        const n = await withActor(user, async (trx) => (await trx.raw('select haccp_steps_from_sheet(?) as n', [x.plan.id])).rows[0].n);
        res.json({ data: { steps: n } });
      } catch (error) {
        p0001(res, error, 'importar etapas');
      }
    });

    router.post('/uan/haccp/:id/approve', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await haccpAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Plano');
      if (!canApproveDoc(x.a)) return res.status(403).json({ errors: [{ message: 'Só o RT da unidade ou o responsável pela empresa aprovam o APPCC.', extensions: { code: 'FORBIDDEN' } }] });
      try {
        await withActor(user, (trx) => trx.raw('select * from haccp_plan_approve(?, ?)', [x.plan.id, user]));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'aprovar plano APPCC');
      }
    });

    router.post('/uan/haccp/:id/new-version', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await haccpAccess(user, req.params.id);
      if (!x) return notFoundMsg(res, 'Plano');
      if (!canSupervise(x.a)) return haccpForbidden(res);
      try {
        const id = await withActor(user, async (trx) => (await trx.raw('select haccp_plan_new_version(?, ?) as id', [x.plan.id, user])).rows[0].id);
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'criar nova versão');
      }
    });

    // ── U7: rótulos nutricionais (RN-162 a RN-164) ───────────────────────────────────────────
    // O app calcula a tabela (nutrition-core/labeling) a partir da ficha aprovada; aqui fica o retrato emitido.
    const LABEL_KEYS = ['energy_kcal', 'carbohydrate_g', 'total_sugar_g', 'added_sugar_g', 'protein_g', 'lipid_g', 'saturated_fat_g', 'trans_fat_g', 'fiber_g', 'sodium_mg'];
    const LABEL_FIELDS = ['id', 'sheet_id', 'sheet_root_id', 'sheet_version', 'product_name', 'physical_state', 'portion_g', 'household_measure', 'servings_per_pack', 'values', 'front_warnings', 'allergens', 'allergen_statement', 'layout', 'archived', 'created_at'];
    const labelOut = (l) => ({ ...l, portion_g: Number(l.portion_g), servings_per_pack: numOrNull(l.servings_per_pack) });

    router.get('/uan/tech-sheets/:id/labels', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await sheetAccess(user, req.params.id);
      if (!x) return sheetNotFound(res);
      const list = await database('nutrition_labels as l').leftJoin('directus_users as u', 'u.id', 'l.created_by').where('l.sheet_root_id', x.sheet.root_id).where('l.archived', false)
        .orderBy('l.created_at', 'desc').limit(50).select(...LABEL_FIELDS.map((f) => `l.${f}`), 'u.first_name', 'u.last_name');
      res.json({ data: { can_issue: x.roles.edit, labels: list.map((l) => ({ ...labelOut(l), created_by_name: userName(l), first_name: undefined, last_name: undefined })) } });
    });

    router.get('/uan/labels/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const l = isUuid(req.params.id) ? await database('nutrition_labels').where('id', req.params.id).first([...LABEL_FIELDS, 'organization_id']) : null;
      const roles = l ? await sheetRoles(user, l.organization_id) : null;
      if (!l || !roles) return notFoundMsg(res, 'Rótulo');
      res.json({ data: { ...labelOut(l), organization_id: undefined } });
    });

    router.post('/uan/tech-sheets/:id/labels', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await sheetAccess(user, req.params.id);
      if (!x) return sheetNotFound(res);
      if (!x.roles.edit) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT emitem rótulos.', extensions: { code: 'FORBIDDEN' } }] });
      if (x.sheet.status !== 'approved') return conflict(res, 'Rótulo só de ficha aprovada.');
      const b = req.body ?? {};
      const errors = {};
      const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
      const name = str(b.product_name, 120);
      if (!name || name.length < 2) errors.product_name = 'Informe o nome do produto.';
      if (!['solid', 'liquid'].includes(b.physical_state)) errors.physical_state = 'Sólido ou líquido.';
      const portion = Number(String(b.portion_g ?? '').replace(',', '.'));
      if (!Number.isFinite(portion) || portion <= 0 || portion > 5000) errors.portion_g = 'Porção entre 1 e 5.000 g.';
      const measure = str(b.household_measure, 60);
      if (!measure || measure.length < 2) errors.household_measure = 'Informe a medida caseira.';
      const v = b.values;
      const okNum = (n) => n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1e6);
      const validValues = v && typeof v === 'object' && v.per100 && v.perPortion && v.vd
        && LABEL_KEYS.every((k) => okNum(v.per100[k]) && okNum(v.perPortion[k]) && (v.vd[k] === undefined || okNum(v.vd[k])))
        && LABEL_KEYS.every((k) => v.per100[k] !== null && v.per100[k] !== undefined);
      if (!validValues) errors.values = 'Tabela nutricional incompleta: informe açúcares totais e gorduras trans.';
      const warnings = Array.isArray(b.front_warnings) ? [...new Set(b.front_warnings)] : [];
      if (warnings.some((w) => !['added_sugar', 'saturated_fat', 'sodium'].includes(w))) errors.front_warnings = 'Lupa inválida.';
      const allergens = Array.isArray(b.allergens) ? [...new Set(b.allergens)] : [];
      if (allergens.some((a) => !ALLERGENS.has(a))) errors.allergens = 'Alergênico inválido.';
      if (!['vertical', 'horizontal', 'linear'].includes(b.layout ?? 'vertical')) errors.layout = 'Formato inválido.';
      const perPack = b.servings_per_pack === null || b.servings_per_pack === undefined || b.servings_per_pack === '' ? null : Number(String(b.servings_per_pack).replace(',', '.'));
      if (perPack !== null && (!Number.isFinite(perPack) || perPack <= 0 || perPack > 9999)) errors.servings_per_pack = 'Porções por embalagem inválidas.';
      if (Object.keys(errors).length) return bad(res, errors);
      const values = { per100: Object.fromEntries(LABEL_KEYS.map((k) => [k, v.per100[k]])), perPortion: Object.fromEntries(LABEL_KEYS.map((k) => [k, v.perPortion[k]])), vd: Object.fromEntries(LABEL_KEYS.map((k) => [k, v.vd[k] ?? null])) };
      try {
        const [row] = await withActor(user, (trx) => trx('nutrition_labels').insert({
          organization_id: x.sheet.organization_id, sheet_id: x.sheet.id, sheet_root_id: x.sheet.root_id, sheet_version: x.sheet.version,
          product_name: name, physical_state: b.physical_state, portion_g: portion, household_measure: measure, servings_per_pack: perPack,
          values, front_warnings: warnings, allergens, allergen_statement: str(b.allergen_statement, 1000), layout: b.layout ?? 'vertical', created_by: user,
        }).returning(['id']));
        res.status(201).json({ data: { id: row.id } });
      } catch (error) {
        p0001(res, error, 'emitir rótulo');
      }
    });

    router.post('/uan/labels/:id/archive', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const l = isUuid(req.params.id) ? await database('nutrition_labels').where('id', req.params.id).first('id', 'organization_id') : null;
      const roles = l ? await sheetRoles(user, l.organization_id) : null;
      if (!l || !roles) return notFoundMsg(res, 'Rótulo');
      if (!roles.edit) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT arquivam rótulos.', extensions: { code: 'FORBIDDEN' } }] });
      try {
        await withActor(user, (trx) => trx('nutrition_labels').where('id', l.id).update({ archived: true }));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'arquivar rótulo');
      }
    });

    // ── U7: cardápio publicado e pesquisa de satisfação (RN-223) ──────────────────────────────
    // Link público por token (sem custo, fornecedor ou dados internos). Pesquisa por QR Code: uma resposta
    // por aparelho, dia e prato (hash do id do aparelho com o token), e limite por IP em memória.
    const PUBLIC_NUTRIENTS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'lipid_g', 'fiber_g', 'sodium_mg'];
    const SERVICE_ORDER = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'];
    const SLOT_ORDER = ['main', 'side', 'garnish', 'salad', 'soup', 'bread', 'sauce', 'dessert', 'beverage', 'other'];
    const surveyHits = new Map();
    const surveyLimited = (ip) => {
      const now = Date.now();
      const h = (surveyHits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
      h.push(now);
      surveyHits.set(ip, h);
      if (surveyHits.size > 5000) surveyHits.clear();
      return h.length > 40;
    };

    /** Cardápio publicado de uma unidade num dia: pratos dos ciclos aprovados, com alergênicos e nutrientes por porção. */
    async function publishedDay(unitId, day) {
      const cycles = await database('menu_cycles').where({ unit_id: unitId, status: 'approved' }).where('starts_on', '<=', day).select('id');
      const items = [];
      for (const c of cycles) {
        const idx = (await database.raw('select menu_day_index(?, ?::date) as d', [c.id, day])).rows[0].d;
        if (!idx) continue;
        items.push(...(await database('menu_items').where({ cycle_id: c.id, day_index: idx }).select('service', 'slot', 'sheet_root_id')));
      }
      const sheets = await currentSheets([...new Set(items.map((i) => i.sheet_root_id))]);
      return items
        .filter((i) => sheets.has(i.sheet_root_id))
        .sort((x, y) => SERVICE_ORDER.indexOf(x.service) - SERVICE_ORDER.indexOf(y.service) || SLOT_ORDER.indexOf(x.slot) - SLOT_ORDER.indexOf(y.slot))
        .map((i) => {
          const s = sheets.get(i.sheet_root_id);
          const per = s.computed?.perServing ?? {};
          return {
            service: i.service, slot: i.slot, sheet_root_id: i.sheet_root_id, name: s.name,
            allergens: Array.isArray(s.computed?.allergens) ? s.computed.allergens : [],
            nutrients: Object.fromEntries(PUBLIC_NUTRIENTS.map((k) => [k, Number.isFinite(per[k]) ? Math.round(per[k] * 10) / 10 : null])),
          };
        });
    }

    async function publicMenuUnit(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{22,64}$/.test(token)) return null;
      return database('production_units as u').join('organizations as o', 'o.id', 'u.organization_id')
        .where({ 'u.public_menu_token': token, 'u.public_menu_enabled': true, 'u.active': true }).whereRaw("'uan' = any (o.modules)")
        .first('u.id', 'u.name', 'u.organization_id', 'o.name as org_name', 'o.brand_color');
    }

    router.get('/public/menus/:token', async (req, res) => {
      const u = await publicMenuUnit(req.params.token);
      if (!u) return pubNotFound(res);
      const today = localToday();
      const day = isIsoDate(req.query.date) ? req.query.date : today;
      const span = Math.abs(Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400e3;
      if (span > 31) return bad(res, { date: 'Data fora do período publicado.' });
      const week = req.query.week === '1';
      const days = [];
      const start = week ? new Date(Date.parse(`${day}T12:00:00Z`) - ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) * 86400e3) : new Date(`${day}T12:00:00Z`);
      for (let i = 0; i < (week ? 7 : 1); i++) {
        const d = new Date(start.getTime() + i * 86400e3).toISOString().slice(0, 10);
        days.push({ date: d, items: await publishedDay(u.id, d) });
      }
      const survey = await database('satisfaction_surveys').where({ unit_id: u.id, active: true }).first('id', 'title', 'questions', 'per_dish');
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ data: { unit: { name: u.name, organization: u.org_name, brand_color: u.brand_color }, today, days, survey } });
    });

    router.post('/public/menus/:token/responses', async (req, res) => {
      const u = await publicMenuUnit(req.params.token);
      if (!u) return pubNotFound(res);
      // O app repassa o IP de quem responde (X-Client-IP); chamada direta conta pelo IP da conexão.
      const clientIp = `${req.ip ?? 'x'}|${String(req.headers['x-client-ip'] ?? '').slice(0, 64)}`;
      if (surveyLimited(clientIp)) return res.status(429).json({ errors: [{ message: 'Muitas respostas seguidas. Tente mais tarde.', extensions: { code: 'TOO_MANY' } }] });
      const b = req.body ?? {};
      if (b.website) return res.status(201).json({ data: { ok: true } }); // campo-isca
      const survey = await database('satisfaction_surveys').where({ unit_id: u.id, active: true }).first('id', 'questions', 'per_dish');
      if (!survey) return conflict(res, 'Não há pesquisa aberta.');
      const today = localToday();
      const day = isIsoDate(b.served_on) ? b.served_on : today;
      if (day > today || Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`) > 2 * 86400e3) return bad(res, { served_on: 'Avalie a refeição de hoje ou de até dois dias atrás.' });
      if (typeof b.device_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.device_id)) return bad(res, { device_id: 'Aparelho inválido.' });
      let sheet = null;
      if (b.sheet_root_id) {
        if (!isUuid(b.sheet_root_id)) return bad(res, { sheet_root_id: 'Prato inválido.' });
        const served = await publishedDay(u.id, day);
        if (!served.some((i) => i.sheet_root_id === b.sheet_root_id)) return bad(res, { sheet_root_id: 'Esse prato não estava no cardápio do dia.' });
        sheet = b.sheet_root_id;
      }
      const comment = typeof b.comment === 'string' && b.comment.trim() ? b.comment.trim().slice(0, 500) : null;
      const daily = await database('satisfaction_responses').where({ unit_id: u.id, served_on: day }).count({ n: '*' }).first();
      if (Number(daily?.n ?? 0) >= 5000) return res.status(429).json({ errors: [{ message: 'Limite de respostas do dia atingido.', extensions: { code: 'TOO_MANY' } }] });
      const deviceHash = createHash('sha256').update(`${req.params.token}:${b.device_id}`).digest('hex');
      try {
        await database('satisfaction_responses').insert({ survey_id: survey.id, unit_id: u.id, organization_id: u.organization_id, served_on: day, sheet_root_id: sheet, device_hash: deviceHash, answers: JSON.stringify(Array.isArray(b.answers) ? b.answers : []), comment });
        res.status(201).json({ data: { ok: true } });
      } catch (error) {
        if (error?.code === '23505') return conflict(res, 'Você já avaliou esse prato hoje. Obrigado!');
        if (error?.code === 'P0001') return bad(res, { answers: error.message.split('\n')[0].replace(/^.* - /, '') });
        logger.error({ err: error }, 'rafanutri: falha na pesquisa de satisfação');
        res.status(500).json({ errors: [{ message: 'Não foi possível enviar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    // Configuração (equipe): link, pesquisa e resultados por prato.
    router.get('/uan/units/:id/public-menu', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT publicam o cardápio.', extensions: { code: 'FORBIDDEN' } }] });
      const u = await database('production_units').where('id', a.unit.id).first('public_menu_token', 'public_menu_enabled');
      const survey = await database('satisfaction_surveys').where({ unit_id: a.unit.id, active: true }).first('id', 'title', 'questions', 'per_dish', 'created_at');
      const results = (await database.raw(
        `select r.sheet_root_id, s.name, count(*)::int as n, round(avg(r.rating), 2) as avg_rating,
                count(*) filter (where r.comment is not null)::int as comments
           from satisfaction_responses r left join tech_sheets s on s.id = r.sheet_root_id
          where r.unit_id = ? and r.served_on >= (now() at time zone 'America/Sao_Paulo')::date - 30
          group by r.sheet_root_id, s.name order by avg(r.rating) nulls last, count(*) desc limit 100`, [a.unit.id])).rows;
      const comments = await database('satisfaction_responses as r').leftJoin('tech_sheets as s', 's.id', 'r.sheet_root_id').where('r.unit_id', a.unit.id).whereNotNull('r.comment')
        .orderBy('r.created_at', 'desc').limit(30).select('r.served_on', 'r.rating', 'r.comment', 's.name');
      res.json({
        data: {
          unit: { id: a.unit.id, name: a.unit.name, active: a.unit.active },
          enabled: u.public_menu_enabled, token: u.public_menu_enabled ? u.public_menu_token : null, survey,
          results: results.map((r) => ({ sheet_root_id: r.sheet_root_id, name: r.name ?? 'Refeição em geral', responses: r.n, avg_rating: numOrNull(r.avg_rating), comments: r.comments })),
          comments: comments.map((c) => ({ served_on: dateOut(c.served_on), rating: c.rating, comment: c.comment, dish: c.name })),
        },
      });
    });

    router.post('/uan/units/:id/public-menu', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT publicam o cardápio.', extensions: { code: 'FORBIDDEN' } }] });
      if (typeof req.body?.enabled !== 'boolean') return bad(res, { enabled: 'Informe se o cardápio fica público.' });
      try {
        const token = await withActor(user, async (trx) => (await trx.raw('select unit_public_menu_set(?, ?, ?) as t', [a.unit.id, req.body.enabled, req.body.rotate === true])).rows[0].t);
        res.json({ data: { enabled: req.body.enabled, token: req.body.enabled ? token : null } });
      } catch (error) {
        p0001(res, error, 'publicar cardápio');
      }
    });

    router.post('/uan/units/:id/surveys', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a)) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT criam a pesquisa.', extensions: { code: 'FORBIDDEN' } }] });
      const b = req.body ?? {};
      if (b.close === true) {
        await withActor(user, (trx) => trx('satisfaction_surveys').where({ unit_id: a.unit.id, active: true }).update({ active: false }));
        return res.json({ data: { ok: true } });
      }
      const qs = Array.isArray(b.questions) ? b.questions.map((q) => ({ text: typeof q?.text === 'string' ? q.text.trim().slice(0, 160) : '', kind: q?.kind === 'yes_no' ? 'yes_no' : 'stars' })) : [];
      if (qs.length < 1 || qs.length > 3 || qs.some((q) => q.text.length < 3)) return bad(res, { questions: 'De 1 a 3 perguntas, com texto.' });
      const title = typeof b.title === 'string' && b.title.trim().length >= 3 ? b.title.trim().slice(0, 120) : 'Como foi a sua refeição?';
      try {
        const id = await withActor(user, async (trx) => {
          await trx('satisfaction_surveys').where({ unit_id: a.unit.id, active: true }).update({ active: false });
          const [s] = await trx('satisfaction_surveys').insert({ unit_id: a.unit.id, organization_id: a.unit.organization_id, title, questions: JSON.stringify(qs), per_dish: b.per_dish !== false, created_by: user }).returning(['id']);
          return s.id;
        });
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'criar pesquisa');
      }
    });

    // ── U7: perfis de público e regras do contrato (RN-221) ───────────────────────────────────
    // Da empresa. Veem: quem atua nela no módulo UAN. Editam: owner, gestor, RT e estoquista (mesmo acesso do
    // catálogo). Perfis da plataforma só se copiam (nascem não validados).
    const PROFILE_SEGMENTS = new Set(['pat', 'pnae', 'hospital', 'hotel', 'transported', 'other']);
    const RULE_KINDS = new Set(['vetoed_ingredient', 'vetoed_category', 'required_daily', 'max_per_week', 'cost_ceiling']);
    const DINER_PROFILE_FIELDS = ['id', 'organization_id', 'code', 'name', 'segment', 'stage', 'diet', 'services', 'targets', 'reference', 'validated', 'copied_from', 'active', 'created_at', 'updated_at'];

    router.get('/uan/organizations/:id/menu-planning', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const acc = await catalogAccess(user, req.params.id);
      if (!acc) return notFoundMsg(res, 'Empresa');
      const [org, profiles, rules, ingredients] = await Promise.all([
        database('organizations').where('id', acc.orgId).first('id', 'name'),
        database('diner_profiles').where((q) => q.where({ organization_id: acc.orgId }).orWhere((w) => w.whereNull('organization_id').where('active', true)))
          .orderBy([{ column: 'organization_id', nulls: 'first' }, { column: 'name' }]).select(DINER_PROFILE_FIELDS),
        database('menu_rules as r').leftJoin('ingredients as i', 'i.id', 'r.ingredient_id').leftJoin('diner_profiles as p', 'p.id', 'r.profile_id').where({ 'r.organization_id': acc.orgId, 'r.active': true })
          .orderBy('r.created_at').select('r.id', 'r.kind', 'r.profile_id', 'p.name as profile_name', 'r.ingredient_id', 'i.name as ingredient_name', 'r.sheet_category', 'r.slot', 'r.service', 'r.max_count', 'r.cost_cents', 'r.note'),
        acc.canManage ? database('ingredients').where({ organization_id: acc.orgId, active: true }).orderBy('name').select('id', 'name') : [],
      ]);
      res.json({ data: { organization: org, can_manage: acc.canManage, profiles: profiles.map((p) => ({ ...p, platform: p.organization_id === null })), rules, ingredients } });
    });

    router.post('/uan/organizations/:id/diner-profiles', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const acc = await catalogAccess(user, req.params.id);
      if (!acc) return notFoundMsg(res, 'Empresa');
      if (!acc.canManage) return catalogForbidden(res);
      try {
        let id;
        if (req.body?.copy_from) {
          if (!isUuid(req.body.copy_from)) return bad(res, { copy_from: 'Perfil inválido.' });
          id = await withActor(user, async (trx) => (await trx.raw('select diner_profile_copy(?, ?, ?) as id', [req.body.copy_from, acc.orgId, user])).rows[0].id);
        } else {
          const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
          if (name.length < 2 || name.length > 120) return bad(res, { name: 'Informe o nome do perfil.' });
          if (!PROFILE_SEGMENTS.has(req.body?.segment)) return bad(res, { segment: 'Escolha o público.' });
          [{ id }] = await withActor(user, (trx) => trx('diner_profiles').insert({ organization_id: acc.orgId, name, segment: req.body.segment, created_by: user }).returning(['id']));
        }
        res.status(201).json({ data: { id } });
      } catch (error) {
        p0001(res, error, 'criar perfil');
      }
    });

    router.put('/uan/diner-profiles/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = isUuid(req.params.id) ? await database('diner_profiles').where('id', req.params.id).first('id', 'organization_id') : null;
      const acc = p?.organization_id ? await catalogAccess(user, p.organization_id) : null;
      if (!acc) return notFoundMsg(res, 'Perfil');
      if (!acc.canManage) return catalogForbidden(res);
      const b = req.body ?? {};
      const errors = {};
      const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
      const name = str(b.name, 120);
      if (!name || name.length < 2) errors.name = 'Informe o nome do perfil.';
      if (!PROFILE_SEGMENTS.has(b.segment)) errors.segment = 'Escolha o público.';
      const services = Array.isArray(b.services) ? MENU_SERVICES.filter((x) => b.services.includes(x)) : [];
      if (!services.length) errors.services = 'Escolha ao menos um serviço.';
      const targets = {};
      if (b.targets && typeof b.targets === 'object' && !Array.isArray(b.targets)) {
        for (const [k, r] of Object.entries(b.targets)) {
          if (!/^[a-z_]{2,40}$/.test(k) || !r || typeof r !== 'object') { errors.targets = 'Metas inválidas.'; break; }
          const t = {};
          for (const f of ['min', 'max', 'target']) {
            if (r[f] === null || r[f] === undefined || r[f] === '') continue;
            const n = Number(String(r[f]).replace(',', '.'));
            if (!Number.isFinite(n) || n < 0 || n > 100000) { errors.targets = `Valor inválido em ${k}.`; break; }
            t[f] = n;
          }
          if (t.min !== undefined && t.max !== undefined && t.min > t.max) errors.targets = `Mínimo maior que o máximo em ${k}.`;
          if (Object.keys(t).length) targets[k] = t;
        }
      }
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        await withActor(user, (trx) => trx('diner_profiles').where('id', p.id).update({
          name, segment: b.segment, stage: str(b.stage, 120), diet: str(b.diet, 120), services, targets: JSON.stringify(targets), reference: str(b.reference, 300),
          validated: b.validated === true, active: b.active !== false,
        }));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'salvar perfil');
      }
    });

    router.post('/uan/organizations/:id/menu-rules', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const acc = await catalogAccess(user, req.params.id);
      if (!acc) return notFoundMsg(res, 'Empresa');
      if (!acc.canManage) return catalogForbidden(res);
      const b = req.body ?? {};
      if (!RULE_KINDS.has(b.kind)) return bad(res, { kind: 'Escolha o tipo de regra.' });
      const n = (v) => (v === null || v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));
      const row = {
        organization_id: acc.orgId, kind: b.kind, created_by: user,
        profile_id: isUuid(b.profile_id) ? b.profile_id : null,
        ingredient_id: isUuid(b.ingredient_id) ? b.ingredient_id : null,
        sheet_category: typeof b.sheet_category === 'string' && b.sheet_category ? b.sheet_category : null,
        slot: typeof b.slot === 'string' && b.slot ? b.slot : null,
        service: typeof b.service === 'string' && b.service ? b.service : null,
        max_count: n(b.max_count),
        cost_cents: n(b.cost) === null ? null : Math.round(n(b.cost) * 100),
        note: typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 500) : null,
      };
      if (row.max_count !== null && (!Number.isInteger(row.max_count) || row.max_count < 0 || row.max_count > 50)) return bad(res, { max_count: 'Máximo de 0 a 50 por semana.' });
      if (row.cost_cents !== null && (!Number.isFinite(row.cost_cents) || row.cost_cents < 1)) return bad(res, { cost: 'Teto inválido.' });
      try {
        const [r] = await withActor(user, (trx) => trx('menu_rules').insert(row).returning(['id']));
        res.status(201).json({ data: { id: r.id } });
      } catch (error) {
        if (error?.code === '23514') return bad(res, { kind: 'Complete a regra (insumo, categoria, posição, máximo ou teto).' });
        p0001(res, error, 'criar regra');
      }
    });

    router.post('/uan/menu-rules/:id/deactivate', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const r = isUuid(req.params.id) ? await database('menu_rules').where('id', req.params.id).first('id', 'organization_id') : null;
      const acc = r ? await catalogAccess(user, r.organization_id) : null;
      if (!acc) return notFoundMsg(res, 'Regra');
      if (!acc.canManage) return catalogForbidden(res);
      try {
        await withActor(user, (trx) => trx('menu_rules').where('id', r.id).update({ active: false }));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'desativar regra');
      }
    });

    // ── RN-124: contrato Enterprise da UAN (só o owner vê) ────────────────────────────────────
    router.get('/uan/organizations/:id/contract', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = isUuid(req.params.id) ? (await uanOrgs(user)).find((o) => o.id === req.params.id) : null;
      if (!org) return notFoundMsg(res, 'Empresa');
      if (!org.is_owner) return res.status(403).json({ errors: [{ message: 'Só o responsável pela empresa vê o contrato.', extensions: { code: 'FORBIDDEN' } }] });
      const [contracts, invoices, state, limit, active] = await Promise.all([
        database('organization_contracts').where('organization_id', org.id).orderBy('starts_at', 'desc').select('id', 'plan', 'units_contracted', 'monthly_price_cents', 'starts_at', 'ends_at', 'billing_method', 'features'),
        database('contract_invoices').where('organization_id', org.id).orderBy('due_on', 'desc').limit(36).select('id', 'contract_id', 'period_start', 'period_end', 'amount_cents', 'due_on', 'status', 'paid_at', 'payment_url'),
        database.raw('select uan_contract_state(?) as s', [org.id]).then((r) => r.rows[0].s),
        database.raw('select uan_unit_limit(?) as n', [org.id]).then((r) => r.rows[0].n),
        database('production_units').where({ organization_id: org.id, active: true }).count({ n: '*' }).first(),
      ]);
      const lastEnd = contracts.filter((c) => c.ends_at).map((c) => dateOut(c.ends_at)).sort().pop() ?? null;
      res.json({
        data: {
          organization: { id: org.id, name: org.name },
          state,
          read_only_until: state === 'read_only' && lastEnd ? new Date(Date.parse(`${lastEnd}T12:00:00Z`) + 90 * 86400e3).toISOString().slice(0, 10) : null,
          unit_limit: Number(limit),
          active_units: Number(active?.n ?? 0),
          contracts: contracts.map((c) => ({ ...c, starts_at: dateOut(c.starts_at), ends_at: dateOut(c.ends_at) })),
          invoices: invoices.map((i) => ({ ...i, period_start: dateOut(i.period_start), period_end: dateOut(i.period_end), due_on: dateOut(i.due_on) })),
        },
      });
    });

    // ── RN-169: importação de planilhas na implantação ──────────────────────────────────────
    // O app lê e valida a planilha; aqui cada linha entra numa transação própria e volta com o resultado
    // (criado, ignorado por já existir, ou erro com o motivo). Vínculo com a TACO por semelhança de nome.
    const IMPORT_MAX = 1000;
    const sameName = (col, name) => database.raw(`lower(f_unaccent(btrim(${col}))) = lower(f_unaccent(btrim(?)))`, [name]);

    /** Melhor alimento público (TACO/TBCA) para um nome; null abaixo do limiar. */
    async function bestFood(name, minScore) {
      const r = (await database.raw('select id, name, score from search_foods(?, null, 1)', [String(name).slice(0, 80)])).rows[0];
      return r && Number(r.score) >= minScore ? { id: r.id, name: r.name, score: Number(r.score) } : null;
    }

    router.post('/uan/organizations/:id/import/foods-match', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const acc = await catalogAccess(user, req.params.id);
      if (!acc) return notFoundMsg(res, 'Empresa');
      const names = Array.isArray(req.body?.names) ? req.body.names.filter((n) => typeof n === 'string' && n.trim().length >= 2).slice(0, IMPORT_MAX) : [];
      const out = [];
      for (const n of names) out.push({ name: n, food: await bestFood(n, 0.6) });
      res.json({ data: out });
    });

    router.post('/uan/organizations/:id/import/suppliers', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const acc = await catalogAccess(user, req.params.id);
      if (!acc) return notFoundMsg(res, 'Empresa');
      if (!acc.canManage) return catalogForbidden(res);
      const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, IMPORT_MAX) : [];
      const results = [];
      for (const r of rows) {
        const line = Number(r?.line) || null;
        const name = typeof r?.name === 'string' ? r.name.trim() : '';
        if (name.length < 2) { results.push({ line, status: 'error', message: 'Nome inválido.' }); continue; }
        if (await database('suppliers').where('organization_id', acc.orgId).where(sameName('name', name)).first('id')) { results.push({ line, status: 'skipped', message: 'Já cadastrado.' }); continue; }
        try {
          await withActor(user, (trx) => trx('suppliers').insert({ organization_id: acc.orgId, name: name.slice(0, 120), cnpj: /^\d{14}$/.test(r.cnpj ?? '') ? r.cnpj : null, contact_name: r.contact_name || null, phone: r.phone || null, email: r.email || null }));
          results.push({ line, status: 'created' });
        } catch (error) {
          results.push({ line, status: 'error', message: error?.code === '23514' ? 'Dados inválidos (CNPJ, e-mail ou tamanho).' : 'Não foi possível gravar.' });
        }
      }
      res.json({ data: { results } });
    });

    router.post('/uan/organizations/:id/import/ingredients', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const acc = await catalogAccess(user, req.params.id);
      if (!acc) return notFoundMsg(res, 'Empresa');
      if (!acc.canManage) return catalogForbidden(res);
      const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, IMPORT_MAX) : [];
      const suggest = req.body?.use_suggestions !== false;
      const suppliers = new Map();
      const results = [];
      for (const r of rows) {
        const line = Number(r?.line) || null;
        const parsed = ingredientBody({ ...r, food_id: null, active: true });
        if (parsed.errors) { results.push({ line, status: 'error', message: Object.values(parsed.errors)[0] }); continue; }
        if (await database('ingredients').where('organization_id', acc.orgId).where(sameName('name', parsed.data.name)).first('id')) { results.push({ line, status: 'skipped', message: 'Já cadastrado.' }); continue; }
        const price = r.price === null || r.price === undefined || r.price === '' ? null : Number(String(r.price).replace(',', '.'));
        if (price !== null && (!Number.isFinite(price) || price <= 0 || price > 1_000_000)) { results.push({ line, status: 'error', message: 'Preço inválido.' }); continue; }
        let food = null;
        if (typeof r.taco === 'string' && r.taco.trim()) food = await bestFood(r.taco, 0.4);
        else if (suggest) food = await bestFood(parsed.data.name, 0.6);
        try {
          await withActor(user, async (trx) => {
            const [ing] = await trx('ingredients').insert({ ...parsed.data, food_id: food?.id ?? null, organization_id: acc.orgId }).returning(['id']);
            if (price !== null) {
              let sup = null;
              const sname = typeof r.supplier === 'string' ? r.supplier.trim() : '';
              if (sname.length >= 2) {
                sup = suppliers.get(sname.toLowerCase()) ?? (await trx('suppliers').where('organization_id', acc.orgId).where(sameName('name', sname)).first('id'))?.id ?? null;
                if (!sup) [{ id: sup }] = await trx('suppliers').insert({ organization_id: acc.orgId, name: sname.slice(0, 120) }).returning(['id']);
                suppliers.set(sname.toLowerCase(), sup);
              }
              await trx('ingredient_prices').insert({ ingredient_id: ing.id, organization_id: acc.orgId, supplier_id: sup, price_cents: Math.round(price * 100), source: 'import', created_by: user });
            }
          });
          results.push({ line, status: 'created', food: food?.name ?? null });
        } catch (error) {
          results.push({ line, status: 'error', message: error?.code === '23505' ? 'Já cadastrado.' : error?.code === 'P0001' ? error.message.split('\n')[0].replace(/^.* - /, '') : 'Não foi possível gravar.' });
        }
      }
      res.json({ data: { results } });
    });

    router.post('/uan/organizations/:id/import/sheets', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const roles = isUuid(req.params.id) ? await sheetRoles(user, req.params.id) : null;
      if (!roles) return notFoundMsg(res, 'Empresa');
      if (!roles.edit) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT importam fichas.', extensions: { code: 'FORBIDDEN' } }] });
      const orgId = req.params.id;
      const sheets = Array.isArray(req.body?.sheets) ? req.body.sheets.slice(0, 300) : [];
      const results = [];
      for (const s of sheets) {
        const line = Number(s?.lines?.[0]) || null;
        const name = typeof s?.name === 'string' ? s.name.trim() : '';
        const items = Array.isArray(s?.items) ? s.items.slice(0, 200) : [];
        const servings = Number(s?.servings);
        if (name.length < 2 || !items.length || !Number.isInteger(servings) || servings < 1 || servings > 10000) { results.push({ line, status: 'error', message: 'Ficha inválida.' }); continue; }
        if (await database('tech_sheets').where('organization_id', orgId).whereNot('status', 'archived').where(sameName('name', name)).first('id')) { results.push({ line, status: 'skipped', message: 'Já existe ficha com esse nome.' }); continue; }
        const missing = [];
        const resolved = [];
        for (const it of items) {
          const ing = await database('ingredients').where({ organization_id: orgId, active: true }).where(sameName('name', String(it.ingredient ?? ''))).first('id', 'default_fc');
          if (!ing) missing.push(it.ingredient);
          else resolved.push({ ingredient_id: ing.id, gross_g: Number(it.gross_g), fc: it.fc === null || it.fc === undefined ? null : Number(it.fc) });
        }
        if (missing.length) { results.push({ line, status: 'error', message: `Insumo não cadastrado: ${[...new Set(missing)].slice(0, 5).join(', ')}.` }); continue; }
        try {
          await withActor(user, async (trx) => {
            const [sh] = await trx('tech_sheets').insert({ organization_id: orgId, name: name.slice(0, 120), category: s.category ?? 'main', servings, cooked_weight_g: Number(s.cooked_weight_g) > 0 ? Number(s.cooked_weight_g) : null, created_by: user }).returning(['id']);
            await trx('tech_sheet_items').insert(resolved.map((it, i) => ({ sheet_id: sh.id, position: i + 1, ingredient_id: it.ingredient_id, gross_g: it.gross_g, fc: it.fc })));
          });
          results.push({ line, status: 'created' });
        } catch (error) {
          results.push({ line, status: 'error', message: error?.code === 'P0001' ? error.message.split('\n')[0].replace(/^.* - /, '') : error?.code === '23514' ? 'Valores fora da faixa (categoria, peso ou fator de correção).' : 'Não foi possível gravar.' });
        }
      }
      res.json({ data: { results } });
    });

    // ── U5: painel da rede e relatório mensal (RN-229) ────────────────────────────────────────
    // Indicadores do mês por unidade: custo realizado (retiradas para produção pelo custo do lote ou pelo
    // preço vigente), refeições previstas e servidas, sobra e resto-ingesta, satisfação, conformidade e NCs.
    function monthRange(q) {
      const today = localToday();
      const m = typeof q === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(q) ? q : today.slice(0, 7);
      const from = `${m}-01`;
      const next = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)).toISOString().slice(0, 10);
      const last = new Date(Date.parse(`${next}T12:00:00Z`) - 86400e3).toISOString().slice(0, 10);
      return { month: m, from, to: last < today ? last : today, last };
    }

    const GPU_SQL = `case g.purchase_unit when 'kg' then 1000 when 'g' then 1 when 'l' then 1000 * coalesce(g.density_g_ml, 1) when 'ml' then coalesce(g.density_g_ml, 1)
                       when 'un' then g.unit_weight_g when 'dz' then 12 * g.unit_weight_g else g.pack_grams end`;

    async function unitMonthStats(unitId, from, to) {
      const [cost, diners, waste, sat, nc, top, compliance, target] = await Promise.all([
        database.raw(
          `select coalesce(sum(-m.quantity_g * coalesce(l.cost_per_kg_cents::numeric, p.price_cents * 1000.0 / nullif(${GPU_SQL}, 0)) / 1000.0), 0) as cents,
                  coalesce(sum(-m.quantity_g) filter (where l.cost_per_kg_cents is null and p.price_cents is null), 0) as grams_no_cost
             from stock_movements m join stock_lots l on l.id = m.lot_id join ingredients g on g.id = m.ingredient_id
             left join lateral ingredient_price_at(g.id) p on true
            where m.unit_id = ? and m.kind = 'out_production' and (m.created_at at time zone 'America/Sao_Paulo')::date between ?::date and ?::date`, [unitId, from, to]),
        database('diner_counts').where('unit_id', unitId).whereBetween('day', [from, to]).sum({ planned: 'planned', actual: 'actual' }).first(),
        database('waste_records').where('unit_id', unitId).whereBetween('day', [from, to])
          .sum({ produced: 'produced_g', leftover: 'leftover_g', plate: 'plate_waste_g', prep: 'prep_waste_g' }).first(),
        database('satisfaction_responses').where('unit_id', unitId).whereBetween('served_on', [from, to]).whereNotNull('rating').avg({ avg: 'rating' }).count({ n: '*' }).first(),
        database('non_conformities').where('unit_id', unitId).whereNot('status', 'closed')
          .select(database.raw('count(*)::int as open'), database.raw('count(*) filter (where due_at < now())::int as overdue')).first(),
        database.raw(
          `select g.name, sum(-m.quantity_g * coalesce(l.cost_per_kg_cents::numeric, p.price_cents * 1000.0 / nullif(${GPU_SQL}, 0)) / 1000.0) as cents
             from stock_movements m join stock_lots l on l.id = m.lot_id join ingredients g on g.id = m.ingredient_id
             left join lateral ingredient_price_at(g.id) p on true
            where m.unit_id = ? and m.kind = 'out_production' and (m.created_at at time zone 'America/Sao_Paulo')::date between ?::date and ?::date
            group by g.name order by 2 desc nulls last limit 10`, [unitId, from, to]),
        database.raw('select uan_compliance(?, ?) as c', [unitId, Math.max(7, Math.min(90, Math.round((Date.parse(to) - Date.parse(from)) / 86400e3) + 1))]),
        database('menu_cycles').where({ unit_id: unitId, status: 'approved' }).where('starts_on', '<=', to).whereNotNull('cost_target_cents').max({ t: 'cost_target_cents' }).first(),
      ]);
      const cents = Math.round(Number(cost.rows[0].cents));
      const served = Number(diners?.actual ?? 0);
      const produced = Number(waste?.produced ?? 0);
      const leftover = Number(waste?.leftover ?? 0);
      const plate = Number(waste?.plate ?? 0);
      const c = compliance.rows[0].c;
      return {
        cost_cents: cents,
        cost_estimated_missing: Number(cost.rows[0].grams_no_cost) > 0,
        meals_planned: Number(diners?.planned ?? 0),
        meals_served: served,
        cost_per_meal_cents: served > 0 ? Math.round(cents / served) : null,
        cost_target_cents: target?.t === null || target?.t === undefined ? null : Number(target.t),
        waste: { produced_g: produced, leftover_g: leftover, plate_g: plate, prep_g: Number(waste?.prep ?? 0),
          leftover_pct: produced > 0 ? Math.round((leftover / produced) * 1000) / 10 : null,
          plate_pct: produced - leftover > 0 ? Math.round((plate / (produced - leftover)) * 1000) / 10 : null,
          plate_g_per_meal: served > 0 ? Math.round(plate / served) : null },
        satisfaction: { avg: sat?.avg === null || sat?.avg === undefined ? null : Math.round(Number(sat.avg) * 10) / 10, responses: Number(sat?.n ?? 0) },
        compliance_index: c.index === null ? null : Number(c.index),
        nc_open: nc?.open ?? 0,
        nc_overdue: nc?.overdue ?? 0,
        top_items: top.rows.map((r) => ({ name: r.name, cost_cents: Math.round(Number(r.cents ?? 0)) })),
      };
    }

    router.get('/uan/organizations/:id/network', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = isUuid(req.params.id) ? (await uanOrgs(user)).find((o) => o.id === req.params.id) : null;
      if (!org) return notFoundMsg(res, 'Empresa');
      let q = database('production_units').where({ organization_id: org.id, active: true }).orderBy('name');
      if (!org.is_owner) q = q.whereIn('id', database('unit_members').where('user_id', user).whereIn('role', ['manager', 'technical_lead']).select('unit_id'));
      const units = await q.select('id', 'name', 'kind');
      if (!units.length && !org.is_owner) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor ou o RT veem o painel da rede.', extensions: { code: 'FORBIDDEN' } }] });
      const p = monthRange(req.query.month);
      const rows = [];
      for (const u of units) rows.push({ ...u, ...(await unitMonthStats(u.id, p.from, p.to)) });
      const sum = (k) => rows.reduce((s2, r) => s2 + (r[k] ?? 0), 0);
      const served = sum('meals_served');
      res.json({
        data: {
          organization: { id: org.id, name: org.name }, ...p,
          totals: { cost_cents: sum('cost_cents'), meals_served: served, meals_planned: sum('meals_planned'), cost_per_meal_cents: served > 0 ? Math.round(sum('cost_cents') / served) : null },
          units: rows,
        },
      });
    });

    router.get('/uan/units/:id/monthly', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const a = await unitAccess(user, req.params.id);
      if (!a) return unitNotFound(res);
      if (!canSupervise(a) && !a.roles.includes('auditor')) return res.status(403).json({ errors: [{ message: 'Só o responsável, o gestor, o RT ou o auditor veem o relatório.', extensions: { code: 'FORBIDDEN' } }] });
      const p = monthRange(req.query.month);
      const [stats, org, rt, trainings, ncs, comments] = await Promise.all([
        unitMonthStats(a.unit.id, p.from, p.to),
        database('organizations').where('id', a.unit.organization_id).first('name'),
        unitRt(a.unit.id),
        database('trainings').where('unit_id', a.unit.id).whereBetween('held_on', [p.from, p.to]).count({ n: '*' }).first(),
        database('non_conformities').where('unit_id', a.unit.id).where(database.raw(`(opened_at at time zone 'America/Sao_Paulo')::date between ?::date and ?::date`, [p.from, p.to]))
          .select(database.raw('count(*)::int as opened'), database.raw("count(*) filter (where status = 'closed')::int as closed")).first(),
        database('satisfaction_responses as r').leftJoin('tech_sheets as s', 's.id', 'r.sheet_root_id').where('r.unit_id', a.unit.id).whereBetween('r.served_on', [p.from, p.to]).whereNotNull('r.comment')
          .orderBy('r.created_at', 'desc').limit(5).select('r.comment', 'r.rating', 's.name'),
      ]);
      const prev = monthRange(new Date(Date.parse(`${p.from}T12:00:00Z`) - 5 * 86400e3).toISOString().slice(0, 7));
      const before = await unitMonthStats(a.unit.id, prev.from, prev.last);
      res.json({
        data: {
          organization: org?.name ?? null, unit: { id: a.unit.id, name: a.unit.name }, technical_lead: rt, ...p,
          stats, previous: { month: prev.month, cost_per_meal_cents: before.cost_per_meal_cents, meals_served: before.meals_served, compliance_index: before.compliance_index, plate_pct: before.waste.plate_pct },
          trainings: Number(trainings?.n ?? 0), non_conformities: ncs, comments: comments.map((c) => ({ comment: c.comment, rating: c.rating, dish: c.name })),
        },
      });
    });

    // ── Administração da plataforma: contratos UAN (RN-124) ──────────────────────────────────
    // Só admin do Directus ou listado em platform_admins (is_platform_admin, 0056). Tudo auditado pelos
    // gatilhos de organization_contracts e contract_invoices (com o autor via withActor).
    async function requireAdmin(req, res) {
      const user = requireUser(req, res);
      if (!user) return null;
      const ok = req.accountability?.admin === true || (await database.raw('select is_platform_admin(?) as ok', [user])).rows[0].ok;
      if (!ok) { res.status(404).json({ errors: [{ message: 'Página não encontrada.', extensions: { code: 'NOT_FOUND' } }] }); return null; }
      return user;
    }
    const CONTRACT_PLANS = new Set(['uan_pilot', 'uan_quality', 'uan_complete']);
    const BILLING = new Set(['invoice', 'pix', 'boleto', 'card']);

    router.get('/admin/me', async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      res.json({ data: { admin: true } });
    });

    router.get('/admin/uan/organizations', async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
      let rows = database('organizations as o').orderBy('o.name').limit(200)
        .select('o.id', 'o.name', 'o.type', 'o.modules', 'o.created_at',
          database.raw("(select u.email from organization_members m join directus_users u on u.id = m.user_id where m.organization_id = o.id and m.role = 'owner' limit 1) as owner_email"),
          database.raw('(select count(*) from production_units pu where pu.organization_id = o.id and pu.active)::int as active_units'),
          database.raw("case when 'uan' = any(o.modules) then uan_contract_state(o.id) end as contract_state"),
          database.raw("case when 'uan' = any(o.modules) then uan_unit_limit(o.id) end as unit_limit"));
      if (q) rows = rows.whereRaw('f_unaccent(lower(o.name)) like f_unaccent(lower(?))', [`%${q}%`]);
      res.json({ data: await rows });
    });

    router.get('/admin/uan/organizations/:id', async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const org = isUuid(req.params.id) ? await database('organizations').where('id', req.params.id).first('id', 'name', 'modules') : null;
      if (!org) return notFoundMsg(res, 'Empresa');
      const [contracts, invoices, state, limit, active] = await Promise.all([
        database('organization_contracts').where('organization_id', org.id).orderBy('starts_at', 'desc').select('id', 'plan', 'units_contracted', 'monthly_price_cents', 'starts_at', 'ends_at', 'billing_method', 'notes', 'created_at'),
        database('contract_invoices').where('organization_id', org.id).orderBy('due_on', 'desc').limit(60).select('id', 'contract_id', 'period_start', 'period_end', 'amount_cents', 'due_on', 'status', 'paid_at', 'payment_url', 'gateway', 'gateway_id'),
        database.raw('select uan_contract_state(?) as s', [org.id]).then((r) => r.rows[0].s),
        database.raw('select uan_unit_limit(?) as n', [org.id]).then((r) => r.rows[0].n),
        database('production_units').where({ organization_id: org.id, active: true }).count({ n: '*' }).first(),
      ]);
      res.json({
        data: {
          organization: { ...org, uan: org.modules.includes('uan') }, state, unit_limit: Number(limit), active_units: Number(active?.n ?? 0),
          contracts: contracts.map((c) => ({ ...c, starts_at: dateOut(c.starts_at), ends_at: dateOut(c.ends_at) })),
          invoices: invoices.map((i) => ({ ...i, period_start: dateOut(i.period_start), period_end: dateOut(i.period_end), due_on: dateOut(i.due_on) })),
        },
      });
    });

    router.post('/admin/uan/organizations/:id/module', async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const org = isUuid(req.params.id) ? await database('organizations').where('id', req.params.id).first('id', 'modules') : null;
      if (!org) return notFoundMsg(res, 'Empresa');
      if (typeof req.body?.enabled !== 'boolean') return bad(res, { enabled: 'Informe se o módulo fica ligado.' });
      const mods = new Set(org.modules);
      if (req.body.enabled) mods.add('uan'); else mods.delete('uan');
      if (!mods.size) mods.add('clinical');
      try {
        await withActor(user, (trx) => trx('organizations').where('id', org.id).update({ modules: [...mods] }));
        res.json({ data: { modules: [...mods] } });
      } catch (error) {
        p0001(res, error, 'mudar módulo');
      }
    });

    function contractBody(b, partial = false) {
      const errors = {};
      const out = {};
      const money = (v) => Math.round(Number(String(v ?? '').replace(',', '.')) * 100);
      if (!partial || b.plan !== undefined) { if (!CONTRACT_PLANS.has(b.plan)) errors.plan = 'Plano inválido.'; else out.plan = b.plan; }
      if (!partial || b.units_contracted !== undefined) { const n = Number(b.units_contracted); if (!Number.isInteger(n) || n < 1 || n > 1000) errors.units_contracted = 'Unidades de 1 a 1.000.'; else out.units_contracted = n; }
      if (!partial || b.monthly_price !== undefined) { const c = money(b.monthly_price); if (!Number.isFinite(c) || c < 0 || c > 100_000_000) errors.monthly_price = 'Mensalidade inválida.'; else out.monthly_price_cents = c; }
      if (!partial || b.starts_at !== undefined) { if (!isIsoDate(b.starts_at)) errors.starts_at = 'Informe o início.'; else out.starts_at = b.starts_at; }
      if (b.ends_at !== undefined) { if (b.ends_at !== null && b.ends_at !== '' && !isIsoDate(b.ends_at)) errors.ends_at = 'Data inválida.'; else out.ends_at = b.ends_at || null; }
      if (!partial || b.billing_method !== undefined) { const m = b.billing_method ?? 'invoice'; if (!BILLING.has(m)) errors.billing_method = 'Forma de cobrança inválida.'; else out.billing_method = m; }
      if (b.notes !== undefined) out.notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null;
      if (out.starts_at && out.ends_at && out.ends_at < out.starts_at) errors.ends_at = 'O fim vem depois do início.';
      return { errors, data: out };
    }

    router.post('/admin/uan/organizations/:id/contracts', async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const org = isUuid(req.params.id) ? await database('organizations').where('id', req.params.id).first('id') : null;
      if (!org) return notFoundMsg(res, 'Empresa');
      const { errors, data } = contractBody(req.body ?? {});
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        const [c] = await withActor(user, (trx) => trx('organization_contracts').insert({ ...data, organization_id: org.id }).returning(['id']));
        res.status(201).json({ data: { id: c.id } });
      } catch (error) {
        p0001(res, error, 'criar contrato');
      }
    });

    router.patch('/admin/uan/contracts/:id', async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const c = isUuid(req.params.id) ? await database('organization_contracts').where('id', req.params.id).first('id', 'starts_at') : null;
      if (!c) return notFoundMsg(res, 'Contrato');
      const { errors, data } = contractBody(req.body ?? {}, true);
      if (data.ends_at && !data.starts_at && data.ends_at < dateOut(c.starts_at)) errors.ends_at = 'O fim vem depois do início.';
      if (Object.keys(errors).length) return bad(res, errors);
      if (!Object.keys(data).length) return bad(res, { plan: 'Nada para mudar.' });
      try {
        await withActor(user, (trx) => trx('organization_contracts').where('id', c.id).update(data));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'salvar contrato');
      }
    });

    router.post('/admin/uan/contracts/:id/invoices', async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const c = isUuid(req.params.id) ? await database('organization_contracts').where('id', req.params.id).first('id', 'monthly_price_cents') : null;
      if (!c) return notFoundMsg(res, 'Contrato');
      const b = req.body ?? {};
      const errors = {};
      if (!isIsoDate(b.period_start) || !isIsoDate(b.period_end) || b.period_end < b.period_start) errors.period_start = 'Período inválido.';
      if (!isIsoDate(b.due_on)) errors.due_on = 'Informe o vencimento.';
      const amount = b.amount === undefined || b.amount === '' ? c.monthly_price_cents : Math.round(Number(String(b.amount).replace(',', '.')) * 100);
      if (!Number.isFinite(amount) || amount < 0) errors.amount = 'Valor inválido.';
      const url = typeof b.payment_url === 'string' && b.payment_url.trim() ? b.payment_url.trim().slice(0, 500) : null;
      if (url && !/^https:\/\//.test(url)) errors.payment_url = 'O link de pagamento começa com https://.';
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        const [i] = await withActor(user, (trx) => trx('contract_invoices').insert({ contract_id: c.id, period_start: b.period_start, period_end: b.period_end, amount_cents: amount, due_on: b.due_on, payment_url: url }).returning(['id']));
        res.status(201).json({ data: { id: i.id } });
      } catch (error) {
        if (error?.code === '23505') return conflict(res, 'Já existe fatura desse período.');
        p0001(res, error, 'emitir fatura');
      }
    });

    router.patch('/admin/uan/invoices/:id', async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const inv = isUuid(req.params.id) ? await database('contract_invoices').where('id', req.params.id).first('id', 'status') : null;
      if (!inv) return notFoundMsg(res, 'Fatura');
      const st = req.body?.status;
      if (!['paid', 'void', 'open'].includes(st)) return bad(res, { status: 'Situação inválida.' });
      const paidAt = st === 'paid' ? (isIsoDate(req.body?.paid_on) ? `${req.body.paid_on}T12:00:00-03:00` : new Date().toISOString()) : null;
      try {
        await withActor(user, (trx) => trx('contract_invoices').where('id', inv.id).update({ status: st, paid_at: paidAt }));
        res.json({ data: { ok: true } });
      } catch (error) {
        p0001(res, error, 'atualizar fatura');
      }
    });

  return { requireAdmin };
}
