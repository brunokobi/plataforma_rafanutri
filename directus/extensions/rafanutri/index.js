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
        out.push({
          id: o.id,
          name: o.name,
          is_owner: o.is_owner,
          unit_limit: limit,
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
      res.json({
        data: {
          can_run: canRun(a) && a.unit.active,
          templates,
          runs: runs.map((r) => ({ ...runOut(r), started_by_name: userName(r), mine: r.started_by === user })),
          non_conformities: ncs,
        },
      });
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
          run: { ...runOut(x.run), started_by_name: userName(starter), completed_by_name: userName(finisher) },
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

    router.post('/uan/checklist-runs/:id/complete', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const x = await runAccess(user, req.params.id);
      if (!x) return runNotFound(res);
      if (!canRun(x.a)) return runForbidden(res);
      try {
        const run = await withActor(user, async (trx) => (await trx.raw('select (checklist_complete(?, ?)).*', [x.run.id, user])).rows[0]);
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
    async function clinicalPatient(user, id) {
      const org = await clinicalOrg(user);
      if (!org || !isUuid(id)) return null;
      return database('patients').where({ id, organization_id: org }).first('id', 'organization_id', 'status', 'email', 'app_user_id', 'app_activated_at');
    }
    async function pendingInvite(token, trx = database) {
      if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) return null;
      const inv = await trx('patient_app_invites as i')
        .join('patients as p', 'p.id', 'i.patient_id')
        .where('i.token_hash', hashToken(token))
        .whereNull('i.used_at').whereNull('i.revoked_at')
        .where('i.expires_at', '>', trx.fn.now())
        .where('p.status', 'active')
        .first('i.id', 'i.organization_id', 'i.patient_id', 'i.email', 'i.expires_at', 'p.full_name', 'p.responsible_user_id');
      return inv ?? null;
    }
    async function linkInvite(inv, userId) {
      return database.transaction(async (trx) => {
        await linkOn(trx);
        const n = await trx('patient_app_invites').where({ id: inv.id }).whereNull('used_at').whereNull('revoked_at').update({ used_at: trx.fn.now(), used_by: userId });
        if (!n) return false;
        // Se a conta já estava ligada a outro registro deste consultório, desfaz (um registro por conta e consultório)
        await trx('patients').where({ organization_id: inv.organization_id, app_user_id: userId }).whereNot({ id: inv.patient_id }).update({ app_user_id: null, app_activated_at: null });
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
      res.json({ data: { linked: Boolean(p.app_user_id), email: account?.email ?? null, activated_at: p.app_activated_at, invite: invite ?? null, patient_email: p.email, active: p.status === 'active' } });
    });

    router.post('/patients/:id/app-invite', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (!EMAIL.test(email) || email.length > 254) return bad(res, { email: 'Informe um e-mail válido.' });
      const p = await clinicalPatient(user, req.params.id);
      if (!p) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      if (p.status !== 'active') return conflict(res, 'Reative o paciente antes de convidar.');
      const existing = await database('directus_users').whereRaw('lower(email) = ?', [email]).first('id', 'role');
      if (existing && existing.role !== PATIENT_ROLE) return conflict(res, 'Este e-mail é de uma conta de profissional; use outro e-mail para o paciente.');
      const token = randomBytes(32).toString('base64url');
      try {
        const expires = await database.transaction(async (trx) => {
          await trx('patient_app_invites').where({ patient_id: p.id }).whereNull('used_at').whereNull('revoked_at').update({ revoked_at: trx.fn.now() });
          const [row] = await trx('patient_app_invites')
            .insert({ organization_id: p.organization_id, patient_id: p.id, email, token_hash: hashToken(token), user_created: user })
            .returning('expires_at');
          return row.expires_at;
        });
        res.status(201).json({ data: { token, email, expires_at: expires } });
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
    const SHARE_KEYS = ['show_kcal', 'show_macros', 'show_weight_history'];
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
  },
};
