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

/** Alergênicos e etapas de textura (RN-116). Iguais a apps/web/lib/maternal/feeding.ts. */
export const ALLERGENS = ['egg', 'peanut', 'cow_milk', 'wheat', 'fish', 'shellfish', 'soy', 'tree_nuts', 'sesame'];
export const TEXTURES = ['mashed', 'soft_pieces', 'chopped', 'family'];
export const REACTIONS = ['none', 'mild', 'moderate', 'severe'];
export const FEEDING_TYPES = ['exclusive', 'predominant', 'complemented', 'mixed'];
export const RELATIONSHIPS = ['mother', 'father', 'grandparent', 'legal_guardian', 'other'];
export const CONSENT_METHODS = ['in_person', 'signed_form', 'other'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);

/** Registro de introdução alimentar. Devolve { value } ou { errors }. */
export function validateFeeding(kind, item, b) {
  const errors = {};
  const list = kind === 'allergen' ? ALLERGENS : kind === 'texture' ? TEXTURES : null;
  if (!list || !list.includes(item)) return { errors: { item: 'Item desconhecido.' } };
  const d = typeof b?.introduced_on === 'string' && ISO.test(b.introduced_on) ? b.introduced_on : null;
  if (!d || d > today() || d < '2000-01-01') errors.introduced_on = 'Data inválida.';
  const reaction = kind === 'texture' ? 'none' : (b?.reaction ?? 'none');
  if (!REACTIONS.includes(reaction)) errors.reaction = 'Reação inválida.';
  if (Object.keys(errors).length) return { errors };
  return { value: { kind, item, introduced_on: d, reaction, notes: text(b?.notes, 500) } };
}

/** Lactação. partial: só os campos enviados. */
export function validateLactation(b, { partial = false } = {}) {
  const errors = {};
  const out = {};
  if (!partial || b?.started_on !== undefined) {
    const d = typeof b?.started_on === 'string' && ISO.test(b.started_on) ? b.started_on : null;
    if (!d || d > today() || d < '2000-01-01') errors.started_on = 'Data de início inválida.';
    else out.started_on = d;
  }
  if (!partial || b?.feeding_type !== undefined) {
    if (!FEEDING_TYPES.includes(b?.feeding_type)) errors.feeding_type = 'Escolha o tipo de aleitamento.';
    else out.feeding_type = b.feeding_type;
  }
  if (b?.baby_patient_id !== undefined) {
    if (b.baby_patient_id !== null && !(typeof b.baby_patient_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.baby_patient_id))) errors.baby_patient_id = 'Bebê inválido.';
    else out.baby_patient_id = b.baby_patient_id;
  }
  if (b?.notes !== undefined) out.notes = text(b.notes, 1000);
  if (Object.keys(errors).length) return { errors };
  return { value: out };
}

/** Responsável legal. */
export function validateGuardian(b, { partial = false } = {}) {
  const errors = {};
  const out = {};
  if (!partial || b?.full_name !== undefined) {
    const n = text(b?.full_name, 120);
    if (!n || n.length < 2) errors.full_name = 'Informe o nome do responsável.';
    else out.full_name = n;
  }
  if (!partial || b?.relationship !== undefined) {
    if (!RELATIONSHIPS.includes(b?.relationship)) errors.relationship = 'Escolha o parentesco.';
    else out.relationship = b.relationship;
  }
  if (b?.email !== undefined) {
    const e = text(b.email, 254)?.toLowerCase() ?? null;
    if (e && !EMAIL.test(e)) errors.email = 'E-mail inválido.';
    else out.email = e;
  }
  if (b?.phone !== undefined) {
    const ph = text(b.phone, 30);
    if (ph && !/^[\d\s()+-]{8,30}$/.test(ph)) errors.phone = 'Telefone inválido.';
    else out.phone = ph;
  }
  if (b?.notes !== undefined) out.notes = text(b.notes, 500);
  if (b?.consent !== undefined) {
    if (b.consent === null) Object.assign(out, { consent_at: null, consent_method: null });
    else if (!CONSENT_METHODS.includes(b.consent)) errors.consent = 'Forma de consentimento inválida.';
    else out.consent_method = b.consent;
  }
  if (Object.keys(errors).length) return { errors };
  return { value: out };
}

