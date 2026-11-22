// Testes das regras dos painéis clínicos.
// Uso: node --test db/tests/extension-clinical-dashboard.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attentionReasons, buildPatientsDashboard, mergeTimeline } from '../../directus/extensions/rafanutri/clinical-dashboard.js';

const now = new Date('2026-11-22T12:00:00Z');
const daysAgo = (d) => new Date(now.getTime() - d * 864e5).toISOString();
const base = { id: 'p', full_name: 'Ana', status: 'active', created_at: daysAgo(200), birth_date: '1990-01-01', sex: 'female' };

test('motivos de atenção', () => {
  // Atendido há 60 dias, sem retorno, sem plano e sem avaliação
  assert.deepEqual(attentionReasons({ ...base, last_visit_at: daysAgo(60) }, now), ['no_return', 'no_plan', 'no_assessment']);
  // Com retorno marcado e plano válido: nada
  assert.deepEqual(attentionReasons({ ...base, last_visit_at: daysAgo(60), next_visit_at: daysAgo(-3), plan_published_at: daysAgo(30), plan_valid_until: '2027-03-01', last_assessment_on: daysAgo(30).slice(0, 10) }, now), []);
  // Nunca atendido, cadastrado há 20 dias
  assert.deepEqual(attentionReasons({ ...base, created_at: daysAgo(20) }, now), ['never_seen']);
  // Cadastrado ontem: ainda no prazo
  assert.deepEqual(attentionReasons({ ...base, created_at: daysAgo(1) }, now), []);
  // Plano vencido e vencendo
  assert.ok(attentionReasons({ ...base, next_visit_at: daysAgo(-1), plan_published_at: daysAgo(90), plan_valid_until: '2026-11-01' }, now).includes('plan_expired'));
  assert.ok(attentionReasons({ ...base, next_visit_at: daysAgo(-1), plan_published_at: daysAgo(90), plan_valid_until: '2026-11-30' }, now).includes('plan_expiring'));
  // Risco alto e anamnese para revisar
  assert.deepEqual(attentionReasons({ ...base, created_at: daysAgo(1), risk_level: 'high', pending_anamneses: '2' }, now), ['risk_high', 'pending_anamnesis']);
});

test('visão geral: contagens, peso, IMC só de adultos, faixas e lista de atenção', () => {
  const rows = [
    { ...base, id: 'a', full_name: 'Bia', first_weight: 80, last_weight: 76, weight_count: 3, last_bmi: 27.1, app_user_id: 'u', created_at: daysAgo(10) },
    { ...base, id: 'b', full_name: 'Caio', sex: 'male', first_weight: 70, last_weight: 70.3, weight_count: 2, last_bmi: 22, last_visit_at: daysAgo(60) },
    { ...base, id: 'c', full_name: 'Duda', birth_date: '2018-05-01', last_bmi: 16, plan_published_at: daysAgo(5) },
    { ...base, id: 'd', full_name: 'Eva', status: 'archived' },
  ];
  const d = buildPatientsDashboard(rows, { completed_30d: 4 }, now);
  assert.deepEqual(d.counts, { active: 3, inactive: 0, archived: 1, new_30d: 1, with_app: 1, with_plan: 1 });
  assert.deepEqual(d.weight, { tracked: 2, mean_change_kg: -1.9, losing: 1, stable: 1, gaining: 0 });
  assert.deepEqual(d.bmi, { under: 0, normal: 1, over: 1, obese: 0 });
  assert.equal(d.ages.child, 1);
  assert.deepEqual(d.sex, { female: 2, male: 1, unknown: 0 });
  assert.equal(d.attention[0].full_name, 'Caio');
  assert.equal(d.by_reason.no_return, 1);
  assert.equal(d.visits.completed_30d, 4);
});

test('linha do tempo: mais novo primeiro, sem datas vazias, com limite', () => {
  const t = mergeTimeline([[{ at: '2026-01-02', label: 'b' }, { at: null, label: 'x' }], [{ at: '2026-03-01', label: 'c' }, { at: '2025-12-01', label: 'a' }]], 2);
  assert.deepEqual(t.map((e) => e.label), ['c', 'b']);
});
