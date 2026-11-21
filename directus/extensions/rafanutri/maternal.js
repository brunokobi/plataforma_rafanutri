// Módulo materno-infantil (0062): medidas para as curvas da OMS e acompanhamento da gestação.
// Os cálculos (escore-z, ganho de peso) ficam no app, com o @rafanutri/nutrition-core; aqui só dados e regras de acesso.
// Disponível nos planos Profissional e Clínica, ou quando o consultório tem o módulo habilitado por contrato.

const MATERNAL_PLANS = new Set(['professional', 'clinic']);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const today = () => new Date().toISOString().slice(0, 10);

/** Validação de uma medida (criança/adolescente ou gestante). Devolve { value } ou { errors }. */
export function validateMeasurement(b) {
  const errors = {};
  const date = typeof b?.assessed_at === 'string' && ISO.test(b.assessed_at) ? b.assessed_at : null;
  if (!date || date > today() || date < '1900-01-01') errors.assessed_at = 'Data inválida.';
  const w = numOrNull(b?.weight_kg);
  const h = numOrNull(b?.height_cm);
  const hc = numOrNull(b?.head_circumference_cm);
  if (w !== null && !(Number.isFinite(w) && w >= 1 && w <= 400)) errors.weight_kg = 'Peso entre 1 e 400 kg.';
  if (h !== null && !(Number.isFinite(h) && h >= 30 && h <= 250)) errors.height_cm = 'Comprimento/estatura entre 30 e 250 cm.';
  if (hc !== null && !(Number.isFinite(hc) && hc >= 25 && hc <= 60)) errors.head_circumference_cm = 'Perímetro cefálico entre 25 e 60 cm.';
  if (w === null && h === null && hc === null) errors.weight_kg = 'Informe ao menos uma medida.';
  const lying = typeof b?.measured_lying === 'boolean' ? b.measured_lying : null;
  const notes = typeof b?.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null;
  if (Object.keys(errors).length) return { errors };
  return { value: { assessed_at: date, weight_kg: w, height_cm: h, head_circumference_cm: hc, measured_lying: lying, notes } };
}

/** Validação da gestação. */
export function validatePregnancy(b, { partial = false } = {}) {
  const errors = {};
  const out = {};
  if (!partial || b?.lmp_date !== undefined) {
    const d = typeof b?.lmp_date === 'string' && ISO.test(b.lmp_date) ? b.lmp_date : null;
    const max = today();
    const min = new Date(Date.now() - 320 * 864e5).toISOString().slice(0, 10);
    if (!d || d > max || d < min) errors.lmp_date = 'Data da última menstruação nas últimas 45 semanas.';
    else out.lmp_date = d;
  }
  if (!partial || b?.pre_pregnancy_weight_kg !== undefined) {
    const w = Number(b?.pre_pregnancy_weight_kg);
    if (!(Number.isFinite(w) && w >= 25 && w <= 250)) errors.pre_pregnancy_weight_kg = 'Peso pré-gestacional entre 25 e 250 kg.';
    else out.pre_pregnancy_weight_kg = Math.round(w * 10) / 10;
  }
  if (!partial || b?.height_cm !== undefined) {
    const h = Number(b?.height_cm);
    if (!(Number.isFinite(h) && h >= 100 && h <= 220)) errors.height_cm = 'Altura entre 100 e 220 cm.';
    else out.height_cm = Math.round(h * 10) / 10;
  }
  if (b?.notes !== undefined) out.notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null;
  if (Object.keys(errors).length) return { errors };
  return { value: out };
}

