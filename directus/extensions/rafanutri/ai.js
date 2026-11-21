// Assistente de IA (0063): endpoints e chamada ao OpenRouter, só com modelos gratuitos.
// A chave fica em OPENROUTER_API_KEY (.env do Directus). Nenhum texto enviado ou recebido é gravado:
// a tabela ai_requests guarda só quem, quando, o tipo, o modelo e os tokens (para a cota diária).
import { AI_DAILY_LIMIT, AI_KINDS, buildMessages, cleanAnswer, formatAnswers, patientContext, pickFreeModels } from './ai-core.js';

const OPENROUTER = 'https://openrouter.ai/api/v1';
const CATALOG_TTL = 60 * 60 * 1000;

export function setupAI({ router, database, logger, h }) {
  const { requireUser, bad, isUuid } = h;
  const key = process.env.OPENROUTER_API_KEY || '';
  let catalog = { at: 0, models: [] };

  async function freeModels() {
    if (Date.now() - catalog.at < CATALOG_TTL && catalog.models.length) return catalog.models;
    try {
      const res = await fetch(`${OPENROUTER}/models`, { signal: AbortSignal.timeout(15000) });
      const json = await res.json();
      const models = pickFreeModels(json?.data);
      if (models.length) catalog = { at: Date.now(), models };
    } catch (error) {
      logger.warn(`ai: falha ao listar modelos: ${error?.message}`);
    }
    return catalog.models;
  }

  /** Tenta os modelos gratuitos em ordem até um responder. */
  async function complete(messages) {
    const models = (await freeModels()).slice(0, 4);
    if (!models.length) throw Object.assign(new Error('sem modelos'), { userMessage: 'O assistente está indisponível agora. Tente de novo em alguns minutos.' });
    let last = null;
    for (const model of models) {
      try {
        const res = await fetch(`${OPENROUTER}/chat/completions`, {
          method: 'POST',
          signal: AbortSignal.timeout(60000),
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Rafanutri' },
          // max_price zero: o OpenRouter recusa qualquer rota paga, mesmo se o modelo mudar de preço.
          body: JSON.stringify({ model, messages, max_tokens: 1800, temperature: 0.4, provider: { max_price: { prompt: 0, completion: 0 } } }),
        });
        const json = await res.json().catch(() => null);
        const content = cleanAnswer(json?.choices?.[0]?.message?.content);
        if (res.ok && content) {
          if (Number(json?.usage?.cost ?? 0) > 0) logger.warn(`ai: custo inesperado no modelo ${model}`);
          return { model, content, usage: json?.usage ?? {} };
        }
        last = `${model}: ${res.status} ${json?.error?.code ?? ''}`;
      } catch (error) {
        last = `${model}: ${error?.name ?? 'erro'}`;
      }
    }
    throw Object.assign(new Error(last ?? 'falha'), { userMessage: 'Os modelos gratuitos estão ocupados agora. Tente de novo em instantes.' });
  }

  async function orgOf(user) {
    return database('organization_members as m').join('organizations as o', 'o.id', 'm.organization_id')
      .where('m.user_id', user).whereIn('m.role', ['owner', 'nutritionist']).orderBy('o.created_at')
      .first('o.id', 'o.plan');
  }

  async function usedToday(orgId) {
    const row = await database('ai_requests').where('organization_id', orgId).where('status', 'ok')
      .whereRaw("(created_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date")
      .count('* as n').first();
    return Number(row?.n ?? 0);
  }

  router.get('/ai/status', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const org = await orgOf(user);
    if (!org) return res.status(403).json({ errors: [{ message: 'Só owner ou nutricionista usa o assistente.', extensions: { code: 'FORBIDDEN' } }] });
    const limit = AI_DAILY_LIMIT[org.plan] ?? 0;
    res.json({ data: { enabled: Boolean(key) && limit > 0, limit, used: await usedToday(org.id), plan: org.plan } });
  });

  /** Contexto do paciente, sem identificação. */
  async function patientInput(orgId, patientId) {
    const p = await database('patients').where({ id: patientId, organization_id: orgId }).first('id', 'full_name', 'birth_date', 'sex', 'objective');
    if (!p) return null;
    const [assessment, anamnesis, pregnancy] = await Promise.all([
      database('anthropometric_assessments').where('patient_id', p.id).whereNotNull('weight_kg').orderBy('assessed_at', 'desc').first('weight_kg', 'height_cm'),
      database('anamneses').where('patient_id', p.id).whereIn('status', ['answered', 'reviewed']).orderBy('answered_at', 'desc').first('schema_snapshot', 'answers'),
      database('pregnancies').where({ patient_id: p.id, status: 'active' }).first('lmp_date'),
    ]);
    const names = [p.full_name].filter(Boolean);
    const ageYears = p.birth_date ? (Date.now() - new Date(p.birth_date).getTime()) / (365.25 * 864e5) : null;
    const pregnancyWeeks = pregnancy ? (Date.now() - new Date(pregnancy.lmp_date).getTime()) / (7 * 864e5) : null;
    return {
      names,
      context: patientContext({ ageYears, sex: p.sex, objective: p.objective, weightKg: assessment?.weight_kg ? Number(assessment.weight_kg) : null, heightCm: assessment?.height_cm ? Number(assessment.height_cm) : null, pregnancyWeeks }, names),
      answers: anamnesis ? formatAnswers(anamnesis.schema_snapshot, anamnesis.answers, names) || null : null,
    };
  }

  router.post('/ai/ask', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const org = await orgOf(user);
    if (!org) return res.status(403).json({ errors: [{ message: 'Só owner ou nutricionista usa o assistente.', extensions: { code: 'FORBIDDEN' } }] });
    if (!key) return res.status(503).json({ errors: [{ message: 'O assistente ainda não foi configurado.', extensions: { code: 'AI_OFF' } }] });
    const kind = req.body?.kind;
    if (!AI_KINDS.includes(kind)) return bad(res, { kind: 'Tipo de pedido inválido.' });
    const limit = AI_DAILY_LIMIT[org.plan] ?? 0;
    if ((await usedToday(org.id)) >= limit) {
      return res.status(429).json({ errors: [{ message: limit <= 5 ? `Você usou os ${limit} pedidos de hoje do seu plano. Nos planos Profissional e Clínica o uso é livre.` : 'Limite de uso do dia atingido. Volte amanhã.', extensions: { code: 'AI_QUOTA' } }] });
    }

    let input = { text: req.body?.text, kcal: req.body?.kcal };
    let patientId = null;
    if (kind === 'anamnesis_summary' || kind === 'plan_suggestion') {
      if (!isUuid(req.body?.patient_id)) {
        if (kind === 'anamnesis_summary') return bad(res, { patient_id: 'Escolha o paciente.' });
      } else {
        const p = await patientInput(org.id, req.body.patient_id);
        if (!p) return bad(res, { patient_id: 'Paciente não encontrado.' });
        patientId = req.body.patient_id;
        input = { ...input, ...p };
      }
    }
    const built = buildMessages(kind, input);
    if (built.error) return bad(res, { text: built.error });

    try {
      const out = await complete(built.messages);
      await database('ai_requests').insert({ organization_id: org.id, user_id: user, kind, model: out.model, patient_id: patientId, prompt_tokens: out.usage.prompt_tokens ?? null, completion_tokens: out.usage.completion_tokens ?? null, status: 'ok' });
      res.json({ data: { answer: out.content, model: out.model, used: (await usedToday(org.id)), limit } });
    } catch (error) {
      logger.warn(`ai: sem resposta (${error?.message})`);
      await database('ai_requests').insert({ organization_id: org.id, user_id: user, kind, model: null, patient_id: patientId, status: 'error' }).catch(() => {});
      res.status(503).json({ errors: [{ message: error?.userMessage ?? 'O assistente não respondeu agora. Tente de novo.', extensions: { code: 'AI_UNAVAILABLE' } }] });
    }
  });
}
