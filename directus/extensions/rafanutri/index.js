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
import { setupGoogleAuth } from './google-auth.js';
import { setupPatientArea } from './patient-area.js';
import { setupPractice } from './practice.js';
import { setupUan } from './uan.js';
import { fillMonths, isIsoDate, monthStart, splitInstallments, validatePackage, validateTransaction } from './finance.js';
import { PAID_PLANS as PAID_PLAN_LIST, PRACTICE_PLANS as PRACTICE_PLAN_LIST } from './catalogs.js';

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
  handler: (router, { database, logger, services, getSchema, env }) => {
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

    // ── Módulo Gestão do consultório (financeiro, CRM, pacotes, agendamento online e lembretes) ──
    // Fora do plano Gratuito: Essencial, Profissional e Clínica, ou habilitado por contrato (organizations.modules).
    const PRACTICE_PLANS = new Set(PRACTICE_PLAN_LIST);
    const hasPractice = (o) => Boolean(o && (PRACTICE_PLANS.has(o.plan) || (o.modules ?? []).includes('practice')));
    const PRACTICE_ROUTES = ['/finance', '/crm', '/packages', '/patient-packages', '/patients/:id/packages', '/booking-requests', '/notifications/settings', '/notifications/test', '/practices/:id/public-profile'];
    router.use(PRACTICE_ROUTES, async (req, res, next) => {
      try {
        const user = req.accountability?.user;
        if (!user) return next(); // a rota responde 401
        const orgs = await database('organization_members as m').join('organizations as o', 'o.id', 'm.organization_id')
          .where('m.user_id', user).select('o.plan', 'o.modules');
        if (orgs.length === 0 || orgs.some(hasPractice)) return next();
        return res.status(403).json({ errors: [{ message: 'O módulo Gestão do consultório (financeiro, CRM, pacotes, agendamento online e lembretes) faz parte dos planos Essencial, Profissional e Clínica.', extensions: { code: 'PLAN_REQUIRED' } }] });
      } catch (error) {
        logger.error({ err: error }, 'rafanutri: falha ao conferir o módulo Gestão');
        return res.status(500).json({ errors: [{ message: 'Não foi possível conferir o seu plano agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
    });

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

    const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const conflict = (res, message) => res.status(409).json({ errors: [{ message, extensions: { code: 'CONFLICT' } }] });
    const orgNotFound = (res) => res.status(404).json({ errors: [{ message: 'Consultório não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const { finMember, pubNotFound, withActor } = setupPractice({ bad, conflict, database, getSchema, hasPractice, isUuid, logAccess, logger, memberOrg, orgNotFound, ownedOrg: (...a) => ownedOrg(...a), requireUser, router, services }); // ownedOrg vem de setupPatientArea, montado depois
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
    // Mesmo consultório que clinicalOrg quando a pessoa é owner/nutricionista em algum (antes, com dois vínculos,
    // financeiro/CRM e clínico podiam cair em consultórios diferentes). Seletor de consultório explícito: pendente.
    async function memberOrg(userId) {
      return database('organization_members as m')
        .join('organizations as o', 'o.id', 'm.organization_id')
        .where('m.user_id', userId)
        .orderByRaw("case when m.role in ('owner', 'nutritionist') then 0 else 1 end")
        .orderBy('o.created_at')
        .first('o.id', 'o.plan', 'm.role');
    }
    const PAID_PLANS = new Set(PAID_PLAN_LIST);

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

    const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const { requireAdmin } = setupUan({ EMAIL, TOKEN_FORMAT, bad, conflict, database, getSchema, hashToken, isPatientAccount, isUuid, logger, pubNotFound, recordTerms: (...a) => recordTerms(...a), requireUser, router, services, withActor }); // recordTerms vem de setupPatientArea
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

    const { clinicalPatient, ownedOrg, planDocumentInfo, recordTerms } = setupPatientArea({ EMAIL, PATIENT_ROLE, TOKEN_FORMAT, bad, clinicalOrg, conflict, database, getSchema, hashToken, isPatientAccount, isUuid, logger, myPatientRecord, notifierRef: () => notifier, orgNotFound, requireUser, router, services, withActor });
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

    // ── Entrar com o Google (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URIS no .env) ───────────────────
    setupGoogleAuth({ router, database, logger, services, getSchema, env: env ?? process.env, recordTerms });
  },
};