export function setupMaternal({ router, database, logger, h }) {
  const { requireUser, bad, conflict, isUuid, clinicalOrg, withActor } = h;
  const notFound = (res) => res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
  const forbidden = (res) => res.status(403).json({ errors: [{ message: 'O módulo materno-infantil faz parte dos planos Profissional e Clínica.', extensions: { code: 'PLAN_REQUIRED' } }] });

  /** Paciente do consultório do usuário + se o plano libera o módulo. */
  async function access(req, res) {
    const user = requireUser(req, res);
    if (!user) return null;
    const org = await clinicalOrg(user);
    if (!org || !isUuid(req.params.id)) return notFound(res), null;
    const [patient, o] = await Promise.all([
      database('patients').where({ id: req.params.id, organization_id: org }).first('id', 'organization_id', 'full_name', 'sex', 'birth_date'),
      database('organizations').where('id', org).first('plan', 'modules'),
    ]);
    if (!patient) return notFound(res), null;
    const allowed = MATERNAL_PLANS.has(o?.plan) || (o?.modules ?? []).includes('maternal');
    return { user, org, patient, allowed };
  }

  function fail(res, error, what) {
    if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
    if (error?.code === '23505') return conflict(res, 'A paciente já tem uma gestação em acompanhamento. Encerre a atual antes de abrir outra.');
    logger.error(`maternal: falha ao ${what}: ${error?.message}`);
    return res.status(500).json({ errors: [{ message: 'Não foi possível salvar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
  }

  router.get('/patients/:id/maternal', async (req, res) => {
    const a = await access(req, res);
    if (!a) return;
    if (!a.allowed) return res.json({ data: { allowed: false, patient: { sex: a.patient.sex, birth_date: iso(a.patient.birth_date) } } });
    const [measurements, pregnancies] = await Promise.all([
      database('anthropometric_assessments').where('patient_id', a.patient.id).orderBy('assessed_at').orderBy('date_created')
        .select('id', 'assessed_at', 'weight_kg', 'height_cm', 'head_circumference_cm', 'measured_lying', 'notes'),
      database('pregnancies').where('patient_id', a.patient.id).orderBy('lmp_date', 'desc')
        .select('id', 'lmp_date', 'pre_pregnancy_weight_kg', 'height_cm', 'status', 'ended_on', 'outcome', 'notes'),
    ]);
    res.json({
      data: {
        allowed: true,
        patient: { sex: a.patient.sex, birth_date: iso(a.patient.birth_date) },
        measurements: measurements.map((m) => ({ ...m, assessed_at: iso(m.assessed_at), weight_kg: numOrNull(m.weight_kg), height_cm: numOrNull(m.height_cm), head_circumference_cm: numOrNull(m.head_circumference_cm) })),
        pregnancies: pregnancies.map((p) => ({ ...p, lmp_date: iso(p.lmp_date), ended_on: iso(p.ended_on), pre_pregnancy_weight_kg: Number(p.pre_pregnancy_weight_kg), height_cm: Number(p.height_cm) })),
      },
    });
  });

  router.post('/patients/:id/maternal/measurements', async (req, res) => {
    const a = await access(req, res);
    if (!a) return;
    if (!a.allowed) return forbidden(res);
    const r = validateMeasurement(req.body);
    if (r.errors) return bad(res, r.errors);
    const v = r.value;
    const ageYears = a.patient.birth_date ? Math.max(0, (Date.parse(`${v.assessed_at}T12:00:00Z`) - Date.parse(`${iso(a.patient.birth_date)}T12:00:00Z`)) / (365.25 * 864e5)) : null;
    if (ageYears !== null && ageYears > 130) return bad(res, { assessed_at: 'Data anterior ao nascimento.' });
    const bmi = v.weight_kg && v.height_cm ? Math.round((v.weight_kg / (v.height_cm / 100) ** 2) * 100) / 100 : null;
    try {
      const [row] = await withActor(a.user, (trx) => trx('anthropometric_assessments').insert({
        organization_id: a.org, patient_id: a.patient.id, assessed_at: v.assessed_at,
        age_years: ageYears === null ? null : Math.round(ageYears * 100) / 100,
        weight_kg: v.weight_kg, height_cm: v.height_cm, head_circumference_cm: v.head_circumference_cm, measured_lying: v.measured_lying,
        results: bmi ? { bmi } : {}, calc_version: 'maternal-1', notes: v.notes, user_created: a.user,
      }).returning('id'));
      res.status(201).json({ data: { id: row.id } });
    } catch (error) {
      fail(res, error, 'registrar medida');
    }
  });

  router.post('/patients/:id/pregnancies', async (req, res) => {
    const a = await access(req, res);
    if (!a) return;
    if (!a.allowed) return forbidden(res);
    if (a.patient.sex === 'male') return bad(res, { lmp_date: 'O cadastro do paciente está com sexo masculino.' });
    const r = validatePregnancy(req.body);
    if (r.errors) return bad(res, r.errors);
    try {
      const [row] = await withActor(a.user, (trx) => trx('pregnancies').insert({ ...r.value, organization_id: a.org, patient_id: a.patient.id, user_created: a.user }).returning('id'));
      res.status(201).json({ data: { id: row.id } });
    } catch (error) {
      fail(res, error, 'abrir gestação');
    }
  });

  router.put('/patients/:id/pregnancies/:pid', async (req, res) => {
    const a = await access(req, res);
    if (!a) return;
    if (!a.allowed) return forbidden(res);
    if (!isUuid(req.params.pid)) return notFound(res);
    const own = await database('pregnancies').where({ id: req.params.pid, patient_id: a.patient.id }).first('id', 'lmp_date', 'status');
    if (!own) return notFound(res);
    const r = validatePregnancy(req.body, { partial: true });
    if (r.errors) return bad(res, r.errors);
    const patch = { ...r.value };
    if (req.body?.end === true) {
      const ended = typeof req.body.ended_on === 'string' && ISO.test(req.body.ended_on) ? req.body.ended_on : null;
      if (!ended || ended > today() || ended < iso(own.lmp_date)) return bad(res, { ended_on: 'Data de encerramento inválida.' });
      const outcome = ['birth', 'loss', 'other'].includes(req.body.outcome) ? req.body.outcome : 'other';
      Object.assign(patch, { status: 'ended', ended_on: ended, outcome });
    } else if (req.body?.reopen === true) {
      Object.assign(patch, { status: 'active', ended_on: null, outcome: null });
    }
    if (!Object.keys(patch).length) return bad(res, { lmp_date: 'Nada para salvar.' });
    try {
      await withActor(a.user, (trx) => trx('pregnancies').where('id', own.id).update(patch));
      res.json({ data: { ok: true } });
    } catch (error) {
      fail(res, error, 'salvar gestação');
    }
  });
}
