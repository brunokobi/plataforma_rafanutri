// Acompanhamento em casa (0072): perfil, peso registrado pelo paciente, água com lembretes, metas e refeições feitas.
// O paciente vê e registra pela área do paciente; o nutricionista vê tudo na ficha, cria as metas e a meta de água.
// "O que o paciente vê" (patient_share) liga cada parte; weight_neutral esconde números de peso (transtorno alimentar).
import { allQuestions } from './forms.js';

export const TZ = 'America/Sao_Paulo';
export const WATER_ML_PER_KG = 35;
export const REMINDER_STEPS = [60, 90, 120, 180, 240];

/** Data local (São Paulo) no formato AAAA-MM-DD. */
export const localDay = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
/** "HH:MM" local (São Paulo). */
export const localTime = (d = new Date()) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

export function ageYears(birth, now = new Date()) {
  if (!birth) return null;
  const b = new Date(`${String(birth instanceof Date ? birth.toISOString() : birth).slice(0, 10)}T12:00:00Z`);
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) a -= 1;
  return a >= 0 && a < 130 ? a : null;
}

/** IMC e faixa da OMS para adulto (≥ 20 anos). Criança e adolescente: só o número (a curva fica no materno-infantil). */
export function bmiOf(weightKg, heightCm, age) {
  const w = Number(weightKg), h = Number(heightCm) / 100;
  if (!w || !h || h < 0.4) return null;
  const bmi = Math.round((w / (h * h)) * 10) / 10;
  if (age !== null && age < 20) return { bmi, class: null, label: 'Para menores de 20 anos, o IMC é lido na curva por idade.' };
  const cls = bmi < 18.5 ? ['underweight', 'Baixo peso'] : bmi < 25 ? ['normal', 'Peso adequado'] : bmi < 30 ? ['overweight', 'Sobrepeso'] : bmi < 35 ? ['obesity_1', 'Obesidade grau I'] : bmi < 40 ? ['obesity_2', 'Obesidade grau II'] : ['obesity_3', 'Obesidade grau III'];
  return { bmi, class: cls[0], label: cls[1] };
}

/** Meta de água: a do nutricionista; sem ela, 35 ml/kg (arredondado a 50 ml), entre 1,5 e 4 litros. */
export function waterGoal(goalMl, weightKg) {
  if (goalMl) return { ml: goalMl, source: 'professional' };
  if (weightKg) return { ml: Math.min(4000, Math.max(1500, Math.round((Number(weightKg) * WATER_ML_PER_KG) / 50) * 50)), source: 'weight' };
  return { ml: 2000, source: 'default' };
}

/** Dias seguidos (até ontem, mais hoje se já bateu) com a meta de água batida. byDay: Map dia → ml. */
export function waterStreak(byDay, goal, today = localDay()) {
  let n = 0;
  const d = new Date(`${today}T12:00:00Z`);
  if ((byDay.get(today) ?? 0) >= goal) n += 1;
  for (;;) {
    d.setUTCDate(d.getUTCDate() - 1);
    const k = d.toISOString().slice(0, 10);
    if ((byDay.get(k) ?? 0) >= goal) n += 1; else break;
  }
  return n;
}

const ED = /anorex|bulimi|transtorno(s)? alimentar|\btca\b|purgac|vomito(s)? provocad|compuls(ao|ivo|iva) alimentar|\btcap\b/;
const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Sinais de transtorno alimentar no objetivo e na anamnese mais recente (respostas "sim" pelo rótulo e textos abertos). */
export function edSignals(objective, anamnesis) {
  const parts = [objective ?? ''];
  if (anamnesis?.schema_snapshot && anamnesis.answers) {
    for (const q of allQuestions(anamnesis.schema_snapshot)) {
      const v = anamnesis.answers[q.id];
      if (v === true || (typeof v === 'string' && /^sim\.?$/i.test(v.trim()))) parts.push(q.label);
      else if (typeof v === 'string') parts.push(v);
      else if (Array.isArray(v)) parts.push(v.join(' '));
    }
  }
  return ED.test(fold(parts.join(' | ')));
}

