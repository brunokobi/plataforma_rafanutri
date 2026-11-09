// Endpoints da Rafanutri: /rafanutri/*
// Operações que precisam ser atômicas ou que exigem privilégios de servidor.
import { createHash, randomBytes } from 'node:crypto';

const PROFESSIONAL_ROLE = 'Profissional';
const TERMS_VERSION = '2026-11-09';

function httpError(res, status, code, message) {
  return res.status(status).json({ errors: [{ message, extensions: { code } }] });
}

const isEmail = (v) => typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 254;
const str = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;

export default {
  id: 'rafanutri',
  handler: (router, { services, database, getSchema, logger }) => {
    const { UsersService, RolesService } = services;

    async function roleId(name, schema) {
      const roles = new RolesService({ schema, knex: database });
      const [role] = await roles.readByQuery({ filter: { name: { _eq: name } }, limit: 1, fields: ['id'] });
      return role?.id ?? null;
    }

    async function membership(userId, orgId, roles) {
      const q = database('organization_members').where({ user_id: userId, organization_id: orgId });
      if (roles) q.whereIn('role', roles);
      return q.first();
    }

    // Cadastro de profissional (público).
    router.post('/signup', async (req, res) => {
      const { email, password, full_name, accept_terms } = req.body ?? {};
      if (!isEmail(email)) return httpError(res, 400, 'INVALID_EMAIL', 'E-mail inválido.');
      if (!str(password, 8, 128)) return httpError(res, 400, 'WEAK_PASSWORD', 'A senha precisa ter pelo menos 8 caracteres.');
      if (!str(full_name, 2, 160)) return httpError(res, 400, 'INVALID_NAME', 'Informe seu nome.');
      if (accept_terms !== true) return httpError(res, 400, 'TERMS_REQUIRED', 'É preciso aceitar os termos de uso.');

      const schema = await getSchema();
      const role = await roleId(PROFESSIONAL_ROLE, schema);
      if (!role) return httpError(res, 500, 'NOT_BOOTSTRAPPED', 'Directus ainda não foi configurado (rode o bootstrap).');

      const normalized = email.trim().toLowerCase();
      if (await database('directus_users').whereRaw('lower(email) = ?', [normalized]).first()) {
        return httpError(res, 409, 'EMAIL_TAKEN', 'Já existe uma conta com este e-mail.');
      }

      const [first, ...rest] = full_name.trim().split(/\s+/);
      const users = new UsersService({ schema, knex: database }); // sem accountability = privilégio de sistema
      const userId = await users.createOne({
        email: normalized, password, role, status: 'active', first_name: first, last_name: rest.join(' ') || null,
      });
      await database('profiles').insert({
        id: userId, full_name: full_name.trim(), terms_version_accepted: TERMS_VERSION, terms_accepted_at: new Date(),
      });
      logger.info({ userId }, 'rafanutri: novo profissional');
      return res.status(201).json({ data: { id: userId } });
    });

    // Cria organização + owner + plano gratuito, e atualiza o CRN do profissional.
    router.post('/organizations', async (req, res) => {
      const user = req.accountability?.user;
      if (!user) return httpError(res, 401, 'UNAUTHENTICATED', 'Faça login.');
      const { name, type = 'solo', brand_color = '#2E7D32', crn, crn_region } = req.body ?? {};
      if (!str(name, 2, 120)) return httpError(res, 400, 'INVALID_NAME', 'Informe o nome do consultório.');
      if (!['solo', 'clinic', 'company'].includes(type)) return httpError(res, 400, 'INVALID_TYPE', 'Tipo inválido.');
      if (!/^#[0-9A-Fa-f]{6}$/.test(brand_color)) return httpError(res, 400, 'INVALID_COLOR', 'Cor inválida.');
      if (crn !== undefined && crn !== null && crn !== '' && !/^[0-9]{1,10}[A-Za-z/]{0,4}$/.test(String(crn))) {
        return httpError(res, 400, 'INVALID_CRN', 'Número de CRN inválido.');
      }

      const org = await database.transaction(async (trx) => {
        await trx('profiles').insert({ id: user }).onConflict('id').ignore();
        if (crn || crn_region) {
          await trx('profiles').where({ id: user }).update({ crn: crn || null, crn_region: crn_region || null });
        }
        const { rows } = await trx.raw('select * from create_organization(?, ?, ?, ?)', [user, name.trim(), type, brand_color]);
        return rows[0];
      });
      return res.status(201).json({ data: org });
    });

    // Busca de alimentos sem acento, com ranking por semelhança.
    router.get('/foods/search', async (req, res) => {
      const user = req.accountability?.user;
      if (!user) return httpError(res, 401, 'UNAUTHENTICATED', 'Faça login.');
      const q = String(req.query.q ?? '').trim();
      const org = req.query.org ? String(req.query.org) : null;
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      if (q.length < 2) return res.json({ data: [] });
      if (org && !(await membership(user, org))) return httpError(res, 403, 'FORBIDDEN', 'Sem acesso a esta organização.');
      const { rows } = await database.raw('select * from search_foods(?, ?, ?)', [q, org, limit]);
      return res.json({ data: rows });
    });

    // Convite de membro (só owner). Devolve o token uma única vez; guarda só o hash.
    router.post('/invites', async (req, res) => {
      const user = req.accountability?.user;
      if (!user) return httpError(res, 401, 'UNAUTHENTICATED', 'Faça login.');
      const { organization_id, email, role } = req.body ?? {};
      if (!isEmail(email)) return httpError(res, 400, 'INVALID_EMAIL', 'E-mail inválido.');
      if (!['nutritionist', 'assistant'].includes(role)) return httpError(res, 400, 'INVALID_ROLE', 'Papel inválido.');
      if (!(await membership(user, organization_id, ['owner']))) return httpError(res, 403, 'FORBIDDEN', 'Só o responsável pode convidar.');

      const token = randomBytes(32).toString('base64url');
      const [invite] = await database('organization_invites')
        .insert({
          organization_id, email: email.trim().toLowerCase(), role, invited_by: user,
          token_hash: createHash('sha256').update(token).digest('hex'),
          expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        })
        .returning(['id', 'expires_at']);
      return res.status(201).json({ data: { ...invite, token } });
    });

    router.post('/invites/accept', async (req, res) => {
      const user = req.accountability?.user;
      if (!user) return httpError(res, 401, 'UNAUTHENTICATED', 'Faça login.');
      const token = String(req.body?.token ?? '');
      const hash = createHash('sha256').update(token).digest('hex');
      try {
        const orgId = await database.transaction(async (trx) => {
          const invite = await trx('organization_invites').where({ token_hash: hash }).forUpdate().first();
          if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) throw new Error('INVITE_INVALID');
          const me = await trx('directus_users').where({ id: user }).first('email');
          if (String(me.email).toLowerCase() !== String(invite.email).toLowerCase()) throw new Error('INVITE_EMAIL_MISMATCH');
          await trx('profiles').insert({ id: user }).onConflict('id').ignore();
          await trx('organization_members')
            .insert({ organization_id: invite.organization_id, user_id: user, role: invite.role })
            .onConflict(['organization_id', 'user_id']).ignore();
          await trx('organization_invites').where({ id: invite.id }).update({ accepted_at: new Date() });
          return invite.organization_id;
        });
        return res.json({ data: { organization_id: orgId } });
      } catch (err) {
        const code = String(err?.message ?? '');
        if (code === 'INVITE_INVALID') return httpError(res, 400, code, 'Convite inválido ou expirado.');
        if (code === 'INVITE_EMAIL_MISMATCH') return httpError(res, 403, code, 'Este convite foi enviado para outro e-mail.');
        if (code.includes('MEMBER_LIMIT_REACHED')) return httpError(res, 409, 'MEMBER_LIMIT_REACHED', 'O plano desta organização não permite mais membros.');
        throw err;
      }
    });
  },
};
