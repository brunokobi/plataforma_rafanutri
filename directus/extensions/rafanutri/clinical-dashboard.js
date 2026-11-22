// Painéis clínicos: visão geral de todos os pacientes do consultório e painel de cada paciente.
// Leitura agregada em poucas consultas (sem N+1); as regras de "precisa de atenção" ficam em funções puras, testadas
// em db/tests/extension-clinical-dashboard.test.mjs.
import { ATTENTION_REASONS, ATTENTION_RULES } from './catalogs.js';

const DAY = 864e5;
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
const ts = (d) => (d ? new Date(d).getTime() : null);
/** Data (AAAA-MM-DD) no horário de Brasília. */
const spDate = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const addDays = (day, k) => new Date(Date.parse(`${day}T12:00:00Z`) + k * DAY).toISOString().slice(0, 10);
const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Limites das regras de atenção (dias). */
export { ATTENTION_RULES };

export const REASONS = ATTENTION_REASONS;

function ageYears(birth, now) {
  if (!birth) return null;
  const b = new Date(`${iso(birth)}T12:00:00Z`);
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
}

/** Motivos de atenção de um paciente ativo. */
export function attentionReasons(r, now = new Date()) {
  const t = now.getTime();
  const out = [];
  const last = ts(r.last_visit_at);
  const next = ts(r.next_visit_at);
  if (!next) {
    // Mesma regra do CRM (/crm/returns) e dos indicadores: última consulta concluída + intervalo de retorno do paciente < hoje
    if (last && addDays(spDate(last), n(r.return_interval_days) ?? ATTENTION_RULES.defaultReturnDays) < spDate(now)) out.push('no_return');
    if (!last && ts(r.created_at) && t - ts(r.created_at) > ATTENTION_RULES.neverSeenGraceDays * DAY) out.push('never_seen');
  }
  if (r.plan_published_at) {
    const until = r.plan_valid_until ? ts(`${iso(r.plan_valid_until)}T23:59:59-03:00`) : null;
    if (until && until < t) out.push('plan_expired');
    else if (until && until - t <= ATTENTION_RULES.planExpiringDays * DAY) out.push('plan_expiring');
  } else if (last) {
    out.push('no_plan');
  }
  const la = r.last_assessment_on ? ts(`${iso(r.last_assessment_on)}T12:00:00Z`) : null;
  if (last && (!la || t - la > ATTENTION_RULES.noAssessmentDays * DAY)) out.push('no_assessment');
  if (r.risk_level === 'high') out.push('risk_high');
  if (n(r.pending_anamneses) > 0) out.push('pending_anamnesis');
  return out;
}

/** IMC por faixa: OMS para adultos (20 a 59 anos) e Lipschitz para idosos (60+), como classifyBmi do nutrition-core. */
const bmiBand = (b, age) => {
  if (b === null) return null;
  if (age >= 60) return b < 22 ? 'under' : b <= 27 ? 'normal' : 'over';
  return b < 18.5 ? 'under' : b < 25 ? 'normal' : b < 30 ? 'over' : 'obese';
};
const ageBand = (a) => (a === null ? 'unknown' : a < 10 ? 'child' : a < 20 ? 'teen' : a < 60 ? 'adult' : 'elderly');

