// Saúde pública, bloco A (0066): triagens nutricionais (NRS-2002, MUST, ASG) e painel de risco do consultório.
// O cálculo (pontuação, classificação, risco) é feito no app pelo @rafanutri/nutrition-core; aqui ficam a validação
// do formato, o acesso (módulo public_health habilitado por contrato) e os dados de apoio (IMC, idade, perda de peso).
import { SCREENING_TOOL_VERSIONS } from './catalogs.js';

export const TOOLS = SCREENING_TOOL_VERSIONS;
const RISKS = ['low', 'medium', 'high'];
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

/** Formato da triagem enviada pelo app. Devolve { value } ou { errors }. */
export function validateScreening(b) {
  const errors = {};
  const tool = b?.tool;
  if (!Object.hasOwn(TOOLS, tool)) return { errors: { tool: 'Ferramenta de triagem inválida.' } };
  if (b.tool_version !== TOOLS[tool]) errors.tool_version = 'Versão da ferramenta desatualizada. Atualize a página.';
  const answers = b?.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || JSON.stringify(answers).length > 4000) errors.answers = 'Respostas inválidas.';
  const score = b?.score === null || b?.score === undefined ? null : Number(b.score);
  if (score !== null && !(Number.isFinite(score) && score >= 0 && score <= 100)) errors.score = 'Pontuação inválida.';
  if (typeof b?.classification !== 'string' || !/^[A-Za-z_]{1,40}$/.test(b.classification)) errors.classification = 'Classificação inválida.';
  if (!RISKS.includes(b?.risk_level)) errors.risk_level = 'Risco inválido.';
  const notes = typeof b?.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null;
  if (Object.keys(errors).length) return { errors };
  return { value: { tool, tool_version: TOOLS[tool], answers, score, classification: b.classification, risk_level: b.risk_level, notes } };
}

/**
 * Perda de peso em % entre o peso mais recente e o mais antigo dentro da janela [minDays, maxDays] antes dele.
 * Sem pesagem na janela: null.
 */