/** Linha de introdução alimentar para a API. */
const feedingOut = (r) => ({ kind: r.kind, item: r.item, introduced_on: iso(r.introduced_on), reaction: r.reaction, notes: r.notes, by_guardian: r.by_guardian });

export function setupMaternal({ router, database, logger, h, notifier = null }) {
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
      database('patients').where({ id: req.params.id, organization_id: org }).first('id', 'organization_id', 'full_name', 'sex', 'birth_date', 'responsible_user_id'),
      database('organizations').where('id', org).first('plan', 'modules'),
    ]);
    if (!patient) return notFound(res), null;
    const allowed = MATERNAL_PLANS.has(o?.plan) || (o?.modules ?? []).includes('maternal');
    return { user, org, patient, allowed };
  }

  function fail(res, error, what, duplicate = 'A paciente já tem uma gestação em acompanhamento. Encerre a atual antes de abrir outra.') {
    if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
    if (error?.code === '23505') return conflict(res, duplicate);
    logger.error(`maternal: falha ao ${what}: ${error?.message}`);
    return res.status(500).json({ errors: [{ message: 'Não foi possível salvar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
  }

  /** Lactações em que o paciente é a mãe ou o bebê (o registro aparece nos dois prontuários). */
  async function lactationsOf(patientId) {
    const rows = await database('lactations as l')
      .join('patients as m', 'm.id', 'l.patient_id').leftJoin('patients as b', 'b.id', 'l.baby_patient_id')
      .where('l.patient_id', patientId).orWhere('l.baby_patient_id', patientId)
      .orderBy('l.started_on', 'desc')
      .select('l.id', 'l.patient_id', 'l.baby_patient_id', 'l.started_on', 'l.feeding_type', 'l.status', 'l.ended_on', 'l.notes', 'm.full_name as mother_name', 'b.full_name as baby_name');
    return rows.map((r) => ({ ...r, started_on: iso(r.started_on), ended_on: iso(r.ended_on), role: r.patient_id === patientId ? 'mother' : 'baby' }));
  }

  /** Aviso ao nutricionista do paciente (ou aos owners) quando o responsável registra reação moderada ou grave. */
  async function warnReaction(patient, row) {
    if (!notifier || !['moderate', 'severe'].includes(row.reaction)) return;
    const ctx = { childName: patient.full_name, item: row.item, reaction: row.reaction, link: `${notifier.site}/app/pacientes/${patient.id}/materno-infantil` };
    const dedupe = `feeding-reaction:${patient.id}:${row.item}:${row.reaction}`;
    try {
      if (patient.responsible_user_id) await notifier.enqueueUser({ orgId: patient.organization_id, userId: patient.responsible_user_id, kind: 'feeding_reaction', dedupe, ctx });
      else await notifier.notifyOwners({ orgId: patient.organization_id, kind: 'feeding_reaction', dedupe, ctx });
      notifier.tick?.();
    } catch (error) {
      logger.warn(`maternal: falha ao avisar reação: ${error?.message}`);
    }
  }

  /** Grava (ou atualiza) um item da introdução alimentar. */
  async function saveFeeding(user, patient, kind, item, body) {
    const r = validateFeeding(kind, item, body);
    if (r.errors) return r;
    const v = r.value;
    const row = await withActor(user, async (trx) => {
      const [saved] = await trx('feeding_intro_progress')
        .insert({ organization_id: patient.organization_id, patient_id: patient.id, ...v, recorded_by: user })
        .onConflict(['patient_id', 'kind', 'item']).merge({ introduced_on: v.introduced_on, reaction: v.reaction, notes: v.notes, recorded_by: user })
        .returning(['kind', 'item', 'introduced_on', 'reaction', 'notes', 'by_guardian']);
      return saved;
    });
    return { value: feedingOut(row) };
  }

  router.get('/patients/:id/maternal', async (req, res) => {
    const a = await access(req, res);
    if (!a) return;
    if (!a.allowed) return res.json({ data: { allowed: false, patient: { sex: a.patient.sex, birth_date: iso(a.patient.birth_date) } } });
    const [measurements, pregnancies, lactations, feeding, guardians, babies] = await Promise.all([
      database('anthropometric_assessments').where('patient_id', a.patient.id).orderBy('assessed_at').orderBy('date_created')
        .select('id', 'assessed_at', 'weight_kg', 'height_cm', 'head_circumference_cm', 'measured_lying', 'notes'),
      database('pregnancies').where('patient_id', a.patient.id).orderBy('lmp_date', 'desc')
        .select('id', 'lmp_date', 'pre_pregnancy_weight_kg', 'height_cm', 'status', 'ended_on', 'outcome', 'notes'),
      lactationsOf(a.patient.id),
      database('feeding_intro_progress').where('patient_id', a.patient.id).orderBy('introduced_on').select('kind', 'item', 'introduced_on', 'reaction', 'notes', 'by_guardian'),
      database('patient_guardians').where('patient_id', a.patient.id).orderBy('date_created')
        .select('id', 'full_name', 'relationship', 'email', 'phone', 'consent_at', 'consent_method', 'notes'),
      // Bebês que podem ser ligados à lactação: pacientes ativos do consultório com até 3 anos
      database('patients').where({ organization_id: a.org, status: 'active' }).whereNot('id', a.patient.id)
        .whereRaw("birth_date > current_date - interval '3 years'").orderBy('full_name').select('id', 'full_name', 'birth_date'),
    ]);
    res.json({
      data: {
        allowed: true,
        patient: { sex: a.patient.sex, birth_date: iso(a.patient.birth_date) },
        measurements: measurements.map((m) => ({ ...m, assessed_at: iso(m.assessed_at), weight_kg: numOrNull(m.weight_kg), height_cm: numOrNull(m.height_cm), head_circumference_cm: numOrNull(m.head_circumference_cm) })),
        pregnancies: pregnancies.map((p) => ({ ...p, lmp_date: iso(p.lmp_date), ended_on: iso(p.ended_on), pre_pregnancy_weight_kg: Number(p.pre_pregnancy_weight_kg), height_cm: Number(p.height_cm) })),
        lactations,
        feeding: feeding.map(feedingOut),
        guardians,
        baby_candidates: babies.map((b) => ({ id: b.id, full_name: b.full_name, birth_date: iso(b.birth_date) })),
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

  // ── Lactação (RN-114) ─────────────────────────────────────────────────────────────────────
  router.post('/patients/:id/lactations', async (req, res) => {
    const a = await access(req, res);
    if (!a) return;
    if (!a.allowed) return forbidden(res);
    if (a.patient.sex === 'male') return bad(res, { started_on: 'O cadastro do paciente está com sexo masculino.' });
    const r = validateLactation(req.body);
    if (r.errors) return bad(res, r.errors);
    try {
      const [row] = await withActor(a.user, (trx) => trx('lactations').insert({ ...r.value, organization_id: a.org, patient_id: a.patient.id, user_created: a.user }).returning('id'));
      res.status(201).json({ data: { id: row.id } });
    } catch (error) {
      fail(res, error, 'registrar lactação', 'A paciente já tem uma lactação em acompanhamento. Encerre a atual antes de abrir outra.');
    }
  });

  router.put('/patients/:id/lactations/:lid', async (req, res) => {
    const a = await access(req, res);
    if (!a) return;
    if (!a.allowed) return forbidden(res);
    if (!isUuid(req.params.lid)) return notFound(res);
    const own = await database('lactations').where({ id: req.params.lid, patient_id: a.patient.id }).first('id', 'started_on');
    if (!own) return notFound(res);
    const r = validateLactation(req.body, { partial: true });
    if (r.errors) return bad(res, r.errors);
    const patch = { ...r.value };
    if (req.body?.end === true) {
      const ended = typeof req.body.ended_on === 'string' && ISO.test(req.body.ended_on) ? req.body.ended_on : null;
      if (!ended || ended > today() || ended < (patch.started_on ?? iso(own.started_on))) return bad(res, { ended_on: 'Data de encerramento inválida.' });
      Object.assign(patch, { status: 'ended', ended_on: ended });
    } else if (req.body?.reopen === true) {
      Object.assign(patch, { status: 'active', ended_on: null });
    }
    if (!Object.keys(patch).length) return bad(res, { feeding_type: 'Nada para salvar.' });
    try {
      await withActor(a.user, (trx) => trx('lactations').where('id', own.id).update(patch));
      res.json({ data: { ok: true } });
    } catch (error) {
      fail(res, error, 'salvar lactação', 'A paciente já tem uma lactação em acompanhamento.');
    }
  });

  // ── Introdução alimentar: alergênicos e texturas (RN-116) ────────────────────────────────
  router.put('/patients/:id/feeding/:kind/:item', async (req, res) => {
    const a = await access(req, res);
    if (!a) return;
    if (!a.allowed) return forbidden(res);
    try {
      const r = await saveFeeding(a.user, a.patient, req.params.kind, req.params.item, req.body);
      if (r.errors) return bad(res, r.errors);
      res.json({ data: r.value });
    } catch (error) {
      fail(res, error, 'registrar introdução alimentar');
    }
  });

  router.delete('/patients/:id/feeding/:kind/:item', async (req, res) => {
    const a = await access(req, res);
    if (!a) return;
    if (!a.allowed) return forbidden(res);
    await withActor(a.user, (trx) => trx('feeding_intro_progress').where({ patient_id: a.patient.id, kind: String(req.params.kind), item: String(req.params.item) }).del());
    res.json({ data: { ok: true } });
  });

  // ── Responsáveis legais e consentimento (RN-118) ─────────────────────────────────────────
  // Cadastro de responsáveis é dado de cadastro: vale em qualquer plano (o convite do menor depende dele).
  async function guardianAccess(req, res) {
    const user = requireUser(req, res);
    if (!user) return null;
    const org = await clinicalOrg(user);
    if (!org || !isUuid(req.params.id)) return notFound(res), null;
    const patient = await database('patients').where({ id: req.params.id, organization_id: org }).first('id', 'organization_id');
    if (!patient) return notFound(res), null;
    return { user, org, patient };
  }

  router.get('/patients/:id/guardians', async (req, res) => {
    const a = await guardianAccess(req, res);
    if (!a) return;
    const rows = await database('patient_guardians').where('patient_id', a.patient.id).orderBy('date_created')
      .select('id', 'full_name', 'relationship', 'email', 'phone', 'consent_at', 'consent_method', 'notes');
    res.json({ data: rows });
  });

  router.post('/patients/:id/guardians', async (req, res) => {
    const a = await guardianAccess(req, res);
    if (!a) return;
    const r = validateGuardian(req.body);
    if (r.errors) return bad(res, r.errors);
    const v = { ...r.value };
    if (v.consent_method) Object.assign(v, { consent_at: new Date(), consent_recorded_by: a.user });
    try {
      const [row] = await withActor(a.user, (trx) => trx('patient_guardians').insert({ ...v, organization_id: a.org, patient_id: a.patient.id, user_created: a.user }).returning('id'));
      res.status(201).json({ data: { id: row.id } });
    } catch (error) {
      fail(res, error, 'cadastrar responsável');
    }
  });

  router.put('/patients/:id/guardians/:gid', async (req, res) => {
    const a = await guardianAccess(req, res);
    if (!a) return;
    if (!isUuid(req.params.gid)) return notFound(res);
    const own = await database('patient_guardians').where({ id: req.params.gid, patient_id: a.patient.id }).first('id', 'consent_at');
    if (!own) return notFound(res);
    const r = validateGuardian(req.body, { partial: true });
    if (r.errors) return bad(res, r.errors);
    const v = { ...r.value };
    if (v.consent_method) Object.assign(v, { consent_at: new Date(), consent_recorded_by: a.user });
    if (!Object.keys(v).length) return bad(res, { full_name: 'Nada para salvar.' });
    try {
      await withActor(a.user, (trx) => trx('patient_guardians').where('id', own.id).update(v));
      res.json({ data: { ok: true } });
    } catch (error) {
      fail(res, error, 'salvar responsável');
    }
  });

  router.delete('/patients/:id/guardians/:gid', async (req, res) => {
    const a = await guardianAccess(req, res);
    if (!a) return;
    if (!isUuid(req.params.gid)) return notFound(res);
    const n = await withActor(a.user, (trx) => trx('patient_guardians').where({ id: req.params.gid, patient_id: a.patient.id }).del());
    if (!n) return notFound(res);
    res.json({ data: { ok: true } });
  });

  // ── App do paciente: curvas, gestação e introdução alimentar (RN-117) ────────────────────
  /** Registro da conta (o paciente ou o responsável pelo filho), se o plano tem o módulo e o nutricionista liberou. */
  async function appRecord(req, res) {
    const user = requireUser(req, res);
    if (!user) return null;
    const c = typeof req.query.c === 'string' && isUuid(req.query.c) ? req.query.c : null;
    let q = database('patients as p').join('organizations as o', 'o.id', 'p.organization_id').where('p.app_user_id', user).where('p.status', 'active');
    if (c) q = q.where('p.id', c);
    const p = await q.orderBy('p.app_activated_at', 'desc')
      .first('p.id', 'p.organization_id', 'p.full_name', 'p.sex', 'p.birth_date', 'p.responsible_user_id', 'o.plan', 'o.modules');
    if (!p) return { user, record: null, visible: false };
    const share = (await database.raw('select patient_share(?) as s', [p.id])).rows?.[0]?.s ?? {};
    const allowed = MATERNAL_PLANS.has(p.plan) || (p.modules ?? []).includes('maternal');
    return { user, record: p, visible: allowed && share.show_maternal === true };
  }

  router.get('/me/patient/maternal', async (req, res) => {
    const a = await appRecord(req, res);
    if (!a) return;
    if (!a.record || !a.visible) return res.json({ data: { visible: false } });
    const p = a.record;
    const [measurements, pregnancy, lactations, feeding] = await Promise.all([
      database('anthropometric_assessments').where('patient_id', p.id).orderBy('assessed_at')
        .select('assessed_at', 'weight_kg', 'height_cm', 'head_circumference_cm', 'measured_lying'),
      database('pregnancies').where({ patient_id: p.id, status: 'active' }).first('lmp_date', 'pre_pregnancy_weight_kg', 'height_cm'),
      lactationsOf(p.id),
      database('feeding_intro_progress').where('patient_id', p.id).orderBy('introduced_on').select('kind', 'item', 'introduced_on', 'reaction', 'notes', 'by_guardian'),
    ]);
    res.json({
      data: {
        visible: true,
        patient: { id: p.id, first_name: p.full_name.trim().split(/\s+/)[0] ?? null, sex: p.sex, birth_date: iso(p.birth_date) },
        measurements: measurements.map((m) => ({ assessed_at: iso(m.assessed_at), weight_kg: numOrNull(m.weight_kg), height_cm: numOrNull(m.height_cm), head_circumference_cm: numOrNull(m.head_circumference_cm), measured_lying: m.measured_lying })),
        pregnancy: pregnancy ? { lmp_date: iso(pregnancy.lmp_date), pre_pregnancy_weight_kg: Number(pregnancy.pre_pregnancy_weight_kg), height_cm: Number(pregnancy.height_cm) } : null,
        lactation: lactations.find((l) => l.status === 'active' && l.role === 'mother') ?? null,
        feeding: feeding.map(feedingOut),
      },
    });
  });

  // O responsável registra pelo app a introdução de um alergênico ou textura (e a reação).
  router.put('/me/patient/feeding/:kind/:item', async (req, res) => {
    const a = await appRecord(req, res);
    if (!a) return;
    if (!a.record || !a.visible) return res.status(404).json({ errors: [{ message: 'Acompanhamento não liberado.', extensions: { code: 'NOT_FOUND' } }] });
    try {
      const r = await saveFeeding(a.user, a.record, req.params.kind, req.params.item, req.body);
      if (r.errors) return bad(res, r.errors);
      await warnReaction(a.record, r.value);
      res.json({ data: r.value });
    } catch (error) {
      fail(res, error, 'registrar introdução alimentar pelo app');
    }
  });
}