/** Visão geral a partir das linhas por paciente (uma por paciente do consultório) e dos números de consultas. */
export function buildPatientsDashboard(rows, visits, now = new Date()) {
  const t = now.getTime();
  const active = rows.filter((r) => r.status === 'active');
  const counts = {
    active: active.length,
    inactive: rows.filter((r) => r.status === 'inactive').length,
    archived: rows.filter((r) => r.status === 'archived').length,
    new_30d: rows.filter((r) => ts(r.created_at) && t - ts(r.created_at) <= 30 * DAY).length,
    with_app: active.filter((r) => r.app_user_id).length,
    with_plan: active.filter((r) => r.plan_published_at).length,
  };
  // Variação de peso: entre a primeira e a última pesagem de quem tem 2 ou mais
  const tracked = active.filter((r) => n(r.weight_count) >= 2 && n(r.first_weight) && n(r.last_weight));
  const deltas = tracked.map((r) => n(r.last_weight) - n(r.first_weight));
  const weight = {
    tracked: tracked.length,
    mean_change_kg: deltas.length ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10 : null,
    losing: deltas.filter((d) => d < -0.5).length,
    stable: deltas.filter((d) => d >= -0.5 && d <= 0.5).length,
    gaining: deltas.filter((d) => d > 0.5).length,
  };
  const bmi = { under: 0, normal: 0, over: 0, obese: 0 };
  const ages = { child: 0, teen: 0, adult: 0, elderly: 0, unknown: 0 };
  const sex = { female: 0, male: 0, unknown: 0 };
  const risk = { low: 0, medium: 0, high: 0, none: 0 };
  for (const r of active) {
    const age = ageYears(r.birth_date, now);
    ages[ageBand(age)] += 1;
    sex[r.sex === 'female' || r.sex === 'male' ? r.sex : 'unknown'] += 1;
    risk[r.risk_level ?? 'none'] += 1;
    // IMC só de adultos e idosos (crianças e adolescentes usam as curvas da OMS)
    const band = age !== null && age >= 20 ? bmiBand(n(r.last_bmi), age) : null;
    if (band) bmi[band] += 1;
  }
  const attention = active
    .map((r) => ({ patient_id: r.id, full_name: r.full_name, reasons: attentionReasons(r, now), last_visit_at: r.last_visit_at ?? null, next_visit_at: r.next_visit_at ?? null }))
    .filter((a) => a.reasons.length)
    .sort((a, b) => b.reasons.length - a.reasons.length || a.full_name.localeCompare(b.full_name, 'pt-BR'));
  const byReason = Object.fromEntries(Object.keys(REASONS).map((k) => [k, attention.filter((a) => a.reasons.includes(k)).length]));
  return { counts, weight, bmi, ages, sex, risk, visits, attention: attention.slice(0, 300), by_reason: byReason };
}

