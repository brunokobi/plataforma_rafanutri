// Endpoints da Rafanutri, montados em /rafanutri (ADR 0008, regra 2: operações atômicas
// viram endpoint com transação). JavaScript puro, sem build: o Directus carrega direto.
// forms.js é cópia de packages/forms/src/forms.js (pnpm --filter @rafanutri/forms sync).

import { createHash, randomBytes } from 'node:crypto';
import { validateAnswers } from './forms.js';
import { Readable } from 'node:stream';
import { CUSTOM_NUTRIENTS, parseImageDataUrl, recipePer100g, validateFoodInput, validateRecipeInput } from './foods.js';
import { validateDocumentInput } from './documents.js';
import { validateLead } from './crm.js';
import { isOfferedSlot, localDateOf, publicSlots, validateBooking } from './booking.js';
import { setupNotifications } from './notify.js';
import { setupPublicHealth } from './public-health.js';
import { setupClinicalDashboard } from './clinical-dashboard.js';
import { setupSubscriptions } from './subscriptions.js';
import { setupMaternal } from './maternal.js';
import { setupAI } from './ai.js';
import { fillMonths, isIsoDate, monthStart, splitInstallments, validatePackage, validateTransaction } from './finance.js';

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
  handler: (router, { database, logger, services, getSchema }) => {
    let notifier = null;   // avisos (notify.js), montado no fim do handler
    // Papel "Paciente" (migração 0018): conta da área do paciente.
    const PATIENT_ROLE = '5d1c7a3e-0002-4b6e-9a01-7e2a0c9a0002';
    async function isPatientAccount(userId) {
      const u = await database('directus_users').where({ id: userId }).first('role');
      return u?.role === PATIENT_ROLE;
    }

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
      if (await isPatientAccount(user)) {
        res.status(403).json({ errors: [{ message: 'Contas de paciente não criam consultório.', extensions: { code: 'FORBIDDEN' } }] });
        return;
      }
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
        .select('o.id', 'o.name', 'o.slug', 'o.type', 'o.brand_color', 'o.plan', 'm.role', database.raw('(o.logo is not null) as has_logo'), 'o.receipt_tax_id',
          database.raw("to_char(o.work_start, 'HH24:MI') as work_start"), database.raw("to_char(o.work_end, 'HH24:MI') as work_end"), 'o.work_weekdays', 'o.modules');
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
          const recipe = { food_id: foodId, yield_g: v.yield_g, servings: v.servings, instructions: v.instructions, items: JSON.stringify(v.items), description: v.description, prep_minutes: v.prep_minutes, difficulty: v.difficulty, tags: JSON.stringify(v.tags) };
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
          description: recipe?.description ?? null,
          prep_minutes: recipe?.prep_minutes ?? null,
          difficulty: recipe?.difficulty ?? null,
          tags: recipe?.tags ?? [],
          has_image: Boolean(recipe?.image),
        },
      });
    });

    // ── Biblioteca de receitas (RN-206) e receitas do paciente (RN-207) ─────────────────────────
    const recipeNotFound = (res) => res.status(404).json({ errors: [{ message: 'Receita não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
    const kcalOf = async (ids) => {
      if (!ids.length) return new Map();
      const rows = await database('food_nutrients as fn').join('nutrients as n', 'n.id', 'fn.nutrient_id')
        .whereIn('fn.food_id', ids).where('n.code', 'energy_kcal').select('fn.food_id', 'fn.amount_per_100g');
      return new Map(rows.map((r) => [r.food_id, r.amount_per_100g == null ? null : Number(r.amount_per_100g)]));
    };
    /** Resumo de receitas para listas (kcal por porção quando há porções; senão por 100 g). */
    async function recipeSummaries(foodIds) {
      if (!foodIds.length) return [];
      const rows = await database('foods as f').join('recipes as r', 'r.food_id', 'f.id').whereIn('f.id', foodIds)
        .select('f.id', 'f.name', 'f.archived', 'r.yield_g', 'r.servings', 'r.description', 'r.prep_minutes', 'r.difficulty', 'r.tags', 'r.image')
        .orderBy('f.name');
      const kcal = await kcalOf(rows.map((r) => r.id));
      return rows.map((r) => {
        const per100 = kcal.get(r.id) ?? null;
        const yieldG = Number(r.yield_g);
        const servings = r.servings == null ? null : Number(r.servings);
        return {
          id: String(r.id), name: r.name, archived: Boolean(r.archived), description: r.description ?? null,
          prep_minutes: r.prep_minutes ?? null, difficulty: r.difficulty ?? null, tags: r.tags ?? [], has_image: Boolean(r.image),
          yield_g: yieldG, servings,
          kcal_per_serving: per100 != null && servings ? Math.round((per100 * yieldG) / 100 / servings) : null,
          kcal_per_100g: per100 != null ? Math.round(per100) : null,
        };
      });
    }

    router.get('/recipes', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      if (!org) return res.json({ data: [] });
      const ids = await database('foods').where({ organization_id: org, kind: 'recipe' }).pluck('id');
      res.json({ data: await recipeSummaries(ids) });
    });

    // Foto: data URL (jpeg/png/webp, já reduzida no navegador). Substitui a anterior.
    router.post('/recipes/:id/image', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      const own = org ? await ownFood(database, req.params.id, org, 'recipe') : null;
      if (!own) return recipeNotFound(res);
      const img = parseImageDataUrl(req.body?.image);
      if (!img) return bad(res, { image: 'Envie uma foto JPG, PNG ou WebP de até 600 KB.' });
      const recipe = await database('recipes').where('food_id', own.id).first('image');
      if (!recipe) return recipeNotFound(res);
      try {
        const files = new services.FilesService({ schema: await getSchema(), accountability: null });
        const ext = img.type.split('/')[1].replace('jpeg', 'jpg');
        const fileId = await files.uploadOne(Readable.from(img.buffer), { filename_download: `receita-${own.id}.${ext}`, type: img.type, title: `Receita ${own.id}` });
        await database('recipes').where('food_id', own.id).update({ image: fileId });
        if (recipe.image) await files.deleteOne(recipe.image).catch(() => {});
        res.json({ data: { has_image: true } });
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao salvar foto da receita');
        res.status(500).json({ errors: [{ message: 'Não foi possível salvar a foto.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    router.delete('/recipes/:id/image', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      const own = org ? await ownFood(database, req.params.id, org, 'recipe') : null;
      if (!own) return recipeNotFound(res);
      const recipe = await database('recipes').where('food_id', own.id).first('image');
      if (recipe?.image) {
        await database('recipes').where('food_id', own.id).update({ image: null });
        const files = new services.FilesService({ schema: await getSchema(), accountability: null });
        await files.deleteOne(recipe.image).catch(() => {});
      }
      res.json({ data: { has_image: false } });
    });

    /** Receitas que o paciente (registro ativo) vê: enviadas + usadas no plano publicado. Map id → { sent, note, in_plan }. */
    async function visibleRecipes(patient) {
      const out = new Map();
      const sent = await database('patient_recipes as pr').join('foods as f', 'f.id', 'pr.recipe_food_id')
        .where({ 'pr.patient_id': patient.id, 'f.organization_id': patient.organization_id, 'f.kind': 'recipe' })
        .select('pr.recipe_food_id', 'pr.note', 'pr.date_created');
      for (const r of sent) out.set(r.recipe_food_id, { sent: true, note: r.note ?? null, sent_at: r.date_created, in_plan: false });
      const plan = await database('meal_plans').where({ patient_id: patient.id, organization_id: patient.organization_id, status: 'published' })
        .orderBy('published_at', 'desc').first('meals');
      const ids = [...new Set((plan?.meals ?? []).flatMap((m) => (m.items ?? []).flatMap((i) => [i.foodId, ...(i.subs ?? []).map((s) => s.foodId)])))]
        .map(String).filter((id) => /^\d+$/.test(id)).map(Number);
      if (ids.length) {
        const inPlan = await database('foods').whereIn('id', ids).where({ organization_id: patient.organization_id, kind: 'recipe' }).pluck('id');
        for (const id of inPlan) out.set(id, { ...(out.get(id) ?? { sent: false, note: null, sent_at: null }), in_plan: true });
      }
      return out;
    }
    async function myPatientRecord(user, c) {
      let q = database('patients').where('app_user_id', user).where('status', 'active');
      if (c) q = q.where('id', c);
      return q.orderBy('app_activated_at', 'desc').first('id', 'organization_id');
    }

    // Foto da receita: profissional do consultório ou paciente que vê a receita.
    router.get('/recipes/:id/image', async (req, res) => {
      const user = requireUser(req, res);
      if (!user || !/^\d+$/.test(req.params.id)) return user ? recipeNotFound(res) : undefined;
      const row = await database('foods as f').join('recipes as r', 'r.food_id', 'f.id')
        .where({ 'f.id': Number(req.params.id), 'f.kind': 'recipe' }).first('f.id', 'f.organization_id', 'r.image');
      if (!row?.image) return recipeNotFound(res);
      let allowed = (await clinicalOrg(user)) === row.organization_id
        || Boolean(await database('organization_members').where({ user_id: user, organization_id: row.organization_id }).first('user_id'));
      if (!allowed) {
        const records = await database('patients').where({ app_user_id: user, status: 'active', organization_id: row.organization_id }).select('id', 'organization_id');
        for (const p of records) if ((await visibleRecipes(p)).has(row.id)) { allowed = true; break; }
      }
      if (!allowed) return recipeNotFound(res);
      try {
        const assets = new services.AssetsService({ schema: await getSchema(), accountability: null });
        const { stream, file } = await assets.getAsset(row.image);
        res.setHeader('Content-Type', file.type ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        stream.pipe(res);
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao ler foto da receita');
        recipeNotFound(res);
      }
    });

    // Envio de receitas ao paciente (ficha do paciente)
    router.get('/patients/:id/recipes', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      const vis = await visibleRecipes(p);
      const list = await recipeSummaries([...vis.keys()]);
      res.json({ data: list.map((r) => ({ ...r, ...vis.get(Number(r.id)) })) });
    });

    router.post('/patients/:id/recipes', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      const own = await ownFood(database, req.body?.recipe_id, p.organization_id, 'recipe');
      if (!own || own.archived) return recipeNotFound(res);
      const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
      try {
        await database('patient_recipes')
          .insert({ organization_id: p.organization_id, patient_id: p.id, recipe_food_id: own.id, note: note || null, user_created: user })
          .onConflict(['patient_id', 'recipe_food_id']).merge({ note: note || null });
        res.status(201).json({ data: { ok: true } });
      } catch (error) {
        if (error?.code === 'P0001') return res.status(409).json({ errors: [{ message: error.message.split('\n')[0].replace(/^.* - /, ''), extensions: { code: 'CONFLICT' } }] });
        throw error;
      }
    });

    router.delete('/patients/:id/recipes/:recipeId', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p || !/^\d+$/.test(req.params.recipeId)) return recipeNotFound(res);
      await database('patient_recipes').where({ patient_id: p.id, recipe_food_id: Number(req.params.recipeId) }).del();
      res.json({ data: { ok: true } });
    });

    // Área do paciente: lista e detalhe (ingredientes com medidas caseiras)
    router.get('/me/patient/recipes', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const c = isUuid(req.query.c) ? req.query.c : null;
      const p = await myPatientRecord(user, c);
      if (!p) return res.json({ data: { patient_id: null, recipes: [] } });
      const vis = await visibleRecipes(p);
      const list = await recipeSummaries([...vis.keys()]);
      res.json({
        data: {
          patient_id: p.id,
          recipes: list.map(({ archived: _a, kcal_per_serving: _k, kcal_per_100g: _h, ...r }) => ({ ...r, ...vis.get(Number(r.id)) })),
        },
      });
    });

    router.get('/me/patient/recipes/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const c = isUuid(req.query.c) ? req.query.c : null;
      const p = await myPatientRecord(user, c);
      const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
      if (!p || !id) return recipeNotFound(res);
      const vis = await visibleRecipes(p);
      if (!vis.has(id)) return recipeNotFound(res);
      const [summary] = await recipeSummaries([id]);
      const recipe = await database('recipes').where('food_id', id).first('instructions', 'items');
      if (!summary || !recipe) return recipeNotFound(res);
      const items = recipe.items ?? [];
      const ing = await database('foods').whereIn('id', items.map((i) => Number(i.foodId))).select('id', 'name', 'household_measures');
      const ingOf = new Map(ing.map((f) => [String(f.id), f]));
      const { archived: _a, kcal_per_serving: _k, kcal_per_100g: _h, ...rest } = summary;
      res.json({
        data: {
          patient_id: p.id,
          ...rest,
          ...vis.get(id),
          instructions: recipe.instructions ?? null,
          ingredients: items.map((i) => {
            const f = ingOf.get(String(i.foodId));
            return { name: f?.name ?? null, quantityG: Number(i.quantityG) || 0, household_measures: Array.isArray(f?.household_measures) ? f.household_measures : [] };
          }),
        },
      });
    });

    // ── Recomendações ao paciente (RN-208) ─────────────────────────────────────────────────────
    const recNotFound = (res) => res.status(404).json({ errors: [{ message: 'Recomendação não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
    const REC_FIELDS = ['id', 'category', 'title', 'body', 'pinned', 'status', 'published_at', 'read_at', 'date_created', 'date_updated'];
    /** Valida uma recomendação. Devolve { value } ou { errors }. */
    function recInput(b) {
      const errors = {};
      const category = typeof b?.category === 'string' ? b.category.trim().replace(/\s+/g, ' ') : '';
      const title = typeof b?.title === 'string' ? b.title.trim() : '';
      const body = typeof b?.body === 'string' ? b.body.trim() : '';
      if (category.length < 2 || category.length > 40) errors.category = 'Categoria de 2 a 40 caracteres.';
      if (title.length < 2 || title.length > 120) errors.title = 'Título de 2 a 120 caracteres.';
      if (body.length < 2 || body.length > 4000) errors.body = 'Texto de 2 a 4.000 caracteres.';
      return Object.keys(errors).length ? { errors } : { value: { category, title, body, pinned: b?.pinned === true } };
    }
    const recConflict = (res, error) => {
      if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
      logger.error({ err: error }, 'rafanutri: falha em recomendação');
      return res.status(500).json({ errors: [{ message: 'Não foi possível salvar a recomendação agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    };
    const recOrder = (q) => q.orderBy([{ column: 'pinned', order: 'desc' }, { column: 'date_created', order: 'desc' }]);

    router.get('/patients/:id/recommendations', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return recNotFound(res);
      res.json({ data: await recOrder(database('patient_recommendations').where('patient_id', p.id)).select(REC_FIELDS) });
    });

    // Cria uma ou várias (ex.: pacote da primeira consulta), em rascunho ou já publicadas.
    router.post('/patients/:id/recommendations', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return recNotFound(res);
      const list = Array.isArray(req.body?.items) ? req.body.items : [req.body];
      if (list.length < 1 || list.length > 30) return bad(res, { items: 'Envie de 1 a 30 recomendações.' });
      const rows = [];
      for (const item of list) {
        const r = recInput(item);
        if (r.errors) return bad(res, r.errors);
        rows.push({ ...r.value, organization_id: p.organization_id, patient_id: p.id, user_created: user, status: req.body?.publish === true ? 'published' : 'draft' });
      }
      try {
        const ids = await database('patient_recommendations').insert(rows).returning('id');
        res.status(201).json({ data: { ids: ids.map((x) => x.id ?? x) } });
      } catch (error) {
        recConflict(res, error);
      }
    });

    async function ownRec(user, id) {
      const org = await clinicalOrg(user);
      if (!org || !isUuid(id)) return null;
      return database('patient_recommendations').where({ id, organization_id: org }).first('id', 'patient_id');
    }

    // Edita conteúdo, fixar e status (draft/published). A leitura nunca vem daqui.
    router.put('/recommendations/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const own = await ownRec(user, req.params.id);
      if (!own) return recNotFound(res);
      const r = recInput(req.body);
      if (r.errors) return bad(res, r.errors);
      const status = req.body?.status === 'published' ? 'published' : 'draft';
      try {
        await withActor(user, (trx) => trx('patient_recommendations').where('id', own.id).update({ ...r.value, status }));
        res.json({ data: await database('patient_recommendations').where('id', own.id).first(REC_FIELDS) });
      } catch (error) {
        recConflict(res, error);
      }
    });

    router.delete('/recommendations/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const own = await ownRec(user, req.params.id);
      if (!own) return recNotFound(res);
      await withActor(user, (trx) => trx('patient_recommendations').where('id', own.id).del());
      res.json({ data: { ok: true } });
    });

    // Área do paciente: só publicadas do registro ativo
    router.get('/me/patient/recommendations', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await myPatientRecord(user, isUuid(req.query.c) ? req.query.c : null);
      if (!p) return res.json({ data: { patient_id: null, recommendations: [] } });
      const list = await recOrder(database('patient_recommendations').where({ patient_id: p.id, organization_id: p.organization_id, status: 'published' }))
        .select('id', 'category', 'title', 'body', 'pinned', 'published_at', 'read_at');
      res.json({ data: { patient_id: p.id, recommendations: list } });
    });

    router.post('/me/patient/recommendations/:id/read', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      if (!isUuid(req.params.id)) return recNotFound(res);
      const rec = await database('patient_recommendations as r').join('patients as p', 'p.id', 'r.patient_id')
        .where({ 'r.id': req.params.id, 'r.status': 'published', 'p.app_user_id': user, 'p.status': 'active' })
        .first('r.id', 'r.read_at');
      if (!rec) return recNotFound(res);
      if (rec.read_at) return res.json({ data: { read_at: rec.read_at } });
      try {
        const readAt = await database.transaction(async (trx) => {
          await trx.raw("select set_config('rafanutri.patient_read', 'on', true)");
          const [row] = await trx('patient_recommendations').where({ id: rec.id }).whereNull('read_at').update({ read_at: trx.fn.now() }).returning('read_at');
          return row?.read_at ?? null;
        });
        res.json({ data: { read_at: readAt } });
      } catch (error) {
        recConflict(res, error);
      }
    });

    // ── Financeiro (RN-053) ─────────────────────────────────────────────────────────────────────
    // Qualquer membro do consultório lança e edita; excluir só owner/nutricionista (o banco confere
    // pela variável rafanutri.actor). Valores sempre em centavos.
    const finNotFound = (res) => res.status(404).json({ errors: [{ message: 'Lançamento não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const todaySP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const finDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d == null ? null : String(d).slice(0, 10));
    const TX_FIELDS = ['t.id', 't.kind', 't.category_id', 'c.name as category_name', 't.description', 't.amount_cents', database.raw('t.due_date::text as due_date'), 't.status', database.raw('t.paid_at::text as paid_at'),
      't.payment_method', 't.patient_id', 'p.full_name as patient_name', 't.appointment_id', 't.notes', 't.date_created',
      database.raw('(select r.id from receipts r where r.transaction_id = t.id) as receipt_id')];
    const txOut = (r) => ({ ...r, amount_cents: Number(r.amount_cents), due_date: finDate(r.due_date), paid_at: finDate(r.paid_at) });
    const finConflict = (res, error) => {
      if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
      if (error?.code === '23505') return conflict(res, 'Esta consulta já tem um recebimento registrado.');
      if (error?.code === '23503') return conflict(res, 'Este lançamento tem recibo emitido: cancele em vez de excluir.');
      logger.error({ err: error }, 'rafanutri: falha no financeiro');
      return res.status(500).json({ errors: [{ message: 'Não foi possível salvar o lançamento agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    };
    async function finMember(req, res) {
      const user = requireUser(req, res);
      if (!user) return null;
      const m = await memberOrg(user);
      if (!m) {
        res.status(403).json({ errors: [{ message: 'Você não tem consultório.', extensions: { code: 'FORBIDDEN' } }] });
        return null;
      }
      return { user, org: m.id, role: m.role };
    }
    const txQuery = (org) => database('financial_transactions as t')
      .join('financial_categories as c', 'c.id', 't.category_id')
      .leftJoin('patients as p', 'p.id', 't.patient_id')
      .where('t.organization_id', org);

    router.get('/finance/categories', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const rows = await database('financial_categories').where((q) => q.whereNull('organization_id').orWhere('organization_id', m.org)).where('archived', false)
        .orderBy([{ column: 'kind' }, { column: 'name' }]).select('id', 'kind', 'name', database.raw('(organization_id is not null) as own'));
      res.json({ data: rows });
    });

    router.post('/finance/categories', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const kind = req.body?.kind === 'income' || req.body?.kind === 'expense' ? req.body.kind : null;
      const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
      if (!kind || name.length < 2 || name.length > 40) return bad(res, { name: 'Nome de 2 a 40 caracteres e tipo (receita ou despesa).' });
      try {
        const [row] = await database('financial_categories').insert({ organization_id: m.org, kind, name, user_created: m.user }).returning(['id', 'kind', 'name']);
        res.status(201).json({ data: { ...row, own: true } });
      } catch (error) {
        if (error?.code === '23505') return conflict(res, 'Já existe uma categoria com esse nome.');
        finConflict(res, error);
      }
    });

    // Lista por vencimento no período (padrão: mês atual). ?from=aaaa-mm-dd&to=aaaa-mm-dd&kind=&status=
    router.get('/finance/transactions', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const today = todaySP();
      const from = isIsoDate(req.query.from) ? req.query.from : `${today.slice(0, 7)}-01`;
      const to = isIsoDate(req.query.to) ? req.query.to : monthStart(today.slice(0, 7), 1);
      let q = txQuery(m.org).where('t.due_date', '>=', from).where('t.due_date', '<', to);
      if (req.query.kind === 'income' || req.query.kind === 'expense') q = q.where('t.kind', req.query.kind);
      if (['open', 'paid', 'cancelled'].includes(req.query.status)) q = q.where('t.status', req.query.status);
      if (isUuid(req.query.patient)) q = q.where('t.patient_id', req.query.patient);
      const rows = await q.orderBy([{ column: 't.due_date', order: 'asc' }, { column: 't.date_created', order: 'asc' }]).limit(2000).select(TX_FIELDS);
      res.json({ data: { from, to, today, transactions: rows.map(txOut), can_delete: m.role !== 'assistant' } });
    });

    // Resumo: 6 meses de caixa (pagos, pelo mês do pagamento) e contas a receber em aberto (atrasadas à parte).
    router.get('/finance/summary', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const today = todaySP();
      const ym = /^\d{4}-\d{2}$/.test(req.query.month ?? '') ? req.query.month : today.slice(0, 7);
      const rows = await database('monthly_cash_flow').where('organization_id', m.org)
        .where('month', '>=', monthStart(ym, -5)).where('month', '<', monthStart(ym, 1)).select(database.raw('month::text as month'), 'income_cents', 'expense_cents');
      const open = await database('financial_transactions').where({ organization_id: m.org, kind: 'income', status: 'open' })
        .select(database.raw('coalesce(sum(amount_cents), 0)::bigint as total'), database.raw('count(*)::int as n'),
          database.raw('coalesce(sum(amount_cents) filter (where due_date < ?), 0)::bigint as overdue', [today]),
          database.raw('(count(*) filter (where due_date < ?))::int as overdue_n', [today])).first();
      res.json({
        data: {
          today,
          months: fillMonths(rows, ym, 6),
          receivable: { total_cents: Number(open?.total ?? 0), count: open?.n ?? 0, overdue_cents: Number(open?.overdue ?? 0), overdue_count: open?.overdue_n ?? 0 },
        },
      });
    });

    router.post('/finance/transactions', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const r = validateTransaction(req.body);
      if (r.errors) return bad(res, r.errors);
      try {
        const [row] = await database('financial_transactions').insert({ ...r.value, organization_id: m.org, user_created: m.user }).returning('id');
        res.status(201).json({ data: txOut(await txQuery(m.org).where('t.id', row.id ?? row).first(TX_FIELDS)) });
      } catch (error) {
        finConflict(res, error);
      }
    });

    router.put('/finance/transactions/:id', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!isUuid(req.params.id)) return finNotFound(res);
      const own = await database('financial_transactions').where({ id: req.params.id, organization_id: m.org }).first('id');
      if (!own) return finNotFound(res);
      const r = validateTransaction(req.body);
      if (r.errors) return bad(res, r.errors);
      try {
        await withActor(m.user, (trx) => trx('financial_transactions').where('id', own.id).update(r.value));
        res.json({ data: txOut(await txQuery(m.org).where('t.id', own.id).first(TX_FIELDS)) });
      } catch (error) {
        finConflict(res, error);
      }
    });

    router.delete('/finance/transactions/:id', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!isUuid(req.params.id)) return finNotFound(res);
      const own = await database('financial_transactions').where({ id: req.params.id, organization_id: m.org }).first('id');
      if (!own) return finNotFound(res);
      if (m.role === 'assistant') return res.status(403).json({ errors: [{ message: 'Só owner ou nutricionista exclui lançamentos. Você pode cancelar.', extensions: { code: 'FORBIDDEN' } }] });
      try {
        await database.transaction(async (trx) => {
          await trx.raw("select set_config('rafanutri.actor', ?, true)", [m.user]);
          await trx('financial_transactions').where('id', own.id).del();
        });
        res.json({ data: { ok: true } });
      } catch (error) {
        finConflict(res, error);
      }
    });

    // Pré-preenchimento do "Registrar pagamento" na consulta.
    router.get('/finance/appointment/:id', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!isUuid(req.params.id)) return finNotFound(res);
      const a = await database('appointments as a').join('patients as p', 'p.id', 'a.patient_id')
        .where({ 'a.id': req.params.id, 'a.organization_id': m.org }).first('a.id', 'a.patient_id', 'p.full_name as patient_name', 'a.starts_at', 'a.type', 'a.status');
      if (!a) return finNotFound(res);
      const existing = await database('financial_transactions').where('appointment_id', a.id).whereNot('status', 'cancelled').first('id', 'status');
      const last = await database('financial_transactions').where({ organization_id: m.org, patient_id: a.patient_id, kind: 'income' }).whereNot('status', 'cancelled')
        .orderBy('date_created', 'desc').first('amount_cents');
      res.json({ data: { ...a, existing: existing ?? null, last_amount_cents: last ? Number(last.amount_cents) : null } });
    });

    // ── Recibos (RN-055) ────────────────────────────────────────────────────────────────────────
    const RECEIPT_FIELDS = ['id', 'number', 'issued_at', 'amount_cents', database.raw('paid_at::text as paid_at'), 'payment_method', 'service', 'payer_name', 'payer_cpf',
      'issuer_name', 'issuer_crn', 'issuer_tax_id', 'practice_name', 'transaction_id'];
    const receiptOut = (r) => (r ? { ...r, amount_cents: Number(r.amount_cents) } : r);
    async function receiptPayload(orgId, id) {
      const r = await database('receipts').where({ id, organization_id: orgId }).first(RECEIPT_FIELDS);
      if (!r) return null;
      const org = await database('organizations').where('id', orgId).first('brand_color');
      return { receipt: receiptOut(r), header: { organization_id: orgId, brand_color: org?.brand_color ?? null } };
    }
    /** Quem assina: o nutricionista da consulta, senão quem emite (se clínico), senão o owner. */
    async function receiptIssuer(orgId, tx, user, role) {
      let issuerId = null;
      if (tx.appointment_id) issuerId = (await database('appointments').where('id', tx.appointment_id).first('nutritionist_id'))?.nutritionist_id ?? null;
      if (!issuerId && role !== 'assistant') issuerId = user;
      if (!issuerId) issuerId = (await database('organization_members').where({ organization_id: orgId, role: 'owner' }).first('user_id'))?.user_id ?? user;
      const u = await database('directus_users').where('id', issuerId).first('first_name', 'last_name', 'email');
      const prof = await database('professional_profiles').where('user_id', issuerId).first('crn', 'crn_region');
      return {
        issuer_name: [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.email || 'Nutricionista',
        issuer_crn: prof?.crn ? `${prof.crn_region ?? 'CRN'} ${prof.crn}` : null,
      };
    }

    // Emite (ou devolve o já emitido) o recibo de um recebimento pago. Corpo opcional: { payer_name, payer_cpf, service }.
    router.post('/finance/transactions/:id/receipt', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!isUuid(req.params.id)) return finNotFound(res);
      const tx = await database('financial_transactions').where({ id: req.params.id, organization_id: m.org }).first();
      if (!tx) return finNotFound(res);
      const existing = await database('receipts').where('transaction_id', tx.id).first('id');
      if (existing) return res.json({ data: await receiptPayload(m.org, existing.id) });
      if (tx.kind !== 'income' || tx.status !== 'paid') return conflict(res, 'Recibo só de recebimento pago.');
      const patient = tx.patient_id ? await database('patients').where('id', tx.patient_id).first('full_name', 'cpf') : null;
      const b = req.body ?? {};
      const payerName = (typeof b.payer_name === 'string' && b.payer_name.trim() ? b.payer_name : patient?.full_name ?? '').trim().replace(/\s+/g, ' ');
      const cpfRaw = typeof b.payer_cpf === 'string' ? b.payer_cpf.replace(/\D/g, '') : patient?.cpf ?? '';
      const service = (typeof b.service === 'string' && b.service.trim() ? b.service : tx.description).trim().replace(/\s+/g, ' ');
      const errors = {};
      if (payerName.length < 2 || payerName.length > 160) errors.payer_name = 'Informe o nome de quem pagou.';
      if (cpfRaw && cpfRaw.length !== 11) errors.payer_cpf = 'CPF com 11 dígitos.';
      if (service.length < 2 || service.length > 200) errors.service = 'Descreva o serviço (2 a 200 caracteres).';
      if (Object.keys(errors).length) return bad(res, errors);
      const org = await database('organizations').where('id', m.org).first('name', 'receipt_tax_id');
      try {
        const issuer = await receiptIssuer(m.org, tx, m.user, m.role);
        const [row] = await database('receipts').insert({
          organization_id: m.org, transaction_id: tx.id, number: 0, amount_cents: tx.amount_cents, paid_at: tx.paid_at,
          service, payer_name: payerName, payer_cpf: cpfRaw || null, ...issuer, issuer_tax_id: org?.receipt_tax_id ?? null,
          practice_name: org?.name ?? 'Consultório', user_created: m.user,
        }).returning('id');
        res.status(201).json({ data: await receiptPayload(m.org, row.id ?? row) });
      } catch (error) {
        if (error?.code === '23505') {
          const again = await database('receipts').where('transaction_id', tx.id).first('id');
          if (again) return res.json({ data: await receiptPayload(m.org, again.id) });
        }
        finConflict(res, error);
      }
    });

    router.get('/finance/receipts/:id', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!isUuid(req.params.id)) return finNotFound(res);
      const p = await receiptPayload(m.org, req.params.id);
      if (!p) return finNotFound(res);
      logAccess(m.org, m.user, 'receipts', req.params.id, null, 'export');
      res.json({ data: p });
    });

    // ── Pacotes de consultas (RN-054) ───────────────────────────────────────────────────────────
    const pkgNotFound = (res) => res.status(404).json({ errors: [{ message: 'Pacote não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const PKG_FIELDS = ['id', 'name', 'sessions', 'price_cents', 'validity_days', 'active'];
    const pkgOut = (p) => ({ ...p, price_cents: Number(p.price_cents) });
    const PP_FIELDS = ['id', 'name', 'sessions_total', 'sessions_used', 'price_cents', database.raw('sold_at::text as sold_at'), database.raw('expires_at::text as expires_at'), 'status', 'package_id'];
    const ppOut = (p) => ({ ...p, price_cents: Number(p.price_cents) });
    const clinical = (m) => m.role === 'owner' || m.role === 'nutritionist';
    const forbidClinical = (res) => res.status(403).json({ errors: [{ message: 'Só owner ou nutricionista gerencia pacotes.', extensions: { code: 'FORBIDDEN' } }] });

    router.get('/packages', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const rows = await database('service_packages').where('organization_id', m.org).orderBy([{ column: 'active', order: 'desc' }, { column: 'name' }]).select(PKG_FIELDS);
      res.json({ data: rows.map(pkgOut) });
    });

    async function savePackage(req, res, id) {
      const m = await finMember(req, res);
      if (!m) return;
      if (!clinical(m)) return forbidClinical(res);
      const r = validatePackage(req.body);
      if (r.errors) return bad(res, r.errors);
      try {
        if (id) {
          if (!isUuid(id)) return pkgNotFound(res);
          const [row] = await database('service_packages').where({ id, organization_id: m.org }).update(r.value).returning(PKG_FIELDS);
          return row ? res.json({ data: pkgOut(row) }) : pkgNotFound(res);
        }
        const [row] = await database('service_packages').insert({ ...r.value, organization_id: m.org, user_created: m.user }).returning(PKG_FIELDS);
        res.status(201).json({ data: pkgOut(row) });
      } catch (error) {
        finConflict(res, error);
      }
    }
    router.post('/packages', (req, res) => savePackage(req, res, null));
    router.put('/packages/:id', (req, res) => savePackage(req, res, req.params.id));

    async function memberPatient(m, id) {
      if (!isUuid(id)) return null;
      return database('patients').where({ id, organization_id: m.org }).first('id', 'full_name', 'status');
    }

    router.get('/patients/:id/packages', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const p = await memberPatient(m, req.params.id);
      if (!p) return pkgNotFound(res);
      await database.raw('select expire_patient_packages(?)', [m.org]);
      const rows = await database('patient_packages').where('patient_id', p.id).orderBy('date_created', 'desc').select(PP_FIELDS);
      const uses = rows.length
        ? await database('appointments').whereIn('patient_package_id', rows.map((r) => r.id)).where('status', 'completed').orderBy('starts_at').select('patient_package_id', 'starts_at')
        : [];
      res.json({ data: rows.map((r) => ({ ...ppOut(r), sessions: uses.filter((u) => u.patient_package_id === r.id).map((u) => u.starts_at) })) });
    });

    // Venda: pacote do catálogo, à vista (1) ou em até 12 parcelas; gera os lançamentos no financeiro.
    router.post('/patients/:id/packages', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!clinical(m)) return forbidClinical(res);
      const p = await memberPatient(m, req.params.id);
      if (!p) return pkgNotFound(res);
      const b = req.body ?? {};
      const pkg = isUuid(b.package_id) ? await database('service_packages').where({ id: b.package_id, organization_id: m.org, active: true }).first() : null;
      if (!pkg) return bad(res, { package_id: 'Escolha um pacote ativo do catálogo.' });
      const today = todaySP();
      const n = Number(b.installments ?? 1);
      const parts = splitInstallments(Number(pkg.price_cents), n, isIsoDate(b.first_due_date) ? b.first_due_date : today);
      if (!parts) return bad(res, { installments: 'De 1 a 12 parcelas e data válida.' });
      const method = b.payment_method == null || b.payment_method === '' ? null : String(b.payment_method);
      if (method && !['pix', 'cash', 'debit', 'credit', 'transfer', 'boleto', 'other'].includes(method)) return bad(res, { payment_method: 'Forma de pagamento inválida.' });
      const cat = await database('financial_categories').whereNull('organization_id').where({ kind: 'income', name: 'Pacote' }).first('id');
      try {
        const id = await database.transaction(async (trx) => {
          const expires = pkg.validity_days ? new Date(Date.parse(`${today}T12:00:00Z`) + pkg.validity_days * 86_400_000).toISOString().slice(0, 10) : null;
          const [pp] = await trx('patient_packages').insert({
            organization_id: m.org, patient_id: p.id, package_id: pkg.id, name: pkg.name, sessions_total: pkg.sessions,
            price_cents: pkg.price_cents, sold_at: today, expires_at: expires, user_created: m.user,
          }).returning('id');
          const ppId = pp.id ?? pp;
          await trx('financial_transactions').insert(parts.map((x) => ({
            organization_id: m.org, kind: 'income', category_id: cat.id, user_created: m.user, patient_id: p.id, patient_package_id: ppId,
            description: `${pkg.name}${n > 1 ? ` (${x.number}/${n})` : ''} — ${p.full_name}`.slice(0, 200),
            amount_cents: x.amount_cents, due_date: x.due_date, payment_method: method,
            status: x.number === 1 && b.paid_now === true ? 'paid' : 'open', paid_at: x.number === 1 && b.paid_now === true ? today : null,
          })));
          return ppId;
        });
        res.status(201).json({ data: ppOut(await database('patient_packages').where('id', id).first(PP_FIELDS)) });
      } catch (error) {
        finConflict(res, error);
      }
    });

    // Cancela o pacote vendido e as parcelas ainda em aberto (as pagas ficam).
    router.post('/patient-packages/:id/cancel', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!clinical(m)) return forbidClinical(res);
      if (!isUuid(req.params.id)) return pkgNotFound(res);
      const pp = await database('patient_packages').where({ id: req.params.id, organization_id: m.org }).first('id', 'status');
      if (!pp) return pkgNotFound(res);
      try {
        await withActor(m.user, async (trx) => {
          await trx('patient_packages').where('id', pp.id).update({ status: 'cancelled' });
          await trx('financial_transactions').where({ patient_package_id: pp.id, status: 'open' }).update({ status: 'cancelled', paid_at: null });
        });
        res.json({ data: ppOut(await database('patient_packages').where('id', pp.id).first(PP_FIELDS)) });
      } catch (error) {
        finConflict(res, error);
      }
    });

    // Agenda: pacote ativo de cada paciente (para mostrar "sessão x de y" e avisar a última).
    router.get('/packages/agenda', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const ids = String(req.query.patients ?? '').split(',').filter(isUuid).slice(0, 200);
      if (!ids.length) return res.json({ data: {} });
      await database.raw('select expire_patient_packages(?)', [m.org]);
      const rows = await database('patient_packages').where('organization_id', m.org).whereIn('patient_id', ids).where('status', 'active')
        .orderBy([{ column: 'sold_at' }, { column: 'date_created' }]).select('patient_id', 'name', 'sessions_used', 'sessions_total');
      const out = {};
      for (const r of rows) if (!out[r.patient_id]) out[r.patient_id] = { name: r.name, used: r.sessions_used, total: r.sessions_total };
      res.json({ data: out });
    });

    // ── CRM: funil e retornos (RN-056) ──────────────────────────────────────────────────────────
    const leadNotFound = (res) => res.status(404).json({ errors: [{ message: 'Lead não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const LEAD_FIELDS = ['id', 'full_name', 'phone', 'email', 'source', 'stage', 'lost_reason', 'notes', 'patient_id', 'date_created', 'date_updated'];
    const crmConflict = (res, error) => {
      if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
      logger.error({ err: error }, 'rafanutri: falha no CRM');
      return res.status(500).json({ errors: [{ message: 'Não foi possível salvar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    };
    async function withActor(user, fn) {
      return database.transaction(async (trx) => {
        await trx.raw("select set_config('rafanutri.actor', ?, true)", [user]);
        return fn(trx);
      });
    }

    // Quadro: leads (novos, em contato, perdidos nos últimos 90 dias) e pacientes ativos por etapa.
    router.get('/crm/board', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      await database.raw('select crm_mark_inactive(?)', [m.org]);
      const leads = await database('leads').where('organization_id', m.org)
        .where((q) => q.whereIn('stage', ['new', 'contacted']).orWhere((q2) => q2.where('stage', 'lost').where('date_updated', '>', database.raw("now() - interval '90 days'"))))
        .orderBy('date_created', 'desc').limit(500).select(LEAD_FIELDS);
      const patients = await database('patients as p').where({ 'p.organization_id': m.org, 'p.status': 'active' }).whereNotNull('p.crm_stage')
        .select('p.id', 'p.full_name', 'p.phone', 'p.crm_stage', 'p.lead_source',
          database.raw("(select max(a.starts_at) from appointments a where a.patient_id = p.id and a.status = 'completed') as last_visit"),
          database.raw("(select min(a.starts_at) from appointments a where a.patient_id = p.id and a.status in ('scheduled', 'confirmed') and a.starts_at > now()) as next_visit"))
        .orderBy('p.full_name').limit(1000);
      const waiting = await database('patients as p').where({ 'p.organization_id': m.org, 'p.status': 'active' }).whereNull('p.crm_stage').count({ n: '*' }).first();
      res.json({ data: { leads, patients, without_visit: Number(waiting?.n ?? 0) } });
    });

    router.post('/crm/leads', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const r = validateLead(req.body);
      if (r.errors) return bad(res, r.errors);
      try {
        const [row] = await withActor(m.user, (trx) => trx('leads').insert({ ...r.value, organization_id: m.org, user_created: m.user, stage: req.body?.stage === 'contacted' ? 'contacted' : 'new' }).returning(LEAD_FIELDS));
        res.status(201).json({ data: row });
      } catch (error) {
        crmConflict(res, error);
      }
    });

    async function ownLead(m, id) {
      if (!isUuid(id)) return null;
      return database('leads').where({ id, organization_id: m.org }).first();
    }

    router.put('/crm/leads/:id', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const lead = await ownLead(m, req.params.id);
      if (!lead) return leadNotFound(res);
      const r = validateLead(req.body);
      if (r.errors) return bad(res, r.errors);
      try {
        const [row] = await withActor(m.user, (trx) => trx('leads').where('id', lead.id).update(r.value).returning(LEAD_FIELDS));
        res.json({ data: row });
      } catch (error) {
        crmConflict(res, error);
      }
    });

    // Mover no funil: novo, em contato ou perdido (com motivo). Converter tem endpoint próprio.
    router.post('/crm/leads/:id/stage', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const lead = await ownLead(m, req.params.id);
      if (!lead) return leadNotFound(res);
      const stage = ['new', 'contacted', 'lost'].includes(req.body?.stage) ? req.body.stage : null;
      if (!stage) return bad(res, { stage: 'Etapa inválida.' });
      const reason = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
      if (stage === 'lost' && (reason.length < 2 || reason.length > 300)) return bad(res, { note: 'Diga o motivo (2 a 300 caracteres).' });
      try {
        const [row] = await withActor(m.user, (trx) => trx('leads').where('id', lead.id).update({ stage, lost_reason: stage === 'lost' ? reason : null }).returning(LEAD_FIELDS));
        res.json({ data: row });
      } catch (error) {
        crmConflict(res, error);
      }
    });

    // Converter: cria o paciente (ocupa vaga do plano) e liga ao lead.
    router.post('/crm/leads/:id/convert', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const lead = await ownLead(m, req.params.id);
      if (!lead) return leadNotFound(res);
      if (lead.stage === 'converted') return res.json({ data: { patient_id: lead.patient_id } });
      if (lead.full_name.length < 3) return bad(res, { full_name: 'Para virar paciente, o nome precisa de 3 letras ou mais.' });
      try {
        const patientId = await withActor(m.user, async (trx) => {
          const [p] = await trx('patients').insert({ organization_id: m.org, responsible_user_id: m.user, full_name: lead.full_name, phone: lead.phone, email: lead.email, lead_source: lead.source }).returning('id');
          const pid = p.id ?? p;
          await trx('leads').where('id', lead.id).update({ stage: 'converted', patient_id: pid });
          return pid;
        });
        res.status(201).json({ data: { patient_id: patientId } });
      } catch (error) {
        crmConflict(res, error);
      }
    });

    // Retornos: pacientes ativos com consulta concluída, nada marcado, retorno previsto = última + intervalo.
    // ?window=overdue | 7 | 30 (padrão: vencidos + próximos 30 dias)
    router.get('/crm/returns', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const today = todaySP();
      const w = req.query.window;
      const rows = await database.raw(`
        select * from (
          select p.id, p.full_name, p.phone, p.return_interval_days, p.crm_stage,
                 (max(a.starts_at) at time zone 'America/Sao_Paulo')::date::text as last_visit,
                 ((max(a.starts_at) at time zone 'America/Sao_Paulo')::date + p.return_interval_days)::text as due_date
            from patients p join appointments a on a.patient_id = p.id and a.status = 'completed'
           where p.organization_id = ? and p.status = 'active'
             and not exists (select 1 from appointments x where x.patient_id = p.id and x.status in ('scheduled', 'confirmed') and x.starts_at > now())
           group by p.id
        ) r
        where (? = 'overdue' and r.due_date < ?)
           or (? in ('7', '30') and r.due_date >= ? and r.due_date::date <= ?::date + (?)::int)
           or (? not in ('overdue', '7', '30') and r.due_date::date <= ?::date + 30)
        order by r.due_date
        limit 500`, [m.org, w ?? '', today, w ?? '', today, today, w === '7' ? 7 : 30, w ?? '', today]);
      res.json({ data: { today, returns: rows.rows } });
    });

    router.put('/patients/:id/return-interval', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!clinical(m)) return forbidClinical(res);
      const p = await memberPatient(m, req.params.id);
      if (!p) return leadNotFound(res);
      const days = Number(req.body?.days);
      if (!Number.isInteger(days) || days < 7 || days > 365) return bad(res, { days: 'De 7 a 365 dias.' });
      await withActor(m.user, (trx) => trx('patients').where('id', p.id).update({ return_interval_days: days }));
      res.json({ data: { return_interval_days: days } });
    });

    // Indicadores dos últimos `days` dias (padrão 90): leads por origem e conversão em 1ª consulta.
    router.get('/crm/metrics', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const days = [30, 90, 180, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 90;
      const r = await database.raw(`
        select l.source,
               count(*)::int as leads,
               count(*) filter (where l.stage = 'converted')::int as converted,
               count(*) filter (where l.stage = 'lost')::int as lost,
               count(*) filter (where l.stage = 'converted' and exists (
                 select 1 from appointments a where a.patient_id = l.patient_id and a.status = 'completed'))::int as first_visit
          from leads l
         where l.organization_id = ? and l.date_created > now() - make_interval(days => ?)
         group by l.source order by count(*) desc`, [m.org, days]);
      res.json({ data: { days, by_source: r.rows } });
    });

    // ── Indicadores do consultório (RN-064) ─────────────────────────────────────────────────────
    // ?month=aaaa-mm (padrão: mês atual) &nutritionist=<membro clínico> (só filtra se for do consultório).
    router.get('/dashboard', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month ?? '') ? `${req.query.month}-15` : null;
      const nutritionists = await database('organization_members as om').join('directus_users as u', 'u.id', 'om.user_id')
        .where('om.organization_id', m.org).whereIn('om.role', ['owner', 'nutritionist'])
        .select('u.id', database.raw("trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) as name"), 'u.email');
      const nutri = isUuid(req.query.nutritionist) && nutritionists.some((n) => n.id === req.query.nutritionist) ? req.query.nutritionist : null;
      const r = await database.raw('select dashboard_indicators(?, ?::date, ?::uuid) as j', [m.org, month, nutri]);
      res.json({
        data: {
          ...r.rows[0].j,
          nutritionist: nutri,
          nutritionists: nutritionists.length > 1 ? nutritionists.map((n) => ({ id: n.id, name: n.name || n.email })) : [],
        },
      });
    });

    // ── Página pública e agendamento online (RN-068) ────────────────────────────────────────────
    const pubNotFound = (res) => res.status(404).json({ errors: [{ message: 'Página não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
    const PROFILE_FIELDS = ['enabled', 'headline', 'bio', 'specialties', 'address', 'city', 'in_person', 'online', 'price_first_cents', 'price_return_cents',
      'booking_enabled', 'require_approval', 'nutritionist_id', 'weekdays', database.raw("to_char(day_start, 'HH24:MI') as day_start"), database.raw("to_char(day_end, 'HH24:MI') as day_end"),
      'slot_minutes', 'min_notice_hours', 'max_days_ahead'];
    const profileOut = (p) => p && ({ ...p, price_first_cents: p.price_first_cents == null ? null : Number(p.price_first_cents), price_return_cents: p.price_return_cents == null ? null : Number(p.price_return_cents) });
    async function publicPractice(slug) {
      if (typeof slug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
      const org = await database('organizations').where('slug', slug).first('id', 'name', 'brand_color', 'logo');
      if (!org) return null;
      const profile = profileOut(await database('public_profiles').where({ organization_id: org.id, enabled: true }).first(PROFILE_FIELDS));
      if (!profile) return null;
      const nutri = profile.nutritionist_id ?? (await database('organization_members').where({ organization_id: org.id, role: 'owner' }).first('user_id'))?.user_id;
      return { org, profile: { ...profile, nutritionist_id: nutri } };
    }
    async function busyIntervals(orgId, nutri, from, to) {
      const a = await database('appointments').where({ organization_id: orgId, nutritionist_id: nutri }).whereIn('status', ['scheduled', 'confirmed', 'completed'])
        .where('starts_at', '<', to).where('ends_at', '>', from).select('starts_at', 'ends_at');
      const r = await database('booking_requests').where({ organization_id: orgId, nutritionist_id: nutri, status: 'pending' })
        .where('starts_at', '<', to).where('ends_at', '>', from).select('starts_at', 'ends_at');
      return [...a, ...r].map((x) => [new Date(x.starts_at).getTime(), new Date(x.ends_at).getTime()]);
    }

    router.get('/public/practices/:slug', async (req, res) => {
      const p = await publicPractice(req.params.slug);
      if (!p) return pubNotFound(res);
      const u = await database('directus_users').where('id', p.profile.nutritionist_id).first('first_name', 'last_name');
      const prof = await database('professional_profiles').where('user_id', p.profile.nutritionist_id).first('crn', 'crn_region');
      const { nutritionist_id: _n, require_approval, ...rest } = p.profile;
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json({
        data: {
          name: p.org.name, brand_color: p.org.brand_color, has_logo: Boolean(p.org.logo), require_approval,
          professional: { name: [u?.first_name, u?.last_name].filter(Boolean).join(' ') || null, crn: prof?.crn ? `${prof.crn_region ?? 'CRN'} ${prof.crn}` : null },
          ...rest,
        },
      });
    });

    router.get('/public/practices/:slug/logo', async (req, res) => {
      const p = await publicPractice(req.params.slug);
      if (!p?.org.logo) return pubNotFound(res);
      try {
        const assets = new services.AssetsService({ schema: await getSchema(), accountability: null });
        const { stream, file } = await assets.getAsset(p.org.logo);
        res.setHeader('Content-Type', file.type ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        stream.pipe(res);
      } catch {
        pubNotFound(res);
      }
    });

    // Horários livres (só horários, nada sobre as consultas). ?from=aaaa-mm-dd&days=1..14
    router.get('/public/practices/:slug/slots', async (req, res) => {
      const p = await publicPractice(req.params.slug);
      if (!p || !p.profile.booking_enabled) return pubNotFound(res);
      const now = new Date();
      const from = isIsoDate(req.query.from) && req.query.from >= localDateOf(now) ? req.query.from : localDateOf(now);
      const days = Math.min(14, Math.max(1, Number(req.query.days) || 7));
      const start = new Date(`${from}T00:00:00-03:00`);
      const end = new Date(start.getTime() + (days + 1) * 86_400_000);
      const busy = await busyIntervals(p.org.id, p.profile.nutritionist_id, start, end);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: { from, days: publicSlots(p.profile, busy, from, days, now), slot_minutes: p.profile.slot_minutes } });
    });

    /** Confirma o pedido: paciente (o mesmo e-mail no consultório ou novo, dentro do limite) + consulta. */
    async function confirmBooking(reqRow, actor) {
      return database.transaction(async (trx) => {
        await trx.raw("select set_config('rafanutri.actor', ?, true)", [actor]);
        let patient = await trx('patients').where({ organization_id: reqRow.organization_id }).whereRaw('lower(email) = ?', [reqRow.email]).whereNot('status', 'archived')
          .orderByRaw("status = 'active' desc").first('id', 'status');
        if (!patient) {
          const [p] = await trx('patients').insert({ organization_id: reqRow.organization_id, responsible_user_id: reqRow.nutritionist_id, full_name: reqRow.full_name, email: reqRow.email, phone: reqRow.phone, lead_source: 'site' }).returning('id');
          patient = { id: p.id ?? p };
        }
        const [a] = await trx('appointments').insert({
          organization_id: reqRow.organization_id, patient_id: patient.id, nutritionist_id: reqRow.nutritionist_id, starts_at: reqRow.starts_at, ends_at: reqRow.ends_at,
          type: 'first', mode: reqRow.mode, status: 'scheduled', origin: 'online_booking', notes: reqRow.message ? `Agendamento online: ${reqRow.message}`.slice(0, 500) : 'Agendamento online', user_created: reqRow.nutritionist_id,
        }).returning('id');
        await trx('booking_requests').where('id', reqRow.id).update({ status: 'confirmed', patient_id: patient.id, appointment_id: a.id ?? a, decided_by: actor, decided_at: trx.fn.now() });
        return { patient_id: patient.id, appointment_id: a.id ?? a };
      });
    }

    router.post('/public/practices/:slug/book', async (req, res) => {
      const p = await publicPractice(req.params.slug);
      if (!p || !p.profile.booking_enabled) return pubNotFound(res);
      const v = validateBooking(req.body, p.profile);
      if (v.spam) return res.status(201).json({ data: { status: 'pending' } }); // campo-isca: finge sucesso
      if (v.errors) return bad(res, v.errors);
      const now = new Date();
      const s = new Date(v.value.starts_at);
      const e = new Date(s.getTime() + p.profile.slot_minutes * 60_000);
      const busy = await busyIntervals(p.org.id, p.profile.nutritionist_id, new Date(s.getTime() - 86_400_000), new Date(e.getTime() + 86_400_000));
      if (!isOfferedSlot(p.profile, busy, v.value.starts_at, now)) return conflict(res, 'Esse horário não está mais disponível. Escolha outro.');
      const today = await database('booking_requests').where('organization_id', p.org.id).where('created_at', '>', database.raw("now() - interval '1 day'")).count({ n: '*' }).first();
      if (Number(today?.n ?? 0) >= 30) return res.status(429).json({ errors: [{ message: 'Muitos pedidos hoje. Tente amanhã ou fale direto com o consultório.', extensions: { code: 'TOO_MANY' } }] });
      const mine = await database('booking_requests').where({ organization_id: p.org.id, status: 'pending' }).where((q) => q.where('email', v.value.email).orWhere('phone', v.value.phone)).count({ n: '*' }).first();
      if (Number(mine?.n ?? 0) >= 2) return conflict(res, 'Você já tem pedidos aguardando confirmação. O consultório vai entrar em contato.');
      let row;
      try {
        [row] = await database('booking_requests').insert({ organization_id: p.org.id, nutritionist_id: p.profile.nutritionist_id, ...v.value, ends_at: e.toISOString() }).returning('*');
      } catch (error) {
        if (error?.code === 'P0001') return conflict(res, 'Esse horário não está mais disponível. Escolha outro.');
        logger.error({ err: error }, 'rafanutri: falha no agendamento online');
        return res.status(500).json({ errors: [{ message: 'Não foi possível agendar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
      if (!p.profile.require_approval) {
        try {
          await confirmBooking(row, p.profile.nutritionist_id);
          return res.status(201).json({ data: { status: 'confirmed', starts_at: row.starts_at } });
        } catch (error) {
          logger.warn({ err: error?.message }, 'rafanutri: agendamento online ficou pendente');
        }
      }
      res.status(201).json({ data: { status: 'pending', starts_at: row.starts_at } });
    });

    // Configuração da página (owner)
    router.get('/practices/:id/public-profile', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await ownedOrg(user, req.params.id);
      if (!org) return orgNotFound(res);
      const o = await database('organizations').where('id', org.id).first('slug');
      const profile = profileOut(await database('public_profiles').where('organization_id', org.id).first(PROFILE_FIELDS));
      const nutritionists = await database('organization_members as om').join('directus_users as u', 'u.id', 'om.user_id')
        .where('om.organization_id', org.id).whereIn('om.role', ['owner', 'nutritionist'])
        .select('u.id', database.raw("trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) as name"), 'u.email');
      res.json({ data: { slug: o.slug, profile, nutritionists: nutritionists.map((n) => ({ id: n.id, name: n.name || n.email })) } });
    });

    router.put('/practices/:id/public-profile', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await ownedOrg(user, req.params.id);
      if (!org) return orgNotFound(res);
      const b = req.body ?? {};
      const errors = {};
      const text = (v, max, key, label) => {
        if (v == null || String(v).trim() === '') return null;
        const t = String(v).trim();
        if (t.length > max) errors[key] = `${label} de até ${max} caracteres.`;
        return t;
      };
      const time = (v, key) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : ((errors[key] = 'Horário inválido.'), null));
      const cents = (v, key) => (v == null || v === '' ? null : Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : ((errors[key] = 'Valor inválido.'), null));
      const specialties = Array.isArray(b.specialties) ? [...new Set(b.specialties.map((s) => String(s).trim()).filter(Boolean))] : [];
      if (specialties.length > 10 || specialties.some((s) => s.length > 40)) errors.specialties = 'Até 10 especialidades de até 40 caracteres.';
      const weekdays = Array.isArray(b.weekdays) ? [...new Set(b.weekdays.map(Number))].filter((d) => d >= 1 && d <= 7).sort() : [];
      if (!weekdays.length) errors.weekdays = 'Escolha ao menos um dia.';
      const value = {
        enabled: b.enabled === true, booking_enabled: b.booking_enabled === true, require_approval: b.require_approval !== false,
        headline: text(b.headline, 120, 'headline', 'Chamada'), bio: text(b.bio, 1500, 'bio', 'Apresentação'), address: text(b.address, 200, 'address', 'Endereço'), city: text(b.city, 80, 'city', 'Cidade'),
        specialties: JSON.stringify(specialties), in_person: b.in_person !== false, online: b.online !== false,
        price_first_cents: cents(b.price_first_cents, 'price_first_cents'), price_return_cents: cents(b.price_return_cents, 'price_return_cents'),
        nutritionist_id: isUuid(b.nutritionist_id) ? b.nutritionist_id : null, weekdays,
        day_start: time(b.day_start, 'day_start'), day_end: time(b.day_end, 'day_end'),
        slot_minutes: [30, 45, 60, 90].includes(Number(b.slot_minutes)) ? Number(b.slot_minutes) : 60,
        min_notice_hours: Math.min(168, Math.max(0, Number(b.min_notice_hours) || 0)), max_days_ahead: Math.min(90, Math.max(1, Number(b.max_days_ahead) || 30)),
      };
      if (!value.in_person && !value.online) errors.in_person = 'Escolha ao menos uma modalidade.';
      if (value.day_start && value.day_end && value.day_end <= value.day_start) errors.day_end = 'O fim do expediente precisa ser depois do início.';
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        await database('public_profiles').insert({ organization_id: org.id, ...value }).onConflict('organization_id').merge();
        res.json({ data: profileOut(await database('public_profiles').where('organization_id', org.id).first(PROFILE_FIELDS)) });
      } catch (error) {
        crmConflict(res, error);
      }
    });

    // Pedidos de agendamento (agenda do consultório)
    router.get('/booking-requests', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const rows = await database('booking_requests').where({ organization_id: m.org, status: 'pending' }).orderBy('starts_at')
        .select('id', 'full_name', 'email', 'phone', 'mode', 'starts_at', 'ends_at', 'message', 'created_at');
      res.json({ data: rows });
    });

    async function decide(req, res, confirm) {
      const m = await finMember(req, res);
      if (!m) return;
      if (!clinical(m)) return forbidClinical(res);
      if (!isUuid(req.params.id)) return pubNotFound(res);
      const row = await database('booking_requests').where({ id: req.params.id, organization_id: m.org, status: 'pending' }).first();
      if (!row) return res.status(404).json({ errors: [{ message: 'Pedido não encontrado ou já decidido.', extensions: { code: 'NOT_FOUND' } }] });
      try {
        if (confirm) return res.json({ data: await confirmBooking(row, m.user) });
        await database('booking_requests').where('id', row.id).update({ status: 'declined', decided_by: m.user, decided_at: database.fn.now() });
        res.json({ data: { ok: true } });
      } catch (error) {
        if (error?.code === 'P0001' && /limite|permite no máximo/i.test(error.message)) return conflict(res, 'Limite de pacientes ativos do plano: arquive um paciente para confirmar.');
        crmConflict(res, error);
      }
    }
    router.post('/booking-requests/:id/confirm', (req, res) => decide(req, res, true));
    router.post('/booking-requests/:id/decline', (req, res) => decide(req, res, false));

    // ── Auditoria (RN-009) ──────────────────────────────────────────────────────────────────────
    // Escritas: gatilho audit_trigger (migração 0030). Leituras e exportações: logAccess aqui.
    // Escritas pela API de itens chegam sem autor e ganham o do directus_activity (mesma coleção, item,
    // ação e minuto). Só o owner lê; o log tem só nomes de campos, nunca valores.
    function logAccess(org, user, entity, entityId, patientId = null, action = 'read') {
      database.raw('select log_access(?, ?, ?, ?, ?, ?)', [org, user, entity, String(entityId), patientId, action])
        .catch((err) => logger.error({ err }, 'rafanutri: falha ao registrar acesso'));
    }
    const AUDIT_ENTITIES = new Set(['patients', 'clinical_notes', 'anamneses', 'anthropometric_assessments', 'meal_plans', 'clinical_documents',
      'appointments', 'financial_transactions', 'receipts', 'organization_members', 'patient_app_invites', 'patient_recommendations', 'patient_packages']);
    const AUDIT_ACTIONS = new Set(['insert', 'update', 'delete', 'read', 'export']);

    router.get('/audit', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (m.role !== 'owner') return res.status(403).json({ errors: [{ message: 'Só o responsável pelo consultório vê a auditoria.', extensions: { code: 'FORBIDDEN' } }] });
      const q = req.query ?? {};
      const errors = {};
      if (q.from && !isIsoDate(q.from)) errors.from = 'Data inválida.';
      if (q.to && !isIsoDate(q.to)) errors.to = 'Data inválida.';
      if (q.actor && !isUuid(q.actor)) errors.actor = 'Usuário inválido.';
      if (q.patient && !isUuid(q.patient)) errors.patient = 'Paciente inválido.';
      if (q.entity && !AUDIT_ENTITIES.has(q.entity)) errors.entity = 'Tipo inválido.';
      if (q.action && !AUDIT_ACTIONS.has(q.action)) errors.action = 'Ação inválida.';
      if (q.before && !/^\d{1,18}$/.test(String(q.before))) errors.before = 'Cursor inválido.';
      if (Object.keys(errors).length) return bad(res, errors);
      const where = ['l.organization_id = ?'];
      const args = [m.org];
      if (q.from) { where.push("l.occurred_at >= (?::date)::timestamp at time zone 'America/Sao_Paulo'"); args.push(q.from); }
      if (q.to) { where.push("l.occurred_at < (?::date + 1)::timestamp at time zone 'America/Sao_Paulo'"); args.push(q.to); }
      if (q.patient) { where.push('l.patient_id = ?'); args.push(q.patient); }
      if (q.entity) { where.push('l.entity = ?'); args.push(q.entity); }
      if (q.action) { where.push('l.action = ?'); args.push(q.action); }
      if (q.before) { where.push('l.id < ?'); args.push(String(q.before)); }
      const LIMIT = 100;
      const { rows } = await database.raw(`
        select x.id::text as id, x.action, x.entity, x.entity_id, x.changed_fields, x.occurred_at, x.patient_id, x.actor_id,
               p.full_name as patient_name, u.first_name, u.last_name, u.email
          from (
            select l.id, l.action, l.entity, l.entity_id, l.changed_fields, l.occurred_at, l.patient_id, coalesce(l.actor_id, act."user") as actor_id
              from audit_logs l
              left join lateral (
                select a."user" from directus_activity a
                 where l.actor_id is null and l.action in ('insert', 'update', 'delete')
                   and a.collection = l.entity and a.item = l.entity_id
                   and a.action = case l.action when 'insert' then 'create' else l.action end
                   and a."timestamp" between l.occurred_at - interval '1 minute' and l.occurred_at + interval '1 minute'
                 order by abs(extract(epoch from a."timestamp" - l.occurred_at)) limit 1
              ) act on true
             where ${where.join(' and ')}
          ) x
          left join patients p on p.id = x.patient_id and p.organization_id = ?
          left join directus_users u on u.id = x.actor_id
         where (?::uuid is null or x.actor_id = ?::uuid)
         order by x.id desc
         limit ${LIMIT + 1}`, [...args, m.org, q.actor || null, q.actor || null]);
      const more = rows.length > LIMIT;
      const data = rows.slice(0, LIMIT).map((r) => ({
        id: r.id, action: r.action, entity: r.entity, entity_id: r.entity_id, changed_fields: r.changed_fields ?? [],
        occurred_at: r.occurred_at,
        patient: r.patient_id ? { id: r.patient_id, name: r.patient_name ?? null } : null,
        actor: r.actor_id ? { id: r.actor_id, name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || null } : null,
      }));
      const members = (await database('organization_members as om').join('directus_users as u', 'u.id', 'om.user_id')
          .where('om.organization_id', m.org).select('u.id', 'u.first_name', 'u.last_name', 'u.email', 'om.role'))
        .map((u) => ({ id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email, role: u.role }));
      res.json({ data, next: more ? data[data.length - 1].id : null, members });
    });

    // ── Documentos clínicos com a marca (RN-215) ───────────────────────────────────────────────
    const docNotFound = (res) => res.status(404).json({ errors: [{ message: 'Documento não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const DOC_FIELDS = ['id', 'kind', 'title', 'body', 'exams', 'document_date', 'status', 'published_at', 'date_created', 'date_updated'];
    const TPL_FIELDS = ['id', 'kind', 'title', 'body', 'exams', 'date_created'];
    const docDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === 'string' ? d.slice(0, 10) : d);
    const docOut = (d) => (d ? { ...d, document_date: docDate(d.document_date) } : d);
    const docConflict = (res, error) => {
      if (error?.code === 'P0001' || error?.code === '23514') return conflict(res, error?.code === 'P0001' ? error.message.split('\n')[0].replace(/^.* - /, '') : 'Documento incompleto: revise o conteúdo.');
      logger.error({ err: error }, 'rafanutri: falha em documento');
      return res.status(500).json({ errors: [{ message: 'Não foi possível salvar o documento agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    };
    /** Documento + cabeçalho do PDF (consultório, autor, paciente). */
    async function documentPayload(doc) {
      const patient = await database('patients').where('id', doc.patient_id).first('id', 'organization_id', 'full_name', 'objective', 'responsible_user_id');
      const info = await planDocumentInfo(patient, { user_created: doc.user_created });
      return { document: docOut(Object.fromEntries(DOC_FIELDS.map((k) => [k, doc[k]]))), header: { ...info, organization_id: patient.organization_id } };
    }

    router.get('/patients/:id/documents', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return docNotFound(res);
      const rows = await database('clinical_documents').where('patient_id', p.id).orderBy([{ column: 'document_date', order: 'desc' }, { column: 'date_created', order: 'desc' }]).select(DOC_FIELDS);
      res.json({ data: rows.map(docOut) });
    });

    router.post('/patients/:id/documents', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return docNotFound(res);
      const r = validateDocumentInput(req.body);
      if (r.errors) return bad(res, r.errors);
      try {
        const [row] = await database('clinical_documents')
          .insert({ ...r.value, exams: JSON.stringify(r.value.exams), organization_id: p.organization_id, patient_id: p.id, user_created: user, status: req.body?.publish === true ? 'published' : 'draft' })
          .returning(DOC_FIELDS);
        res.status(201).json({ data: docOut(row) });
      } catch (error) {
        docConflict(res, error);
      }
    });

    async function ownDoc(user, id) {
      const org = await clinicalOrg(user);
      if (!org || !isUuid(id)) return null;
      return database('clinical_documents').where({ id, organization_id: org }).first();
    }

    router.get('/documents/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const doc = await ownDoc(user, req.params.id);
      if (!doc) return docNotFound(res);
      logAccess(doc.organization_id, user, 'clinical_documents', doc.id, doc.patient_id, req.query?.pdf === '1' ? 'export' : 'read');
      res.json({ data: await documentPayload(doc) });
    });

    // Edita conteúdo, data e status (draft/published). O tipo não muda.
    router.put('/documents/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const doc = await ownDoc(user, req.params.id);
      if (!doc) return docNotFound(res);
      const r = validateDocumentInput({ ...req.body, kind: doc.kind });
      if (r.errors) return bad(res, r.errors);
      const status = req.body?.status === 'published' ? 'published' : 'draft';
      try {
        const [row] = await withActor(user, (trx) => trx('clinical_documents').where('id', doc.id)
          .update({ title: r.value.title, body: r.value.body, exams: JSON.stringify(r.value.exams), document_date: r.value.document_date, status })
          .returning(DOC_FIELDS));
        res.json({ data: docOut(row) });
      } catch (error) {
        docConflict(res, error);
      }
    });

    router.delete('/documents/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const doc = await ownDoc(user, req.params.id);
      if (!doc) return docNotFound(res);
      await withActor(user, (trx) => trx('clinical_documents').where('id', doc.id).del());
      res.json({ data: { ok: true } });
    });

    // Modelos do consultório
    router.get('/document-templates', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      if (!org) return res.json({ data: [] });
      res.json({ data: await database('clinical_document_templates').where('organization_id', org).orderBy(['kind', 'title']).select(TPL_FIELDS) });
    });

    router.post('/document-templates', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      if (!org) return docNotFound(res);
      const r = validateDocumentInput(req.body, { withDate: false });
      if (r.errors) return bad(res, r.errors);
      const count = await database('clinical_document_templates').where('organization_id', org).count({ n: '*' }).first();
      if (Number(count?.n ?? 0) >= 100) return conflict(res, 'Limite de 100 modelos por consultório.');
      try {
        const [row] = await database('clinical_document_templates').insert({ ...r.value, exams: JSON.stringify(r.value.exams), organization_id: org, user_created: user }).returning(TPL_FIELDS);
        res.status(201).json({ data: row });
      } catch (error) {
        docConflict(res, error);
      }
    });

    router.delete('/document-templates/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      if (!org || !isUuid(req.params.id)) return docNotFound(res);
      const n = await database('clinical_document_templates').where({ id: req.params.id, organization_id: org }).del();
      if (!n) return docNotFound(res);
      res.json({ data: { ok: true } });
    });

    // Área do paciente: só publicados do registro ativo
    router.get('/me/patient/documents', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const p = await myPatientRecord(user, isUuid(req.query.c) ? req.query.c : null);
      if (!p) return res.json({ data: { patient_id: null, documents: [] } });
      const rows = await database('clinical_documents').where({ patient_id: p.id, organization_id: p.organization_id, status: 'published' })
        .orderBy([{ column: 'document_date', order: 'desc' }, { column: 'published_at', order: 'desc' }]).select('id', 'kind', 'title', 'document_date', 'published_at');
      res.json({ data: { patient_id: p.id, documents: rows.map(docOut) } });
    });

    router.get('/me/patient/documents/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      if (!isUuid(req.params.id)) return docNotFound(res);
      const doc = await database('clinical_documents as d').join('patients as p', function () { this.on('p.id', 'd.patient_id').andOn('p.organization_id', 'd.organization_id'); })
        .where({ 'd.id': req.params.id, 'd.status': 'published', 'p.app_user_id': user, 'p.status': 'active' })
        .first('d.*');
      if (!doc) return docNotFound(res);
      res.json({ data: await documentPayload(doc) });
    });

    // ── Orientações e textos reutilizáveis (RN-045) ─────────────────────────────────────────────
    // Biblioteca da plataforma (sem consultório) + textos do consultório do usuário.
    function snippetInput(body) {
      const errors = {};
      const category = typeof body?.category === 'string' ? body.category.trim() : '';
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const text = typeof body?.body === 'string' ? body.body.trim() : '';
      if (category.length < 2 || category.length > 40) errors.category = 'Categoria de 2 a 40 caracteres.';
      if (title.length < 2 || title.length > 80) errors.title = 'Título de 2 a 80 caracteres.';
      if (text.length < 2 || text.length > 2000) errors.body = 'Texto de 2 a 2.000 caracteres.';
      return { errors, value: { category, title, body: text } };
    }

    router.get('/snippets', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      const rows = await database('text_snippets')
        .where((q) => {
          q.whereNull('organization_id');
          if (org) q.orWhere('organization_id', org);
        })
        .orderBy([{ column: 'category' }, { column: 'title' }])
        .select('id', 'organization_id', 'category', 'title', 'body');
      res.json({ data: rows.map((r) => ({ ...r, own: r.organization_id !== null })) });
    });

    async function saveSnippet(req, res, id) {
      const user = requireUser(req, res);
      if (!user) return;
      const { errors, value } = snippetInput(req.body);
      if (Object.keys(errors).length) return bad(res, errors);
      const org = await clinicalOrg(user);
      if (!org) return res.status(403).json({ errors: [{ message: 'Você não tem consultório.', extensions: { code: 'FORBIDDEN' } }] });
      if (id) {
        const n = await database('text_snippets').where({ id, organization_id: org }).update(value);
        if (!n) return res.status(404).json({ errors: [{ message: 'Texto não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
        return res.json({ data: { id } });
      }
      const [row] = await database('text_snippets').insert({ ...value, organization_id: org, user_created: user }).returning('id');
      res.status(201).json({ data: { id: row.id ?? row } });
    }
    const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    router.post('/snippets', (req, res) => saveSnippet(req, res, null));
    router.put('/snippets/:id', (req, res) => (isUuid(req.params.id) ? saveSnippet(req, res, req.params.id) : res.status(404).json({ errors: [{ message: 'Texto não encontrado.', extensions: { code: 'NOT_FOUND' } }] })));
    router.delete('/snippets/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      const n = org && isUuid(req.params.id) ? await database('text_snippets').where({ id: req.params.id, organization_id: org }).del() : 0;
      if (!n) return res.status(404).json({ errors: [{ message: 'Texto não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      res.status(204).end();
    });

    // ── Plano do consultório e lista de interesse no plano pago (RN-200, RN-202) ────────────
    async function memberOrg(userId) {
      return database('organization_members as m')
        .join('organizations as o', 'o.id', 'm.organization_id')
        .where('m.user_id', userId)
        .orderBy('o.created_at')
        .first('o.id', 'o.plan', 'm.role');
    }
    const PAID_PLANS = new Set(['essential', 'professional', 'clinic']);

    router.get('/plan', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await memberOrg(user);
      if (!org) return res.status(404).json({ errors: [{ message: 'Você não tem consultório.', extensions: { code: 'NOT_FOUND' } }] });
      const [plan, counts, members, waitlist] = await Promise.all([
        database('plans').where({ code: org.plan }).first('code', 'name', 'max_active_patients', 'max_members'),
        database('patients').where({ organization_id: org.id }).select('status').count('* as n').groupBy('status'),
        database('organization_members').where({ organization_id: org.id }).count('* as n').first(),
        database('plan_waitlist').where({ organization_id: org.id }).first('desired_plan', 'date_created'),
      ]);
      const byStatus = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
      res.json({
        data: {
          plan,
          role: org.role,
          usage: { active_patients: byStatus.active ?? 0, archived_patients: byStatus.archived ?? 0, members: Number(members?.n ?? 0) },
          waitlist: waitlist ?? null,
        },
      });
    });

    router.post('/plan/waitlist', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const desired = req.body?.desired_plan ?? null;
      const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : null;
      if (desired !== null && !PAID_PLANS.has(desired)) return bad(res, { desired_plan: 'Plano inválido.' });
      const org = await memberOrg(user);
      if (!org || org.role !== 'owner') return res.status(403).json({ errors: [{ message: 'Só o responsável pelo consultório pode registrar o interesse.', extensions: { code: 'FORBIDDEN' } }] });
      try {
        const active = await database('patients').where({ organization_id: org.id, status: 'active' }).count('* as n').first();
        await database('plan_waitlist')
          .insert({ organization_id: org.id, user_id: user, desired_plan: desired, note, active_patients: Number(active?.n ?? 0) })
          .onConflict('organization_id')
          .merge(['user_id', 'desired_plan', 'note', 'active_patients']);
        res.status(201).json({ data: { ok: true } });
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao registrar interesse no plano pago');
        res.status(500).json({ errors: [{ message: 'Não foi possível registrar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

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
        const unit = req.path.match(/^\/uan\/units\/([0-9a-f-]{36})/i);
        const org = req.path.match(/^\/uan\/organizations\/([0-9a-f-]{36})/i);
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
    const numOrNull = (v) => (v === null || v === undefined ? null : Number(v));
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
      const rows = await q.select(...ING_FIELDS.map((f) => `i.${f}`), 'f.name as food_name',
        database.raw('(select p.price_cents from ingredient_price_at(i.id) p) as price_cents'),
        database.raw('(select p.valid_from from ingredient_price_at(i.id) p) as price_valid_from'));
      const org = await database('organizations').where('id', acc.orgId).first('id', 'name');
      res.json({ data: { organization: org, can_manage: acc.canManage, items: rows.map((r) => ({ ...ingOut(r), price_valid_from: dateOut(r.price_valid_from) })) } });
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
      if (typeof b.device_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.device_id)) return bad(res, { device_id: 'Aparelho inválido.' });
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

    // ── Feedback do programa beta (RN-047) ──────────────────────────────────────────────────
    // Texto + tipo + caminho da página (sem query string). Lido só pelo admin da plataforma no Directus.
    const FEEDBACK_KINDS = new Set(['bug', 'idea', 'praise', 'other']);
    router.post('/feedback', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const b = req.body ?? {};
      const message = typeof b.message === 'string' ? b.message.trim() : '';
      const kind = b.kind ?? 'other';
      const errors = {};
      if (message.length < 3 || message.length > 2000) errors.message = 'Escreva de 3 a 2.000 caracteres.';
      if (!FEEDBACK_KINDS.has(kind)) errors.kind = 'Tipo inválido.';
      let page = null;
      if (typeof b.page === 'string' && b.page) {
        const path = b.page.split(/[?#]/)[0].slice(0, 200);
        if (path.startsWith('/') && !path.startsWith('//')) page = path;
      }
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        const recent = await database('product_feedback').where('user_id', user).where('date_created', '>', database.raw("now() - interval '1 day'")).count('* as n').first();
        if (Number(recent?.n ?? 0) >= 20) return res.status(429).json({ errors: [{ message: 'Muitos envios hoje. Tente amanhã.', extensions: { code: 'TOO_MANY_REQUESTS' } }] });
        const org = await memberOrg(user);
        await database('product_feedback').insert({ organization_id: org?.id ?? null, user_id: user, kind, message, page });
        res.status(201).json({ data: { ok: true } });
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao gravar feedback');
        res.status(500).json({ errors: [{ message: 'Não foi possível enviar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

    // ── Evoluções do prontuário (RN-023) ────────────────────────────────────────────────────
    // Rascunho → assinar (imutável) → retificar (nova versão ligada à original). As regras ficam no
    // gatilho clinical_notes_guard; aqui só se resolve o consultório e o autor pelo usuário logado.
    const noteNotFound = (res) => res.status(404).json({ errors: [{ message: 'Evolução não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
    const conflict = (res, message) => res.status(409).json({ errors: [{ message, extensions: { code: 'CONFLICT' } }] });
    const NOTE_FIELDS = ['id', 'patient_id', 'appointment_id', 'body', 'supersedes_id', 'user_created', 'date_created', 'date_updated', 'signed_at', 'signer_name', 'signer_crn'];
    function noteBody(body) {
      const text = typeof body?.body === 'string' ? body.body.trim() : '';
      if (text.length < 1 || text.length > 20000) return { error: { body: 'Escreva a evolução (até 20.000 caracteres).' } };
      const appointmentId = body?.appointment_id ?? null;
      if (appointmentId !== null && !isUuid(appointmentId)) return { error: { appointment_id: 'Consulta inválida.' } };
      return { text, appointmentId };
    }
    async function runNote(res, fn, what) {
      try {
        return await fn();
      } catch (error) {
        if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
        if (error?.code === '23505') return conflict(res, 'Esta versão já foi retificada; retifique a versão mais recente.');
        logger.error({ err: error }, `rafanutri: falha ao ${what} evolução`);
        return res.status(500).json({ errors: [{ message: 'Não foi possível salvar a evolução agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    }
    async function ownNote(user, id) {
      const org = await clinicalOrg(user);
      if (!org || !isUuid(id)) return null;
      return database('clinical_notes').where({ id, organization_id: org }).first(NOTE_FIELDS);
    }

    router.get('/patients/:id/notes', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await clinicalOrg(user);
      if (!org || !isUuid(req.params.id)) return noteNotFound(res);
      const patient = await database('patients').where({ id: req.params.id, organization_id: org }).first('id');
      if (!patient) return noteNotFound(res);
      const rows = await database('clinical_notes').where({ patient_id: patient.id, organization_id: org }).orderBy('date_created', 'desc').select(NOTE_FIELDS);
      logAccess(org, user, 'clinical_notes', patient.id, patient.id);
      res.json({ data: rows.map((r) => ({ ...r, own: r.user_created === user })) });
    });

    router.post('/patients/:id/notes', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const { error, text, appointmentId } = noteBody(req.body);
      if (error) return bad(res, error);
      const supersedes = req.body?.supersedes_id ?? null;
      if (supersedes !== null && !isUuid(supersedes)) return bad(res, { supersedes_id: 'Versão inválida.' });
      const org = await clinicalOrg(user);
      if (!org || !isUuid(req.params.id)) return noteNotFound(res);
      const patient = await database('patients').where({ id: req.params.id, organization_id: org }).first('id');
      if (!patient) return noteNotFound(res);
      await runNote(res, async () => {
        const [row] = await database('clinical_notes')
          .insert({ organization_id: org, patient_id: patient.id, appointment_id: appointmentId, supersedes_id: supersedes, body: text, user_created: user })
          .returning('id');
        res.status(201).json({ data: { id: row.id ?? row } });
      }, 'criar');
    });

    router.put('/notes/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const { error, text, appointmentId } = noteBody(req.body);
      if (error) return bad(res, error);
      const note = await ownNote(user, req.params.id);
      if (!note) return noteNotFound(res);
      if (note.user_created !== user) return conflict(res, 'Só quem escreveu a evolução pode alterá-la.');
      await runNote(res, async () => {
        await withActor(user, (trx) => trx('clinical_notes').where({ id: note.id }).update({ body: text, appointment_id: appointmentId }));
        res.json({ data: { id: note.id } });
      }, 'alterar');
    });

    router.post('/notes/:id/sign', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const note = await ownNote(user, req.params.id);
      if (!note) return noteNotFound(res);
      if (note.user_created !== user) return conflict(res, 'Só quem escreveu a evolução pode assiná-la.');
      await runNote(res, async () => {
        const [row] = await withActor(user, (trx) => trx('clinical_notes').where({ id: note.id }).update({ signed_at: trx.fn.now() }).returning(['signed_at', 'signer_name', 'signer_crn']));
        res.json({ data: { id: note.id, ...row } });
      }, 'assinar');
    });

    router.delete('/notes/:id', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const note = await ownNote(user, req.params.id);
      if (!note) return noteNotFound(res);
      if (note.user_created !== user) return conflict(res, 'Só quem escreveu a evolução pode apagá-la.');
      await runNote(res, async () => {
        await withActor(user, (trx) => trx('clinical_notes').where({ id: note.id }).del());
        res.status(204).end();
      }, 'apagar');
    });

    // ── Área do paciente: convite, vínculo e dados (RN-203, RN-204) ─────────────────────────
    // O vínculo patients.app_user_id só muda numa transação com rafanutri.patient_link = on (gatilho 0018).
    const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
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
        if (req.body?.send === true && notifier) {
          const site = (process.env.RAFANUTRI_SITE_URL || 'https://rafanutri.brunokobi.tech').replace(/\/$/, '');
          sent = await notifier.sendInvite({ orgId: p.organization_id, patientId: p.id, email, link: `${site}/p/convite/${token}`, inviteId: hashToken(token).slice(0, 32) }).catch(() => false);
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
    // Versões vigentes: iguais a apps/web/lib/legal/info.ts (LEGAL_VERSIONS).
    const LEGAL_VERSIONS = { professional_terms: '2026-11-20', patient_terms: '2026-11-20', privacy: '2026-11-21' };
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
    const orgNotFound = (res) => res.status(404).json({ errors: [{ message: 'Consultório não encontrado.', extensions: { code: 'NOT_FOUND' } }] });

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
    const SHARE_KEYS = ['show_kcal', 'show_macros', 'show_weight_history', 'show_maternal'];
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

    // ── Avisos por Telegram e e-mail (0058) ─────────────────────────────────────────────────
    notifier = setupNotifications({ router, database, logger, services, getSchema,
      h: { requireUser, bad, conflict, isUuid, clinicalOrg, memberOrg, clinicalPatient, myPatientRecord } });

    // ── Assinatura da plataforma por Pix (0059) ───────────────────────────────────────────────
    setupSubscriptions({ router, database, logger, notifier, h: { requireUser, bad, conflict, isUuid, memberOrg, withActor, requireAdmin } });

    // ── Materno-infantil: curvas da OMS e gestação (0062) ─────────────────────────────────────
    setupMaternal({ router, database, logger, notifier, h: { requireUser, bad, conflict, isUuid, clinicalOrg, withActor } });

    // ── Painéis clínicos: todos os pacientes e cada paciente ─────────────────────────────────
    setupClinicalDashboard({ router, database, logger, h: { requireUser, isUuid, clinicalOrg } });

    // ── Saúde pública: triagens nutricionais (0066) ───────────────────────────────────────────
    setupPublicHealth({ router, database, logger, h: { requireUser, bad, conflict, isUuid, clinicalOrg, withActor } });

    // ── Assistente de IA, só modelos gratuitos do OpenRouter (0063) ───────────────────────────
    setupAI({ router, database, logger, h: { requireUser, bad, isUuid } });
  },
};