export function weightLossFromHistory(weights, minDays, maxDays) {
  const list = weights.filter((w) => w.weight_kg > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = list[0];
  if (!last) return null;
  const t = Date.parse(`${last.date}T12:00:00Z`);
  const inWindow = list.filter((w) => {
    const d = (t - Date.parse(`${w.date}T12:00:00Z`)) / 864e5;
    return d >= minDays && d <= maxDays;
  });
  const before = inWindow.at(-1);
  if (!before) return null;
  return Math.max(0, Math.round(((before.weight_kg - last.weight_kg) / before.weight_kg) * 1000) / 10);
}

export function setupPublicHealth({ router, database, logger, h }) {
  const { requireUser, bad, conflict, isUuid, clinicalOrg, withActor } = h;
  const notFound = (res) => res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
  const forbidden = (res) => res.status(403).json({ errors: [{ message: 'O módulo Saúde pública é habilitado por contrato. Fale com a equipe da Rafanutri.', extensions: { code: 'MODULE_REQUIRED' } }] });

  async function orgAccess(user) {
    const org = await clinicalOrg(user);
    if (!org) return null;
    const o = await database('organizations').where('id', org).first('modules');
    return { org, allowed: (o?.modules ?? []).includes('public_health') };
  }

  async function patientAccess(req, res) {
    const user = requireUser(req, res);
    if (!user) return null;
    const a = await orgAccess(user);
    if (!a || !isUuid(req.params.id)) return notFound(res), null;
    const patient = await database('patients').where({ id: req.params.id, organization_id: a.org }).first('id', 'full_name', 'sex', 'birth_date');
    if (!patient) return notFound(res), null;
    return { user, ...a, patient };
  }

  router.get('/patients/:id/screenings', async (req, res) => {
    const a = await patientAccess(req, res);
    if (!a) return;
    if (!a.allowed) return res.json({ data: { allowed: false } });
    const [rows, assessments] = await Promise.all([
      database('nutrition_screenings').where('patient_id', a.patient.id).orderBy('screened_at', 'desc').limit(100)
        .select('id', 'tool', 'tool_version', 'answers', 'score', 'classification', 'risk_level', 'screened_at', 'notes'),
      database('anthropometric_assessments').where('patient_id', a.patient.id).whereNotNull('weight_kg').orderBy('assessed_at', 'desc').limit(60)
        .select('assessed_at', 'weight_kg', 'height_cm'),
    ]);
    const weights = assessments.map((x) => ({ date: iso(x.assessed_at), weight_kg: Number(x.weight_kg) }));
    const last = assessments[0];
    const height = assessments.find((x) => x.height_cm)?.height_cm;
    const bmi = last && height ? Math.round((Number(last.weight_kg) / (Number(height) / 100) ** 2) * 10) / 10 : null;
    res.json({
      data: {
        allowed: true,
        patient: { sex: a.patient.sex, birth_date: iso(a.patient.birth_date) },
        prefill: {
          weight_kg: last ? Number(last.weight_kg) : null,
          weighed_on: last ? iso(last.assessed_at) : null,
          height_cm: height ? Number(height) : null,
          bmi,
          // MUST: perda em 3 a 6 meses; NRS-2002: perda em até 3 meses; ASG: 6 meses
          loss_3_6m: weightLossFromHistory(weights, 80, 190),
          loss_3m: weightLossFromHistory(weights, 20, 100),
          loss_6m: weightLossFromHistory(weights, 20, 190),
        },
        screenings: rows.map((r) => ({ ...r, score: r.score === null ? null : Number(r.score) })),
      },
    });
  });

  router.post('/patients/:id/screenings', async (req, res) => {
    const a = await patientAccess(req, res);
    if (!a) return;
    if (!a.allowed) return forbidden(res);
    const r = validateScreening(req.body);
    if (r.errors) return bad(res, r.errors);
    try {
      const [row] = await withActor(a.user, (trx) => trx('nutrition_screenings')
        .insert({ ...r.value, answers: JSON.stringify(r.value.answers), organization_id: a.org, patient_id: a.patient.id, screened_by: a.user }).returning('id'));
      res.status(201).json({ data: { id: row.id } });
    } catch (error) {
      if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
      logger.error(`public-health: falha ao registrar triagem: ${error?.message}`);
      res.status(500).json({ errors: [{ message: 'Não foi possível salvar a triagem agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    }
  });

  // Painel: última triagem de cada paciente ativo, contagem por risco e lista dos que estão em risco.
  router.get('/public-health/overview', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const a = await orgAccess(user);
    if (!a) return res.status(403).json({ errors: [{ message: 'Sem consultório.', extensions: { code: 'FORBIDDEN' } }] });
    if (!a.allowed) return res.json({ data: { allowed: false } });
    const latest = await database.raw(`
      select distinct on (s.patient_id) s.patient_id, p.full_name, p.birth_date, s.tool, s.classification, s.risk_level, s.score, s.screened_at
      from nutrition_screenings s join patients p on p.id = s.patient_id
      where s.organization_id = ? and p.status = 'active'
      order by s.patient_id, s.screened_at desc`, [a.org]);
    const rows = latest.rows ?? [];
    const [{ n: active }] = await database('patients').where({ organization_id: a.org, status: 'active' }).count({ n: '*' });
    const [{ n: last30 }] = await database('nutrition_screenings').where('organization_id', a.org).whereRaw("screened_at > now() - interval '30 days'").count({ n: '*' });
    const byRisk = { low: 0, medium: 0, high: 0 };
    for (const r of rows) byRisk[r.risk_level] += 1;
    res.json({
      data: {
        allowed: true,
        active_patients: Number(active),
        screened_patients: rows.length,
        screenings_30d: Number(last30),
        by_risk: byRisk,
        at_risk: rows.filter((r) => r.risk_level !== 'low')
          .sort((x, y) => (x.risk_level === y.risk_level ? (x.screened_at < y.screened_at ? 1 : -1) : x.risk_level === 'high' ? -1 : 1))
          .slice(0, 200)
          .map((r) => ({ patient_id: r.patient_id, full_name: r.full_name, birth_date: iso(r.birth_date), tool: r.tool, classification: r.classification, risk_level: r.risk_level, score: r.score === null ? null : Number(r.score), screened_at: r.screened_at })),
      },
    });
  });
}