/** Linha do tempo do paciente: eventos recentes de várias fontes, do mais novo para o mais antigo. */
export function mergeTimeline(groups, limit = 20) {
  return groups.flat().filter((e) => e.at).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export function setupClinicalDashboard({ router, database, logger, h }) {
  const { requireUser, isUuid, clinicalOrg } = h;

  router.get('/clinical/patients-dashboard', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const org = await clinicalOrg(user);
    if (!org) return res.status(403).json({ errors: [{ message: 'Só owner ou nutricionista vê o painel.', extensions: { code: 'FORBIDDEN' } }] });
    try {
      const [rowsQ, visitsQ] = await Promise.all([
        database.raw(`
          with p as (select id, full_name, sex, birth_date, created_at, status, app_user_id, return_interval_days from patients where organization_id = :org),
          lv as (select patient_id, max(starts_at) at from appointments where organization_id = :org and status = 'completed' group by 1),
          nv as (select patient_id, min(starts_at) at from appointments where organization_id = :org and status in ('scheduled', 'confirmed') and starts_at > now() group by 1),
          pl as (select patient_id, published_at, valid_until from meal_plans where organization_id = :org and status = 'published'),
          w as (
            select patient_id, weight_kg, results, assessed_at,
              row_number() over (partition by patient_id order by assessed_at desc, date_created desc) rd,
              row_number() over (partition by patient_id order by assessed_at, date_created) ra,
              count(*) over (partition by patient_id) cnt
            from anthropometric_assessments where organization_id = :org and weight_kg is not null),
          la as (select patient_id, max(assessed_at) at from anthropometric_assessments where organization_id = :org group by 1),
          sc as (select distinct on (patient_id) patient_id, risk_level from nutrition_screenings where organization_id = :org order by patient_id, screened_at desc),
          an as (select patient_id, count(*) cnt from anamneses where organization_id = :org and status = 'answered' group by 1)
          select p.*, lv.at last_visit_at, nv.at next_visit_at, pl.published_at plan_published_at, pl.valid_until plan_valid_until,
            wf.weight_kg first_weight, wl.weight_kg last_weight, wl.cnt weight_count, (wl.results ->> 'bmi')::numeric last_bmi,
            la.at last_assessment_on, sc.risk_level, an.cnt pending_anamneses
          from p
          left join lv on lv.patient_id = p.id
          left join nv on nv.patient_id = p.id
          left join pl on pl.patient_id = p.id
          left join w wf on wf.patient_id = p.id and wf.ra = 1
          left join w wl on wl.patient_id = p.id and wl.rd = 1
          left join la on la.patient_id = p.id
          left join sc on sc.patient_id = p.id
          left join an on an.patient_id = p.id`, { org }),
        database.raw(`
          select
            count(*) filter (where status = 'completed' and starts_at > now() - interval '30 days') completed_30d,
            count(*) filter (where status in ('scheduled', 'confirmed') and starts_at between now() and now() + interval '7 days') next_7d,
            count(*) filter (where status = 'no_show' and starts_at > now() - interval '90 days') no_show_90d,
            count(*) filter (where status in ('completed', 'no_show') and starts_at > now() - interval '90 days') closed_90d
          from appointments where organization_id = ?`, [org]),
      ]);
      const v = visitsQ.rows?.[0] ?? {};
      const visits = {
        completed_30d: Number(v.completed_30d ?? 0),
        next_7d: Number(v.next_7d ?? 0),
        no_show_rate_90d: Number(v.closed_90d) > 0 ? Math.round((Number(v.no_show_90d) / Number(v.closed_90d)) * 1000) / 10 : null,
      };
      res.json({ data: buildPatientsDashboard(rowsQ.rows ?? [], visits) });
    } catch (error) {
      logger.error(`clinical-dashboard: falha no painel geral: ${error?.message}`);
      res.status(500).json({ errors: [{ message: 'Não foi possível montar o painel agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    }
  });

  router.get('/patients/:id/dashboard', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const org = await clinicalOrg(user);
    if (!org || !isUuid(req.params.id)) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const patient = await database('patients').where({ id: req.params.id, organization_id: org })
      .first('id', 'full_name', 'sex', 'birth_date', 'created_at', 'status', 'app_user_id', 'app_activated_at');
    if (!patient) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const pid = patient.id;
    try {
      const [assessments, visits, plans, notes, anamneses, recs, pkg, screening, docs] = await Promise.all([
        database('anthropometric_assessments').where('patient_id', pid).orderBy('assessed_at').orderBy('date_created').limit(200)
          .select('id', 'assessed_at', 'weight_kg', 'waist_cm', 'results'),
        database('appointments').where('patient_id', pid).orderBy('starts_at', 'desc').limit(300).select('id', 'starts_at', 'status', 'type'),
        database('meal_plans').where('patient_id', pid).orderBy('date_created', 'desc').select('id', 'title', 'status', 'published_at', 'valid_until', 'totals', 'date_created'),
        database('clinical_notes').where('patient_id', pid).whereNull('supersedes_id').orderBy('date_created', 'desc').limit(50).select('id', 'date_created', 'signed_at'),
        database('anamneses').where('patient_id', pid).whereNot('status', 'cancelled').orderBy('date_created', 'desc').select('id', 'title', 'status', 'answered_at', 'date_created'),
        database('patient_recommendations').where({ patient_id: pid, status: 'published' }).select('id', 'read_at', 'published_at'),
        database('patient_packages').where({ patient_id: pid, status: 'active' }).orderBy('sold_at', 'desc').first('name', 'sessions_total', 'sessions_used', 'expires_at'),
        database('nutrition_screenings').where('patient_id', pid).orderBy('screened_at', 'desc').first('tool', 'classification', 'risk_level', 'screened_at').catch(() => null),
        database('clinical_documents').where('patient_id', pid).orderBy('date_created', 'desc').limit(50).select('id', 'title', 'status', 'published_at', 'date_created').catch(() => []),
      ]);
      const now = Date.now();
      const done = visits.filter((a) => a.status === 'completed');
      const upcoming = visits.filter((a) => ['scheduled', 'confirmed'].includes(a.status) && ts(a.starts_at) > now).sort((a, b) => ts(a.starts_at) - ts(b.starts_at));
      const published = plans.find((p) => p.status === 'published') ?? null;
      const series = assessments.map((a) => ({
        date: iso(a.assessed_at), weight_kg: n(a.weight_kg), bmi: n(a.results?.bmi), body_fat_pct: n(a.results?.body_fat_pct), waist_cm: n(a.waist_cm),
      }));
      const withWeight = series.filter((s) => s.weight_kg !== null);
      const timeline = mergeTimeline([
        assessments.map((a) => ({ kind: 'assessment', at: new Date(`${iso(a.assessed_at)}T12:00:00Z`).toISOString(), label: a.weight_kg ? `Avaliação: ${String(n(a.weight_kg)).replace('.', ',')} kg` : 'Avaliação' })),
        done.map((a) => ({ kind: 'visit', at: new Date(a.starts_at).toISOString(), label: a.type === 'first' ? 'Primeira consulta' : 'Consulta de retorno' })),
        visits.filter((a) => a.status === 'no_show').map((a) => ({ kind: 'no_show', at: new Date(a.starts_at).toISOString(), label: 'Faltou à consulta' })),
        plans.filter((p) => p.published_at).map((p) => ({ kind: 'plan', at: new Date(p.published_at).toISOString(), label: `Plano publicado: ${p.title}` })),
        notes.map((x) => ({ kind: 'note', at: new Date(x.date_created).toISOString(), label: x.signed_at ? 'Evolução assinada' : 'Evolução registrada' })),
        anamneses.filter((x) => x.answered_at).map((x) => ({ kind: 'anamnesis', at: new Date(x.answered_at).toISOString(), label: `Anamnese respondida${x.title ? `: ${x.title}` : ''}` })),
        screening ? [{ kind: 'screening', at: new Date(screening.screened_at).toISOString(), label: 'Triagem nutricional' }] : [],
        docs.filter((d) => d.published_at).map((d) => ({ kind: 'document', at: new Date(d.published_at).toISOString(), label: `Documento: ${d.title}` })),
      ]);
      res.json({
        data: {
          patient: { id: pid, created_at: patient.created_at, status: patient.status },
          series,
          weight: withWeight.length
            ? { first: withWeight[0], last: withWeight.at(-1), change_kg: withWeight.length > 1 ? Math.round((withWeight.at(-1).weight_kg - withWeight[0].weight_kg) * 10) / 10 : null }
            : null,
          visits: {
            completed: done.length,
            no_show: visits.filter((a) => a.status === 'no_show').length,
            first_at: done.at(-1)?.starts_at ?? null,
            last_at: done[0]?.starts_at ?? null,
            next_at: upcoming[0]?.starts_at ?? null,
            days_since_last: done[0] ? Math.floor((now - ts(done[0].starts_at)) / DAY) : null,
          },
          plan: {
            published: published ? { id: published.id, title: published.title, published_at: published.published_at, valid_until: iso(published.valid_until), days_left: published.valid_until ? Math.ceil((ts(`${iso(published.valid_until)}T23:59:59-03:00`) - now) / DAY) : null, kcal: n(published.totals?.energy_kcal) } : null,
            versions: plans.filter((p) => p.published_at).length,
            drafts: plans.filter((p) => p.status === 'draft').length,
          },
          notes: { count: notes.length, last_at: notes[0]?.date_created ?? null },
          anamneses: { answered_pending: anamneses.filter((x) => x.status === 'answered').length, sent: anamneses.filter((x) => x.status === 'sent').length, total: anamneses.length },
          recommendations: { published: recs.length, unread: recs.filter((r) => !r.read_at).length },
          package: pkg ? { name: pkg.name, remaining: pkg.sessions_total - pkg.sessions_used, total: pkg.sessions_total, expires_at: iso(pkg.expires_at) } : null,
          app: { linked: Boolean(patient.app_user_id), activated_at: patient.app_activated_at },
          screening: screening ?? null,
          documents: docs.filter((d) => d.published_at).length,
          timeline,
        },
      });
    } catch (error) {
      logger.error(`clinical-dashboard: falha no painel do paciente: ${error?.message}`);
      res.status(500).json({ errors: [{ message: 'Não foi possível montar o painel agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    }
  });
}
