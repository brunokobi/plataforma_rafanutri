// Endpoints da Rafanutri, montados em /rafanutri (ADR 0008, regra 2: operações atômicas
// viram endpoint com transação). JavaScript puro, sem build: o Directus carrega direto.
// forms.js é cópia de packages/forms/src/forms.js (pnpm --filter @rafanutri/forms sync).

import { createHash } from 'node:crypto';
import { validateAnswers } from './forms.js';
import { CUSTOM_NUTRIENTS, recipePer100g, validateFoodInput, validateRecipeInput } from './foods.js';

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

    // ── Alimentos próprios e preparações do consultório (RN-041, RN-042) ───────────────────────
    // Gravação atômica (alimento + nutrientes; preparação + ingredientes + composição calculada).
    // O consultório é sempre o do usuário (owner/nutricionista); os gatilhos da 0013 conferem de novo.
    const bad = (res, errors, message = 'Revise os campos destacados.') =>
      res.status(400).json({ errors: [{ message, extensions: { code: 'INVALID_PAYLOAD', fields: errors } }] });
    const notFound = (res) => res.status(404).json({ errors: [{ message: 'Alimento não encontrado.', extensions: { code: 'NOT_FOUND' } }] });

    async function clinicalOrg(userId, trx = database) {
      const row = await trx('organization_members as m')
        .join('organizations as o', 'o.id', 'm.organization_id')
        .where('m.user_id', userId)
        .whereIn('m.role', ['owner', 'nutritionist'])
        .orderBy('o.created_at')
        .first('o.id');
      return row?.id ?? null;
    }

    async function writeNutrients(trx, foodId, per100g) {
      const nutrients = await trx('nutrients').whereIn('code', CUSTOM_NUTRIENTS).select('id', 'code');
      await trx('food_nutrients').where('food_id', foodId).del();
      const rows = nutrients.filter((n) => per100g[n.code] !== null && per100g[n.code] !== undefined).map((n) => ({ food_id: foodId, nutrient_id: n.id, amount_per_100g: per100g[n.code], is_trace: false }));
      if (rows.length) await trx('food_nutrients').insert(rows);
    }

    async function ownFood(trx, id, orgId, kind) {
      if (!/^\d+$/.test(String(id))) return null;
      const q = trx('foods').where({ id: Number(id), organization_id: orgId });
      if (kind) q.andWhere('kind', kind);
      return q.first('id', 'kind', 'archived');
    }

    async function saveFood(req, res, id) {
      const user = requireUser(req, res);
      if (!user) return;
      const check = validateFoodInput(req.body);
      if (!check.ok) return bad(res, check.errors);
      const v = check.value;
      try {
        const out = await database.transaction(async (trx) => {
          const org = await clinicalOrg(user, trx);
          if (!org) return { forbidden: true };
          const source = await trx('food_sources').where('code', 'CUSTOM').first('id');
          let foodId;
          if (id) {
            const own = await ownFood(trx, id, org, 'food');
            if (!own) return { missing: true };
            await trx('foods').where('id', own.id).update({ name: v.name, food_group: v.food_group, household_measures: JSON.stringify(v.household_measures) });
            foodId = own.id;
          } else {
            const [row] = await trx('foods')
              .insert({ source_id: source.id, organization_id: org, name: v.name, food_group: v.food_group, household_measures: JSON.stringify(v.household_measures), kind: 'food', user_created: user })
              .returning('id');
            foodId = row.id ?? row;
          }
          await writeNutrients(trx, foodId, v.per100g);
          return { id: foodId };
        });
        if (out.forbidden) return res.status(403).json({ errors: [{ message: 'Você não tem consultório para cadastrar alimentos.', extensions: { code: 'FORBIDDEN' } }] });
        if (out.missing) return notFound(res);
        res.status(id ? 200 : 201).json({ data: { id: String(out.id), per100g: v.per100g } });
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao salvar alimento');
        res.status(500).json({ errors: [{ message: 'Não foi possível salvar o alimento.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    }
    router.post('/foods', (req, res) => saveFood(req, res, null));
    router.put('/foods/:id', (req, res) => saveFood(req, res, req.params.id));

    // Arquivar some da busca; planos antigos continuam mostrando o alimento. Reativar com { archived: false }.
    router.post('/foods/:id/archive', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      const own = org ? await ownFood(database, req.params.id, org) : null;
      if (!own) return notFound(res);
      await database('foods').where('id', own.id).update({ archived: req.body?.archived !== false });
      res.json({ data: { id: String(own.id), archived: req.body?.archived !== false } });
    });

    async function saveRecipe(req, res, id) {
      const user = requireUser(req, res);
      if (!user) return;
      const check = validateRecipeInput(req.body);
      if (!check.ok) return bad(res, check.errors);
      const v = check.value;
      try {
        const out = await database.transaction(async (trx) => {
          const org = await clinicalOrg(user, trx);
          if (!org) return { forbidden: true };
          let foodId = null;
          if (id) {
            const own = await ownFood(trx, id, org, 'recipe');
            if (!own) return { missing: true };
            foodId = own.id;
          }
          // Ingredientes: base pública ou do próprio consultório; nunca a própria preparação.
          const ids = [...new Set(v.items.map((i) => Number(i.foodId)))];
          const visible = await trx('foods')
            .whereIn('id', ids)
            .andWhere((q) => q.whereNull('organization_id').orWhere('organization_id', org))
            .select('id');
          if (visible.length !== ids.length || (foodId && ids.includes(foodId))) return { invalid: { items: 'Ingrediente inválido: use alimentos da base pública ou do próprio consultório.' } };
          const values = await trx('food_nutrients as fn')
            .join('nutrients as n', 'n.id', 'fn.nutrient_id')
            .whereIn('fn.food_id', ids)
            .whereIn('n.code', CUSTOM_NUTRIENTS)
            .select('fn.food_id', 'n.code', 'fn.amount_per_100g');
          const byFood = new Map(ids.map((i) => [i, {}]));
          for (const r of values) byFood.get(r.food_id)[r.code] = r.amount_per_100g === null ? null : Number(r.amount_per_100g);
          const { per100g, incomplete } = recipePer100g(v.items.map((i) => ({ quantityG: i.quantityG, per100g: byFood.get(Number(i.foodId)) })), v.yield_g);

          const source = await trx('food_sources').where('code', 'CUSTOM').first('id');
          if (foodId) {
            await trx('foods').where('id', foodId).update({ name: v.name, food_group: v.food_group, household_measures: JSON.stringify(v.household_measures) });
          } else {
            const [row] = await trx('foods')
              .insert({ source_id: source.id, organization_id: org, name: v.name, food_group: v.food_group ?? 'Preparações', household_measures: JSON.stringify(v.household_measures), kind: 'recipe', user_created: user })
              .returning('id');
            foodId = row.id ?? row;
          }
          const recipe = { food_id: foodId, yield_g: v.yield_g, servings: v.servings, instructions: v.instructions, items: JSON.stringify(v.items) };
          await trx('recipes').insert(recipe).onConflict('food_id').merge();
          await writeNutrients(trx, foodId, per100g);
          return { id: foodId, per100g, incomplete };
        });
        if (out.forbidden) return res.status(403).json({ errors: [{ message: 'Você não tem consultório para cadastrar preparações.', extensions: { code: 'FORBIDDEN' } }] });
        if (out.missing) return notFound(res);
        if (out.invalid) return bad(res, out.invalid);
        res.status(id ? 200 : 201).json({ data: { id: String(out.id), per100g: out.per100g, incomplete: out.incomplete } });
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao salvar preparação');
        res.status(500).json({ errors: [{ message: 'Não foi possível salvar a preparação.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    }
    router.post('/recipes', (req, res) => saveRecipe(req, res, null));
    router.put('/recipes/:id', (req, res) => saveRecipe(req, res, req.params.id));

    // Detalhe da preparação (ingredientes com nome) para editar e para o PDF.
    router.get('/recipes/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      const own = org ? await ownFood(database, req.params.id, org, 'recipe') : null;
      if (!own) return notFound(res);
      const recipe = await database('recipes').where('food_id', own.id).first();
      const items = recipe?.items ?? [];
      const names = await database('foods').whereIn('id', items.map((i) => Number(i.foodId))).select('id', 'name');
      const nameOf = new Map(names.map((n) => [String(n.id), n.name]));
      res.json({
        data: {
          id: String(own.id),
          yield_g: recipe ? Number(recipe.yield_g) : null,
          servings: recipe?.servings == null ? null : Number(recipe.servings),
          instructions: recipe?.instructions ?? null,
          items: items.map((i) => ({ ...i, name: nameOf.get(String(i.foodId)) ?? null })),
        },
      });
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

    // O token vai no corpo (POST), nunca na URL: URLs entram nos logs de acesso do Directus e de proxies.
    router.post('/public/anamneses/open', async (req, res) => {
      try {
        const row = await findByToken(req.body?.token);
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
    router.post('/public/anamneses/save', async (req, res) => {
      const body = req.body ?? {};
      const final = body.final === true;
      if (JSON.stringify(body.answers ?? {}).length > MAX_ANSWERS_BYTES) {
        return res.status(413).json({ errors: [{ message: 'Respostas muito longas.', extensions: { code: 'INVALID_PAYLOAD' } }] });
      }
      try {
        const result = await database.transaction(async (trx) => {
          const row = await findByToken(body.token, trx);
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
