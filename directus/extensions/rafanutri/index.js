// Endpoints da Rafanutri, montados em /rafanutri (ADR 0008, regra 2: operações atômicas
// viram endpoint com transação). JavaScript puro, sem build: o Directus carrega direto.
// forms.js é cópia de packages/forms/src/forms.js (pnpm --filter @rafanutri/forms sync).

import { createHash } from 'node:crypto';
import { validateAnswers } from './forms.js';

const TYPES = new Set(['solo', 'clinic']);
const CRN_REGION = /^CRN-([1-9]|1[01])$/;
const CRN = /^\d{1,6}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Valida o corpo do onboarding. Devolve a mensagem do primeiro erro ou null. */
export function validateOrganization(body) {
  if (!body || typeof body !== 'object') return 'Corpo inválido.';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 120) return 'Informe o nome do consultório (2 a 120 caracteres).';
  if (!TYPES.has(body.type)) return 'Tipo de consultório inválido.';
  if (body.brand_color != null && !COLOR.test(body.brand_color)) return 'Cor inválida.';
  if (typeof body.crn !== 'string' || !CRN.test(body.crn.trim())) return 'CRN inválido.';
  if (typeof body.crn_region !== 'string' || !CRN_REGION.test(body.crn_region)) return 'Regional do CRN inválida.';
  return null;
}

/** Token do link público: 32 bytes em base64url (43 caracteres). */
export const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const MAX_ANSWERS_BYTES = 100_000;

export default {
  id: 'rafanutri',
  handler: (router, { database, logger }) => {
    const requireUser = (req, res) => {
      const user = req.accountability?.user;
      if (!user) {
        res.status(401).json({ errors: [{ message: 'Faça login para continuar.', extensions: { code: 'UNAUTHORIZED' } }] });
        return null;
      }
      return user;
    };

    // Cria o consultório do usuário logado: organização + owner + perfil profissional, numa transação.
    // Idempotente: se o usuário já é owner de uma organização, devolve a existente.
    router.post('/organizations', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const problem = validateOrganization(req.body);
      if (problem) {
        res.status(400).json({ errors: [{ message: problem, extensions: { code: 'INVALID_PAYLOAD' } }] });
        return;
      }
      const b = req.body;
      try {
        const result = await database.transaction((trx) =>
          trx.raw('select * from create_organization(?, ?, ?, ?, ?, ?)', [
            user, b.name.trim(), b.type, b.brand_color ?? null, b.crn.trim(), b.crn_region,
          ]),
        );
        const org = result.rows[0];
        res.status(201).json({ data: { id: org.id, name: org.name, slug: org.slug, type: org.type, brand_color: org.brand_color, plan: org.plan } });
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao criar organização');
        res.status(500).json({ errors: [{ message: 'Não foi possível criar o consultório.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    // Consultórios do usuário logado, com o papel dele em cada um.
    router.get('/me/organizations', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const rows = await database('organization_members as m')
        .join('organizations as o', 'o.id', 'm.organization_id')
        .where('m.user_id', user)
        .orderBy('o.created_at')
        .select('o.id', 'o.name', 'o.slug', 'o.type', 'o.brand_color', 'o.plan', 'm.role');
      res.json({ data: rows });
    });

    // ── Anamnese por link público (RN-026), sem login ───────────────────────────────────────
    // Só o hash do token fica no banco. Devolve o mínimo: questionário, rascunho, primeiro nome
    // do paciente e marca do consultório. O limite de requisições por IP é o do Directus.
    const unavailable = (res) =>
      res.status(410).json({ errors: [{ message: 'Este link não está mais disponível. Peça um novo ao seu nutricionista.', extensions: { code: 'LINK_UNAVAILABLE' } }] });

    async function findByToken(token, trx = database) {
      if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) return null;
      const row = await trx('anamneses').where({ public_token_hash: hashToken(token), status: 'sent' }).first();
      if (!row || !row.token_expires_at || new Date(row.token_expires_at) <= new Date()) return null;
      return row;
    }

    router.get('/public/anamneses/:token', async (req, res) => {
      try {
        const row = await findByToken(req.params.token);
        if (!row) return unavailable(res);
        const [patient, org, author, profile] = await Promise.all([
          database('patients').where({ id: row.patient_id }).first('full_name'),
          database('organizations').where({ id: row.organization_id }).first('name', 'brand_color'),
          row.user_created ? database('directus_users').where({ id: row.user_created }).first('first_name', 'last_name') : null,
          row.user_created ? database('professional_profiles').where({ user_id: row.user_created }).first('crn', 'crn_region') : null,
        ]);
        res.json({
          data: {
            title: row.title,
            schema: row.schema_snapshot,
            answers: row.answers ?? {},
            expires_at: row.token_expires_at,
            patient_first_name: (patient?.full_name ?? '').trim().split(/\s+/)[0] || null,
            practice: { name: org?.name ?? null, brand_color: org?.brand_color ?? null },
            professional: author
              ? { name: [author.first_name, author.last_name].filter(Boolean).join(' ') || null, crn: profile?.crn ? `${profile.crn_region} ${profile.crn}` : null }
              : null,
          },
        });
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao abrir anamnese pública');
        res.status(500).json({ errors: [{ message: 'Não foi possível abrir o formulário agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    // Salva o rascunho ({ final: false }) ou envia ({ final: true }). Depois do envio o link deixa de valer.
    router.post('/public/anamneses/:token', async (req, res) => {
      const body = req.body ?? {};
      const final = body.final === true;
      if (JSON.stringify(body.answers ?? {}).length > MAX_ANSWERS_BYTES) {
        return res.status(413).json({ errors: [{ message: 'Respostas muito longas.', extensions: { code: 'INVALID_PAYLOAD' } }] });
      }
      try {
        const result = await database.transaction(async (trx) => {
          const row = await findByToken(req.params.token, trx);
          if (!row) return { gone: true };
          const check = validateAnswers(row.schema_snapshot, body.answers, { partial: !final });
          if (!check.ok) return { invalid: check.errors };
          const patch = final ? { answers: check.answers, status: 'answered' } : { answers: check.answers };
          // Condição no WHERE evita corrida com outro envio pelo mesmo link.
          const n = await trx('anamneses').where({ id: row.id, status: 'sent', public_token_hash: row.public_token_hash }).update(patch);
          return n === 1 ? { ok: true } : { gone: true };
        });
        if (result.gone) return unavailable(res);
        if (result.invalid) {
          return res.status(400).json({ errors: [{ message: 'Revise as respostas destacadas.', extensions: { code: 'INVALID_PAYLOAD', fields: result.invalid } }] });
        }
        res.json({ data: { status: final ? 'answered' : 'sent' } });
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao salvar anamnese pública');
        res.status(500).json({ errors: [{ message: 'Não foi possível salvar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });
  },
};