/** Validações de entrada. */
export function parseWeight(v) {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n >= 2 && n <= 400 ? Math.round(n * 100) / 100 : null;
}
export function parseMeasuredAt(v, now = new Date()) {
  if (v === undefined || v === null || v === '') return now;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > now.getTime() + 5 * 60e3) return null;
  if (d.getTime() < now.getTime() - 60 * 864e5) return null; // até 60 dias atrás
  return d;
}
export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
export const isHHMM = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Hora de mandar o lembrete de água? (janela do dia, intervalo desde o último e meta ainda não batida) */
export function reminderDue({ start, end, everyMin, lastAt, todayMl, goalMl, now = new Date() }) {
  const t = localTime(now);
  if (t < String(start).slice(0, 5) || t > String(end).slice(0, 5)) return false;
  if (todayMl >= goalMl) return false;
  if (lastAt && now.getTime() - new Date(lastAt).getTime() < everyMin * 60e3 - 30e3) return false;
  return true;
}

function daysBack(n, today = localDay()) {
  const out = [];
  const d = new Date(`${today}T12:00:00Z`);
  for (let i = n - 1; i >= 0; i -= 1) {
    const x = new Date(d); x.setUTCDate(d.getUTCDate() - i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

export function setupTracking({ router, database, logger, notifier, h }) {
  const { requireUser, bad, conflict, isUuid, clinicalOrg, myPatientRecord, withActor } = h;
  const notFound = (res, m = 'Paciente não encontrado.') => res.status(404).json({ errors: [{ message: m, extensions: { code: 'NOT_FOUND' } }] });
  const off = (res, m) => res.status(403).json({ errors: [{ message: m, extensions: { code: 'NOT_SHARED' } }] });
  const failed = (res, error, what) => {
    logger.error({ err: error?.message }, `rafanutri: falha em ${what}`);
    res.status(500).json({ errors: [{ message: 'Não foi possível concluir agora. Tente de novo em instantes.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
  };
  const dayExpr = (col) => database.raw(`(${col} at time zone '${TZ}')::date`);

  async function shareFor(patientId) {
    const r = await database.raw('select patient_share(?) as s, (select share_settings from patients where id = ?) as own', [patientId, patientId]);
    return { s: r.rows?.[0]?.s ?? {}, own: r.rows?.[0]?.own ?? null };
  }

  async function latestAnamnesis(patientId) {
    return database('anamneses').where({ patient_id: patientId }).whereIn('status', ['answered', 'reviewed']).orderBy('answered_at', 'desc').first('answers', 'schema_snapshot');
  }

  /** O que vale para o paciente, com o modo sem peso automático quando há sinal de transtorno alimentar. */
  async function effectiveShare(p) {
    const { s, own } = await shareFor(p.id);
    const ed = edSignals(p.objective, await latestAnamnesis(p.id));
    const neutral = own && typeof own.weight_neutral === 'boolean' ? own.weight_neutral : (s.weight_neutral === true || ed);
    return {
      show_body: s.show_body !== false && !neutral,
      self_weight: s.self_weight !== false && !neutral,
      show_weight_history: s.show_weight_history === true && !neutral,
      water: s.water !== false,
      goals: s.goals !== false,
      meal_checks: s.meal_checks !== false,
      weight_neutral: neutral,
      ed_detected: ed,
    };
  }

  /** Painel completo de um paciente. forPatient: aplica o que o paciente pode ver. */
  async function dashboard(p, { forPatient }) {
    const share = await effectiveShare(p);
    const today = localDay();
    const age = ageYears(p.birth_date);
    const last = await database('anthropometric_assessments').where({ patient_id: p.id }).orderBy('assessed_at', 'desc').orderBy('date_created', 'desc')
      .first('assessed_at', 'weight_kg', 'height_cm', 'waist_cm', 'hip_cm', 'results');
    const height = last?.height_cm ? Number(last.height_cm)
      : Number((await database('anthropometric_assessments').where({ patient_id: p.id }).whereNotNull('height_cm').orderBy('assessed_at', 'desc').first('height_cm'))?.height_cm ?? 0) || null;
    const selfLogs = await database('patient_weight_logs').where({ patient_id: p.id })
      .where('measured_at', '>', database.raw("now() - interval '400 days'")).orderBy('measured_at', 'asc')
      .select('id', 'weight_kg', 'measured_at', 'note', 'created_by');
    const clinic = await database('anthropometric_assessments').where({ patient_id: p.id }).whereNotNull('weight_kg').orderBy('assessed_at', 'asc').select('assessed_at', 'weight_kg');
    const lastSelf = selfLogs.at(-1);
    const lastClinic = clinic.at(-1);
    const lastSelfDay = lastSelf ? localDay(lastSelf.measured_at) : null;
    const lastClinicDay = lastClinic ? String(lastClinic.assessed_at instanceof Date ? lastClinic.assessed_at.toISOString() : lastClinic.assessed_at).slice(0, 10) : null;
    const current = lastSelf && (!lastClinicDay || lastSelfDay >= lastClinicDay)
      ? { weight_kg: Number(lastSelf.weight_kg), at: lastSelf.measured_at, source: 'patient' }
      : lastClinic ? { weight_kg: Number(lastClinic.weight_kg), at: lastClinicDay, source: 'clinic' } : null;

    const r = last?.results ?? {};
    const body = {
      height_cm: height,
      weight: current,
      bmi: current && height ? bmiOf(current.weight_kg, height, age) : null,
      last_assessment: last ? {
        date: String(last.assessed_at instanceof Date ? last.assessed_at.toISOString() : last.assessed_at).slice(0, 10),
        weight_kg: last.weight_kg !== null ? Number(last.weight_kg) : null,
        waist_cm: last.waist_cm !== null ? Number(last.waist_cm) : null,
        hip_cm: last.hip_cm !== null ? Number(last.hip_cm) : null,
        whtr: typeof r.whtr === 'number' ? r.whtr : null,
        body_fat_pct: typeof r.body_fat_pct === 'number' ? r.body_fat_pct : typeof r.fat_pct === 'number' ? r.fat_pct : null,
        lean_mass_kg: typeof r.lean_mass_kg === 'number' ? r.lean_mass_kg : null,
      } : null,
    };

    const goals = await database('patient_goals').where({ patient_id: p.id, active: true }).orderBy('created_at')
      .select('id', 'title', 'details', 'kind', 'frequency', 'times_per_week', 'target_weight_kg', 'created_at');
    const checks = goals.length
      ? await database('patient_goal_checks').whereIn('goal_id', goals.map((g) => g.id)).where('day', '>=', daysBack(35, today)[0]).select('goal_id', 'day')
      : [];
    const checksOf = new Map();
    for (const c of checks) {
      const k = String(c.day instanceof Date ? c.day.toISOString() : c.day).slice(0, 10);
      checksOf.set(c.goal_id, [...(checksOf.get(c.goal_id) ?? []), k]);
    }
    const weightGoal = goals.find((g) => g.kind === 'weight');

    const habits = await database('patient_habit_settings').where({ patient_id: p.id }).first();
    const goal = waterGoal(habits?.water_goal_ml ?? null, current?.weight_kg ?? null);
    const days30 = daysBack(30, today);
    const water = await database('patient_water_logs').where({ patient_id: p.id }).where('logged_at', '>', database.raw("now() - interval '32 days'"))
      .select('id', 'amount_ml', 'logged_at').orderBy('logged_at');
    const byDay = new Map();
    for (const w of water) byDay.set(localDay(w.logged_at), (byDay.get(localDay(w.logged_at)) ?? 0) + w.amount_ml);

    const plan = await database('meal_plans').where({ patient_id: p.id, status: 'published' }).first('id', 'meals');
    let meals = null;
    if (plan) {
      const mc = await database('patient_meal_checks').where({ patient_id: p.id, plan_id: plan.id }).where('day', '>=', daysBack(14, today)[0]).select('meal_id', 'day');
      const list = (plan.meals ?? []).map((m) => ({ id: String(m.id), name: m.name, time: m.time ?? null }));
      const perDay = new Map();
      for (const c of mc) { const k = String(c.day instanceof Date ? c.day.toISOString() : c.day).slice(0, 10); perDay.set(k, [...(perDay.get(k) ?? []), c.meal_id]); }
      meals = { plan_id: plan.id, meals: list, today: perDay.get(today) ?? [], last14: daysBack(14, today).map((d) => ({ day: d, done: (perDay.get(d) ?? []).length, total: list.length })) };
    }

    const nextAppt = await database('appointments').where({ patient_id: p.id }).whereIn('status', ['scheduled', 'confirmed']).where('starts_at', '>', database.fn.now()).orderBy('starts_at').first('starts_at', 'mode');
    const lastAppt = await database('appointments').where({ patient_id: p.id, status: 'completed' }).orderBy('starts_at', 'desc').first('starts_at');
    const lastActivity = [lastSelf?.created_at, water.at(-1)?.logged_at].filter(Boolean).map((d) => new Date(d).getTime());

    const out = {
      patient_id: p.id,
      share,
      today,
      profile: { name: p.full_name, first_name: p.full_name.trim().split(/\s+/)[0], age, sex: p.sex, birth_date: p.birth_date, objective: p.objective, care_profile: p.care_profile ?? null },
      body,
      weight: {
        logs: selfLogs.map((l) => ({ id: l.id, weight_kg: Number(l.weight_kg), measured_at: l.measured_at, note: l.note, by_patient: l.created_by === p.app_user_id })),
        clinic: clinic.map((c) => ({ date: String(c.assessed_at instanceof Date ? c.assessed_at.toISOString() : c.assessed_at).slice(0, 10), weight_kg: Number(c.weight_kg) })),
        target_kg: weightGoal?.target_weight_kg ? Number(weightGoal.target_weight_kg) : null,
      },
      water: {
        goal_ml: goal.ml, goal_source: goal.source, professional_goal_ml: habits?.water_goal_ml ?? null,
        today_ml: byDay.get(today) ?? 0,
        today_logs: water.filter((w) => localDay(w.logged_at) === today).map((w) => ({ id: w.id, amount_ml: w.amount_ml, logged_at: w.logged_at })),
        days: days30.map((d) => ({ day: d, ml: byDay.get(d) ?? 0 })),
        streak: waterStreak(byDay, goal.ml, today),
        reminders: { on: habits?.water_reminders ?? false, every_min: habits?.reminder_every_min ?? 120, start: String(habits?.reminder_start ?? '08:00').slice(0, 5), end: String(habits?.reminder_end ?? '20:00').slice(0, 5) },
      },
      goals: goals.map((g) => {
        const days = checksOf.get(g.id) ?? [];
        const week = daysBack(7, today);
        return {
          id: g.id, title: g.title, details: g.details, kind: g.kind, frequency: g.frequency, times_per_week: g.times_per_week,
          target_weight_kg: g.target_weight_kg !== null ? Number(g.target_weight_kg) : null,
          done_today: days.includes(today), done_week: days.filter((d) => week.includes(d)).length, days,
        };
      }),
      meals,
      appointments: { next: nextAppt ?? null, last: lastAppt?.starts_at ?? null },
      last_activity_at: lastActivity.length ? new Date(Math.max(...lastActivity)).toISOString() : null,
    };
    if (forPatient) {
      if (!share.show_body) { out.body = { height_cm: share.weight_neutral ? null : body.height_cm, weight: null, bmi: null, last_assessment: null }; }
      if (share.weight_neutral) { out.weight = { logs: [], clinic: [], target_kg: null }; out.goals = out.goals.filter((g) => g.kind !== 'weight'); }
      else {
        if (!share.self_weight) out.weight.logs = [];
        if (!share.show_weight_history) out.weight.clinic = [];
      }
      if (!share.water) out.water = null;
      if (!share.goals) out.goals = [];
      if (!share.meal_checks) out.meals = null;
    }
    return out;
  }

  // ── Paciente ────────────────────────────────────────────────────────────────────────────
  const PCOLS = ['id', 'organization_id', 'full_name', 'birth_date', 'sex', 'objective', 'care_profile', 'app_user_id', 'status'];
  async function me(req, res) {
    const user = requireUser(req, res);
    if (!user) return null;
    const c = isUuid(req.query?.c) ? req.query.c : isUuid(req.body?.c) ? req.body.c : null;
    const rec = await myPatientRecord(user, c);
    if (!rec) { notFound(res); return null; }
    const p = await database('patients').where('id', rec.id).first(PCOLS);
    return { user, p };
  }

  router.get('/me/patient/tracking', async (req, res) => {
    try {
      const ctx = await me(req, res);
      if (!ctx) return;
      res.json({ data: await dashboard(ctx.p, { forPatient: true }) });
    } catch (error) { failed(res, error, 'GET /me/patient/tracking'); }
  });

  router.post('/me/patient/weight', async (req, res) => {
    try {
      const ctx = await me(req, res);
      if (!ctx) return;
      const share = await effectiveShare(ctx.p);
      if (!share.self_weight) return off(res, 'O registro de peso não está liberado pelo seu nutricionista.');
      const w = parseWeight(req.body?.weight_kg);
      if (w === null) return bad(res, { weight_kg: 'Informe o peso em kg (por exemplo, 72,4).' });
      const at = parseMeasuredAt(req.body?.measured_at);
      if (!at) return bad(res, { measured_at: 'Escolha um dia e horário dos últimos 60 dias, sem ser no futuro.' });
      const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 200) || null : null;
      const [row] = await database('patient_weight_logs').insert({ organization_id: ctx.p.organization_id, patient_id: ctx.p.id, weight_kg: w, measured_at: at, note, created_by: ctx.user })
        .returning(['id', 'weight_kg', 'measured_at', 'note']);
      res.status(201).json({ data: { ...row, weight_kg: Number(row.weight_kg) } });
    } catch (error) { failed(res, error, 'POST /me/patient/weight'); }
  });

  router.delete('/me/patient/weight/:id', async (req, res) => {
    try {
      const ctx = await me(req, res);
      if (!ctx) return;
      if (!isUuid(req.params.id)) return notFound(res, 'Pesagem não encontrada.');
      const n = await database('patient_weight_logs').where({ id: req.params.id, patient_id: ctx.p.id, created_by: ctx.user }).del();
      if (!n) return notFound(res, 'Pesagem não encontrada.');
      res.json({ data: { ok: true } });
    } catch (error) { failed(res, error, 'DELETE /me/patient/weight'); }
  });

  router.post('/me/patient/water', async (req, res) => {
    try {
      const ctx = await me(req, res);
      if (!ctx) return;
      if (!(await effectiveShare(ctx.p)).water) return off(res, 'O registro de água não está liberado.');
      const ml = Number(req.body?.amount_ml);
      if (!Number.isInteger(ml) || ml < 20 || ml > 3000) return bad(res, { amount_ml: 'Informe entre 20 e 3.000 ml.' });
      const [row] = await database('patient_water_logs').insert({ organization_id: ctx.p.organization_id, patient_id: ctx.p.id, amount_ml: ml }).returning(['id', 'amount_ml', 'logged_at']);
      res.status(201).json({ data: row });
    } catch (error) { failed(res, error, 'POST /me/patient/water'); }
  });

  router.delete('/me/patient/water/:id', async (req, res) => {
    try {
      const ctx = await me(req, res);
      if (!ctx) return;
      if (!isUuid(req.params.id)) return notFound(res, 'Registro não encontrado.');
      const n = await database('patient_water_logs').where({ id: req.params.id, patient_id: ctx.p.id }).where('logged_at', '>', database.raw("now() - interval '2 days'")).del();
      if (!n) return notFound(res, 'Registro não encontrado.');
      res.json({ data: { ok: true } });
    } catch (error) { failed(res, error, 'DELETE /me/patient/water'); }
  });

  router.put('/me/patient/water/settings', async (req, res) => {
    try {
      const ctx = await me(req, res);
      if (!ctx) return;
      const b = req.body ?? {};
      if (typeof b.on !== 'boolean' || !REMINDER_STEPS.includes(Number(b.every_min)) || !isHHMM(b.start) || !isHHMM(b.end) || b.end <= b.start) {
        return bad(res, { _: 'Escolha o intervalo e um horário de início antes do fim.' });
      }
      await database('patient_habit_settings')
        .insert({ patient_id: ctx.p.id, organization_id: ctx.p.organization_id, water_reminders: b.on, reminder_every_min: Number(b.every_min), reminder_start: b.start, reminder_end: b.end })
        .onConflict('patient_id').merge({ water_reminders: b.on, reminder_every_min: Number(b.every_min), reminder_start: b.start, reminder_end: b.end, updated_at: database.fn.now() });
      const tg = await database('patient_contact_prefs').where('patient_id', ctx.p.id).first('telegram_chat_id', 'telegram_opt_in');
      res.json({ data: { ok: true, telegram: Boolean(tg?.telegram_chat_id && tg.telegram_opt_in !== false) } });
    } catch (error) { failed(res, error, 'PUT /me/patient/water/settings'); }
  });

  router.post('/me/patient/goals/:id/check', async (req, res) => {
    try {
      const ctx = await me(req, res);
      if (!ctx) return;
      if (!(await effectiveShare(ctx.p)).goals) return off(res, 'As metas não estão liberadas.');
      const g = isUuid(req.params.id) ? await database('patient_goals').where({ id: req.params.id, patient_id: ctx.p.id, active: true }).first('id', 'kind') : null;
      if (!g || g.kind !== 'habit') return notFound(res, 'Meta não encontrada.');
      const today = localDay();
      const day = isDay(req.body?.day) ? req.body.day : today;
      if (day > today || day < daysBack(7, today)[0]) return bad(res, { day: 'Marque um dia desta semana.' });
      if (req.body?.done === false) await database('patient_goal_checks').where({ goal_id: g.id, day }).del();
      else await database('patient_goal_checks').insert({ goal_id: g.id, day }).onConflict(['goal_id', 'day']).ignore();
      res.json({ data: { ok: true, day, done: req.body?.done !== false } });
    } catch (error) { failed(res, error, 'POST /me/patient/goals/:id/check'); }
  });

  router.post('/me/patient/meals/check', async (req, res) => {
    try {
      const ctx = await me(req, res);
      if (!ctx) return;
      if (!(await effectiveShare(ctx.p)).meal_checks) return off(res, 'O registro de refeições não está liberado.');
      const b = req.body ?? {};
      const plan = isUuid(b.plan_id) ? await database('meal_plans').where({ id: b.plan_id, patient_id: ctx.p.id, status: 'published' }).first('id', 'meals') : null;
      const mealId = typeof b.meal_id === 'string' ? b.meal_id.slice(0, 64) : '';
      if (!plan || !(plan.meals ?? []).some((m) => String(m.id) === mealId)) return notFound(res, 'Refeição não encontrada no plano.');
      const today = localDay();
      const day = isDay(b.day) ? b.day : today;
      if (day > today || day < daysBack(3, today)[0]) return bad(res, { day: 'Marque hoje ou os últimos dias.' });
      const key = { patient_id: ctx.p.id, plan_id: plan.id, meal_id: mealId, day };
      if (b.done === false) await database('patient_meal_checks').where(key).del();
      else await database('patient_meal_checks').insert(key).onConflict(['patient_id', 'plan_id', 'meal_id', 'day']).ignore();
      res.json({ data: { ok: true } });
    } catch (error) { failed(res, error, 'POST /me/patient/meals/check'); }
  });

  // ── Nutricionista ───────────────────────────────────────────────────────────────────────
  async function pro(req, res) {
    const user = requireUser(req, res);
    if (!user) return null;
    const org = await clinicalOrg(user);
    if (!org || !isUuid(req.params.id)) { notFound(res); return null; }
    const p = await database('patients').where({ id: req.params.id, organization_id: org }).first(PCOLS);
    if (!p) { notFound(res); return null; }
    return { user, org, p };
  }

  router.get('/patients/:id/tracking', async (req, res) => {
    try {
      const ctx = await pro(req, res);
      if (!ctx) return;
      res.json({ data: await dashboard(ctx.p, { forPatient: false }) });
    } catch (error) { failed(res, error, 'GET /patients/:id/tracking'); }
  });

  router.post('/patients/:id/goals', async (req, res) => {
    try {
      const ctx = await pro(req, res);
      if (!ctx) return;
      const b = req.body ?? {};
      const title = typeof b.title === 'string' ? b.title.trim() : '';
      const kind = b.kind === 'weight' ? 'weight' : 'habit';
      const errors = {};
      if (title.length < 2 || title.length > 120) errors.title = 'Escreva a meta (2 a 120 caracteres).';
      const frequency = b.frequency === 'weekly' ? 'weekly' : 'daily';
      const times = frequency === 'weekly' ? Number(b.times_per_week) : null;
      if (frequency === 'weekly' && (!Number.isInteger(times) || times < 1 || times > 7)) errors.times_per_week = 'Quantas vezes por semana (1 a 7)?';
      const target = kind === 'weight' ? parseWeight(b.target_weight_kg) : null;
      if (kind === 'weight' && target === null) errors.target_weight_kg = 'Informe o peso-alvo em kg.';
      if (Object.keys(errors).length) return bad(res, errors);
      if (kind === 'weight') await database('patient_goals').where({ patient_id: ctx.p.id, kind: 'weight', active: true }).update({ active: false, archived_at: database.fn.now() });
      const details = typeof b.details === 'string' ? b.details.trim().slice(0, 500) || null : null;
      const [row] = await database('patient_goals').insert({
        organization_id: ctx.org, patient_id: ctx.p.id, title, details, kind, frequency: kind === 'weight' ? 'daily' : frequency,
        times_per_week: kind === 'weight' ? null : times, target_weight_kg: target, created_by: ctx.user,
      }).returning(['id']);
      res.status(201).json({ data: { id: row.id } });
    } catch (error) { failed(res, error, 'POST /patients/:id/goals'); }
  });

  router.delete('/patients/:id/goals/:goalId', async (req, res) => {
    try {
      const ctx = await pro(req, res);
      if (!ctx) return;
      if (!isUuid(req.params.goalId)) return notFound(res, 'Meta não encontrada.');
      const n = await database('patient_goals').where({ id: req.params.goalId, patient_id: ctx.p.id, active: true }).update({ active: false, archived_at: database.fn.now() });
      if (!n) return notFound(res, 'Meta não encontrada.');
      res.json({ data: { ok: true } });
    } catch (error) { failed(res, error, 'DELETE /patients/:id/goals'); }
  });

  router.put('/patients/:id/water-goal', async (req, res) => {
    try {
      const ctx = await pro(req, res);
      if (!ctx) return;
      const v = req.body?.water_goal_ml;
      const ml = v === null || v === '' || v === undefined ? null : Number(v);
      if (ml !== null && (!Number.isInteger(ml) || ml < 500 || ml > 6000)) return bad(res, { water_goal_ml: 'Entre 500 e 6.000 ml, ou vazio para calcular pelo peso.' });
      await database('patient_habit_settings').insert({ patient_id: ctx.p.id, organization_id: ctx.org, water_goal_ml: ml })
        .onConflict('patient_id').merge({ water_goal_ml: ml, updated_at: database.fn.now() });
      res.json({ data: { water_goal_ml: ml } });
    } catch (error) { failed(res, error, 'PUT /patients/:id/water-goal'); }
  });

  // ── Lembrete de água (ciclo do avisador, a cada minuto) ───────────────────────────────────
  async function cycle() {
    const rows = await database('patient_habit_settings as h').join('patients as p', 'p.id', 'h.patient_id')
      .join('patient_contact_prefs as c', 'c.patient_id', 'h.patient_id')
      .where('h.water_reminders', true).where('p.status', 'active').whereNotNull('p.app_user_id')
      .whereNotNull('c.telegram_chat_id').whereNot('c.telegram_opt_in', false)
      .select('h.patient_id', 'h.organization_id', 'h.water_goal_ml', 'h.reminder_every_min', 'h.reminder_start', 'h.reminder_end', 'h.last_reminder_at');
    if (!rows.length) return;
    const today = localDay();
    for (const r of rows) {
      try {
        const share = (await shareFor(r.patient_id)).s;
        if (share.water === false) continue;
        const sum = await database('patient_water_logs').where('patient_id', r.patient_id).where(dayExpr('logged_at'), today).sum({ ml: 'amount_ml' }).first();
        const w = await database('patient_weight_logs').where('patient_id', r.patient_id).orderBy('measured_at', 'desc').first('weight_kg')
          ?? await database('anthropometric_assessments').where('patient_id', r.patient_id).whereNotNull('weight_kg').orderBy('assessed_at', 'desc').first('weight_kg');
        const goal = waterGoal(r.water_goal_ml, w?.weight_kg ?? null).ml;
        const todayMl = Number(sum?.ml ?? 0);
        if (!reminderDue({ start: r.reminder_start, end: r.reminder_end, everyMin: r.reminder_every_min, lastAt: r.last_reminder_at, todayMl, goalMl: goal })) continue;
        await database('patient_habit_settings').where('patient_id', r.patient_id).update({ last_reminder_at: database.fn.now() });
        await notifier.enqueuePatient({
          orgId: r.organization_id, patientId: r.patient_id, kind: 'water_reminder', important: false,
          dedupe: `water:${r.patient_id}:${today}:${localTime().slice(0, 4)}`,
          ctx: { todayMl, goalMl: goal, link: `${notifier.site}/p/acompanhar` },
        });
      } catch (error) {
        logger.warn({ err: error?.message }, 'rafanutri: falha no lembrete de água');
      }
    }
  }
  if (notifier?.addCycle) notifier.addCycle(cycle);
  void withActor; void conflict;
}
