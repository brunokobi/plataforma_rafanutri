// RN-008 — Teste de isolamento entre consultórios pela API do Directus.
// Cria dois nutricionistas de teste pelo cadastro público, cada um cria o próprio consultório
// e o teste confere que um não lê nem altera nada do outro. No fim, apaga tudo o que criou.
//
// Uso: DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=... node db/tests/api-isolation.test.mjs
// O token de administrador só é usado na limpeza (ADR 0008, regra 1).

import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const URL_ = process.env.DIRECTUS_URL;
const ADMIN = process.env.DIRECTUS_ADMIN_TOKEN;
if (!URL_ || !ADMIN) {
  console.error('Defina DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN.');
  process.exit(2);
}

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function newUser(tag) {
  const email = `teste-isolamento-${tag}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `Teste-${randomUUID()}`;
  const reg = await api('/users/register', { method: 'POST', body: { email, password, first_name: `Teste ${tag}` } });
  assert.equal(reg.status, 204, `cadastro de ${tag}: ${JSON.stringify(reg.json)}`);
  const login = await api('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200, `login de ${tag}`);
  return { email, token: login.json.data.access_token };
}

const created = { users: [], orgs: [] };
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log(`  ok - ${name}`); };

try {
  const a = await newUser('a');
  const b = await newUser('b');
  for (const u of [a, b]) {
    const me = await api('/users/me?fields=id', { token: u.token });
    created.users.push(me.json.data.id);
  }

  const orgBody = (name) => ({ name, type: 'solo', brand_color: '#2E7D32', crn: '12345', crn_region: 'CRN-4' });
  const oa = await api('/rafanutri/organizations', { token: a.token, method: 'POST', body: orgBody('Consultório Teste A') });
  const ob = await api('/rafanutri/organizations', { token: b.token, method: 'POST', body: orgBody('Consultório Teste B') });
  assert.equal(oa.status, 201); assert.equal(ob.status, 201);
  created.orgs.push(oa.json.data.id, ob.json.data.id);
  const A = oa.json.data.id; const B = ob.json.data.id;

  console.log('Isolamento entre consultórios:');
  await check('sem login, o endpoint de criação recusa', async () => {
    const r = await api('/rafanutri/organizations', { method: 'POST', body: orgBody('Anônimo') });
    assert.equal(r.status, 401);
  });
  await check('corpo inválido é recusado', async () => {
    const r = await api('/rafanutri/organizations', { token: a.token, method: 'POST', body: { ...orgBody('ok'), crn_region: 'CRN-99' } });
    assert.equal(r.status, 400);
  });
  await check('criar de novo devolve o mesmo consultório (idempotente)', async () => {
    const r = await api('/rafanutri/organizations', { token: a.token, method: 'POST', body: orgBody('Outro nome') });
    assert.equal(r.json.data.id, A);
  });
  await check('A vê só o próprio consultório', async () => {
    const r = await api('/items/organizations?fields=id', { token: a.token });
    assert.deepEqual(r.json.data.map((o) => o.id), [A]);
  });
  await check('A não lê o consultório de B pelo id', async () => {
    const r = await api(`/items/organizations/${B}`, { token: a.token });
    assert.equal(r.status, 403);
  });
  await check('A não altera o consultório de B', async () => {
    const r = await api(`/items/organizations/${B}`, { token: a.token, method: 'PATCH', body: { name: 'invadido' } });
    assert.equal(r.status, 403);
  });
  await check('A altera o próprio consultório (owner)', async () => {
    const r = await api(`/items/organizations/${A}`, { token: a.token, method: 'PATCH', body: { name: 'Consultório Teste A2' } });
    assert.equal(r.status, 200);
  });
  await check('A não muda o plano do próprio consultório', async () => {
    const r = await api(`/items/organizations/${A}`, { token: a.token, method: 'PATCH', body: { plan: 'pro' } });
    assert.equal(r.status, 403);
  });
  await check('A vê só os membros do próprio consultório', async () => {
    const r = await api('/items/organization_members?fields=organization_id', { token: a.token });
    assert.ok(r.json.data.length >= 1);
    assert.ok(r.json.data.every((m) => m.organization_id === A));
  });
  await check('A não se adiciona ao consultório de B', async () => {
    const r = await api('/items/organization_members', { token: a.token, method: 'POST', body: { organization_id: B, user_id: created.users[0], role: 'owner' } });
    assert.equal(r.status, 403);
  });
  await check('A vê só o próprio perfil profissional', async () => {
    const r = await api('/items/professional_profiles?fields=user_id', { token: a.token });
    assert.deepEqual(r.json.data.map((p) => p.user_id), [created.users[0]]);
  });
  await check('/rafanutri/me/organizations devolve só os consultórios do usuário', async () => {
    const r = await api('/rafanutri/me/organizations', { token: b.token });
    assert.deepEqual(r.json.data.map((o) => [o.id, o.role]), [[B, 'owner']]);
  });
  await check('A não lê outros usuários', async () => {
    const r = await api('/users?fields=id', { token: a.token });
    assert.deepEqual(r.json.data.map((u) => u.id), [created.users[0]]);
  });
  await check('base pública de alimentos é legível e somente leitura', async () => {
    const r = await api('/items/foods?limit=1&fields=id', { token: a.token });
    assert.equal(r.status, 200); assert.equal(r.json.data.length, 1);
    const w = await api(`/items/foods/${r.json.data[0].id}`, { token: a.token, method: 'PATCH', body: { name: 'x' } });
    assert.equal(w.status, 403);
  });
  await check('anônimo não lê consultórios nem alimentos', async () => {
    assert.equal((await api('/items/organizations')).status, 403);
    assert.equal((await api('/items/foods?limit=1')).status, 403);
  });

  console.log('Pacientes:');
  let patientA;
  await check('A cadastra paciente no próprio consultório e vira o responsável', async () => {
    const r = await api('/items/patients?fields=id,organization_id,responsible_user_id,status', {
      token: a.token, method: 'POST',
      body: { organization_id: A, full_name: 'Paciente Teste A', phone: '+5531999990000' },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    patientA = r.json.data.id;
    assert.equal(r.json.data.responsible_user_id, created.users[0], 'responsável deve ser quem cadastrou');
    assert.equal(r.json.data.status, 'active');
  });
  await check('o cliente não escolhe o responsável', async () => {
    const r = await api('/items/patients', { token: a.token, method: 'POST', body: { organization_id: A, full_name: 'Com Responsável', responsible_user_id: created.users[1] } });
    assert.equal(r.status, 403);
  });
  await check('A não cadastra paciente no consultório de B', async () => {
    const r = await api('/items/patients', { token: a.token, method: 'POST', body: { organization_id: B, full_name: 'Intruso Teste' } });
    assert.equal(r.status, 403);
  });
  await check('B não lê nem altera o paciente de A', async () => {
    assert.equal((await api(`/items/patients/${patientA}`, { token: b.token })).status, 403);
    assert.deepEqual((await api('/items/patients?fields=id', { token: b.token })).json.data, []);
    assert.equal((await api(`/items/patients/${patientA}`, { token: b.token, method: 'PATCH', body: { full_name: 'x' } })).status, 403);
  });
  await check('A não move o paciente para outro consultório', async () => {
    const r = await api(`/items/patients/${patientA}`, { token: a.token, method: 'PATCH', body: { organization_id: B } });
    assert.equal(r.status, 403);
  });
  await check('A não apaga paciente (só arquiva)', async () => {
    assert.equal((await api(`/items/patients/${patientA}`, { token: a.token, method: 'DELETE' })).status, 403);
    const r = await api(`/items/patients/${patientA}?fields=status`, { token: a.token, method: 'PATCH', body: { status: 'archived' } });
    assert.equal(r.json.data.status, 'archived');
  });
  await check('limite do plano gratuito: o 21º ativo é recusado com mensagem clara', async () => {
    for (let i = 1; i <= 20; i += 1) {
      const r = await api('/items/patients', { token: a.token, method: 'POST', body: { organization_id: A, full_name: `Paciente Limite ${i}` } });
      assert.equal(r.status, 200, `paciente ${i}: ${JSON.stringify(r.json)}`);
    }
    const r = await api('/items/patients', { token: a.token, method: 'POST', body: { organization_id: A, full_name: 'Paciente Limite 21' } });
    assert.equal(r.status, 400);
    assert.match(r.json.errors[0].message, /até 20 pacientes ativos/);
    const reativar = await api(`/items/patients/${patientA}`, { token: a.token, method: 'PATCH', body: { status: 'active' } });
    assert.equal(reativar.status, 400, 'reativar com o limite cheio deveria falhar');
  });
  await check('CPF repetido no consultório é recusado', async () => {
    const body = { organization_id: A, full_name: 'Com CPF', cpf: '52998224725', status: 'inactive' };
    assert.equal((await api('/items/patients', { token: a.token, method: 'POST', body })).status, 200);
    const r = await api('/items/patients', { token: a.token, method: 'POST', body: { ...body, full_name: 'Outro Com CPF' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.errors[0].extensions.code, 'RECORD_NOT_UNIQUE');
  });

  console.log('Avaliações antropométricas (RN-028):');
  let patientB;
  {
    const r = await api('/items/patients?fields=id', { token: b.token, method: 'POST', body: { organization_id: B, full_name: 'Paciente Teste B', status: 'inactive' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    patientB = r.json.data.id;
  }
  const assessment = (org, patient) => ({
    organization_id: org, patient_id: patient, weight_kg: 70, height_cm: 170, protocol: 'jp3',
    skinfolds: { chest: 10, abdominal: 20, thigh: 15 }, results: { bmi: 24.2 }, calc_version: 'teste',
  });
  let assessmentA;
  await check('A registra avaliação do próprio paciente e vira o autor', async () => {
    const r = await api('/items/anthropometric_assessments?fields=id,user_created', { token: a.token, method: 'POST', body: assessment(A, patientA) });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assessmentA = r.json.data.id;
    assert.equal(r.json.data.user_created, created.users[0]);
  });
  await check('o cliente não escolhe o autor', async () => {
    const r = await api('/items/anthropometric_assessments', { token: a.token, method: 'POST', body: { ...assessment(A, patientA), user_created: created.users[1] } });
    assert.equal(r.status, 403);
  });
  await check('A não registra avaliação no consultório de B nem para paciente de B', async () => {
    const r1 = await api('/items/anthropometric_assessments', { token: a.token, method: 'POST', body: assessment(B, patientB) });
    const r2 = await api('/items/anthropometric_assessments', { token: a.token, method: 'POST', body: assessment(A, patientB) });
    assert.ok(r1.status >= 400, `consultório de B: ${r1.status}`);
    assert.ok(r2.status >= 400, `paciente de B: ${r2.status}`);
  });
  await check('B não lê nem altera a avaliação de A', async () => {
    assert.deepEqual((await api('/items/anthropometric_assessments?fields=id', { token: b.token })).json.data, []);
    assert.equal((await api(`/items/anthropometric_assessments/${assessmentA}`, { token: b.token, method: 'PATCH', body: { notes: 'x' } })).status, 403);
  });
  await check('A não apaga avaliação (histórico preservado)', async () => {
    assert.equal((await api(`/items/anthropometric_assessments/${assessmentA}`, { token: a.token, method: 'DELETE' })).status, 403);
  });

  console.log('Agenda (RN-022):');
  // Amanhã às 10h e 10h30 (horário de Brasília, UTC-3).
  const day = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const at = (hhmm) => new Date(`${day}T${hhmm}:00-03:00`).toISOString();
  const appt = (org, patient, start, end, extra = {}) => ({ organization_id: org, patient_id: patient, starts_at: at(start), ends_at: at(end), type: 'return', ...extra });
  let apptA;
  await check('A marca consulta do próprio paciente e vira o nutricionista', async () => {
    const r = await api('/items/appointments?fields=id,nutritionist_id,status', { token: a.token, method: 'POST', body: appt(A, patientA, '10:00', '11:00') });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    apptA = r.json.data.id;
    assert.equal(r.json.data.nutritionist_id, created.users[0]);
    assert.equal(r.json.data.status, 'scheduled');
  });
  await check('horário sobreposto é recusado com mensagem clara', async () => {
    const r = await api('/items/appointments', { token: a.token, method: 'POST', body: appt(A, patientA, '10:30', '11:30') });
    assert.equal(r.status, 400);
    assert.match(r.json.errors[0].message, /Horário ocupado/);
  });
  await check('consulta encostada (começa quando a outra termina) é aceita', async () => {
    const r = await api('/items/appointments', { token: a.token, method: 'POST', body: appt(A, patientA, '11:00', '11:45') });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  });
  await check('A não marca consulta para paciente de B nem com nutricionista de B', async () => {
    const r1 = await api('/items/appointments', { token: a.token, method: 'POST', body: appt(A, patientB, '14:00', '15:00') });
    const r2 = await api('/items/appointments', { token: a.token, method: 'POST', body: appt(B, patientB, '14:00', '15:00') });
    const r3 = await api('/items/appointments', { token: a.token, method: 'POST', body: appt(A, patientA, '14:00', '15:00', { nutritionist_id: created.users[1] }) });
    for (const [n, r] of [['paciente de B', r1], ['consultório de B', r2], ['nutricionista de B', r3]]) assert.ok(r.status >= 400, `${n}: ${r.status}`);
  });
  await check('B não lê nem remarca a consulta de A', async () => {
    assert.deepEqual((await api('/items/appointments?fields=id', { token: b.token })).json.data, []);
    assert.equal((await api(`/items/appointments/${apptA}`, { token: b.token, method: 'PATCH', body: { status: 'cancelled' } })).status, 403);
  });
  await check('cancelar libera o horário; consulta não é apagada', async () => {
    assert.equal((await api(`/items/appointments/${apptA}`, { token: a.token, method: 'DELETE' })).status, 403);
    const c = await api(`/items/appointments/${apptA}?fields=status`, { token: a.token, method: 'PATCH', body: { status: 'cancelled' } });
    assert.equal(c.json.data.status, 'cancelled');
    const r = await api('/items/appointments', { token: a.token, method: 'POST', body: appt(A, patientA, '10:00', '10:45') });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  });
  await check('remarcar para cima de outra consulta é recusado', async () => {
    const free = await api('/items/appointments?fields=id', { token: a.token, method: 'POST', body: appt(A, patientA, '16:00', '17:00') });
    const r = await api(`/items/appointments/${free.json.data.id}`, { token: a.token, method: 'PATCH', body: { starts_at: at('10:15'), ends_at: at('10:50') } });
    assert.equal(r.status, 400);
    assert.match(r.json.errors[0].message, /Horário ocupado/);
  });

  console.log('Anamneses e link público (RN-024 a RN-026):');
  const CLINICA = '7b1d3c2e-0001-4a5b-9c00-000000000001'; // modelo padrão "Anamnese clínica (adulto)"
  const newLink = () => {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: createHash('sha256').update(token).digest('hex') };
  };
  const pub = (token, init) => api(`/rafanutri/public/anamneses/${token}`, init);
  // paciente ativo novo de A (o anterior foi arquivado nos testes de pacientes)
  const pa = await api('/items/patients?fields=id', { token: a.token, method: 'POST', body: { organization_id: A, full_name: 'Paciente Anamnese Teste', status: 'inactive' } });
  const patientAnam = pa.json.data.id;
  const link = newLink();
  let anamA;
  await check('modelos padrão são visíveis e não editáveis', async () => {
    const r = await api(`/items/questionnaire_templates/${CLINICA}?fields=id,organization_id`, { token: a.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.organization_id, null);
    assert.equal((await api(`/items/questionnaire_templates/${CLINICA}`, { token: a.token, method: 'PATCH', body: { name: 'x' } })).status, 403);
  });
  await check('A envia anamnese; o banco copia o questionário e o hash não é legível', async () => {
    const r = await api('/items/anamneses?fields=id,status,title,schema_snapshot', {
      token: a.token, method: 'POST', body: { organization_id: A, patient_id: patientAnam, template_id: CLINICA, public_token_hash: link.hash },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    anamA = r.json.data.id;
    assert.equal(r.json.data.status, 'sent');
    assert.ok(r.json.data.schema_snapshot.sections.length > 0);
    const h = await api(`/items/anamneses/${anamA}?fields=public_token_hash`, { token: a.token });
    assert.equal(h.status, 403);
  });
  await check('B não lê nem cancela a anamnese de A', async () => {
    assert.deepEqual((await api('/items/anamneses?fields=id', { token: b.token })).json.data, []);
    assert.equal((await api(`/items/anamneses/${anamA}`, { token: b.token, method: 'PATCH', body: { status: 'cancelled' } })).status, 403);
  });
  await check('o profissional não marca como respondida nem edita respostas', async () => {
    assert.ok((await api(`/items/anamneses/${anamA}`, { token: a.token, method: 'PATCH', body: { status: 'answered' } })).status >= 400);
    assert.equal((await api(`/items/anamneses/${anamA}`, { token: a.token, method: 'PATCH', body: { answers: { objetivo: 'outro' } } })).status, 403);
  });
  await check('link público: abre sem login e mostra só o primeiro nome', async () => {
    const r = await pub(link.token);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.data.patient_first_name, 'Paciente');
    assert.ok(!('patient_id' in r.json.data) && !JSON.stringify(r.json.data).includes('Anamnese Teste'));
  });
  await check('link público: token errado ou mal formado não abre', async () => {
    assert.equal((await pub(newLink().token)).status, 410);
    assert.equal((await pub('x'.repeat(10))).status, 410);
  });
  await check('link público: rascunho, respostas inválidas recusadas, envio final invalida o link', async () => {
    const draft = await pub(link.token, { method: 'POST', body: { answers: { objetivo: 'emagrecimento' }, final: false } });
    assert.equal(draft.status, 200, JSON.stringify(draft.json));
    assert.equal((await pub(link.token)).json.data.answers.objetivo, 'emagrecimento');
    const bad = await pub(link.token, { method: 'POST', body: { answers: { objetivo: 'nao_existe' }, final: true } });
    assert.equal(bad.status, 400);
    assert.ok(bad.json.errors[0].extensions.fields.objetivo);
    const done = await pub(link.token, {
      method: 'POST',
      body: { answers: { objetivo: 'emagrecimento', medicamentos_usa: false, atividade: 'nao', refeicoes: 4 }, final: true },
    });
    assert.equal(done.status, 200, JSON.stringify(done.json));
    assert.equal((await pub(link.token)).status, 410);
    assert.equal((await pub(link.token, { method: 'POST', body: { answers: {}, final: true } })).status, 410);
    const r = await api(`/items/anamneses/${anamA}?fields=status,answers`, { token: a.token });
    assert.equal(r.json.data.status, 'answered');
    assert.equal(r.json.data.answers.refeicoes, 4);
  });
  await check('A revisa a anamnese respondida', async () => {
    const r = await api(`/items/anamneses/${anamA}?fields=status`, { token: a.token, method: 'PATCH', body: { status: 'reviewed' } });
    assert.equal(r.json.data.status, 'reviewed');
  });

  console.log('Modelos de plano (RN-035):');
  const planA = await api('/items/meal_plans?fields=id', { token: a.token, method: 'POST', body: { organization_id: A, patient_id: patientAnam, title: 'Plano base' } });
  const planB = await api('/items/meal_plans?fields=id', { token: b.token, method: 'POST', body: { organization_id: B, patient_id: patientB, title: 'Plano de B' } });
  let tplA;
  await check('A salva modelo a partir do próprio plano', async () => {
    const r = await api('/items/meal_plan_templates?fields=id,tags', {
      token: a.token, method: 'POST',
      body: { organization_id: A, source_plan_id: planA.json.data.id, name: 'Modelo A', tags: ['Low Carb', 'low carb'], meals: [], energy_kcal: 1800 },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    tplA = r.json.data.id;
    assert.deepEqual(r.json.data.tags, ['low carb']);
  });
  await check('A não usa plano de B como origem nem cria modelo "da biblioteca"', async () => {
    const r1 = await api('/items/meal_plan_templates', { token: a.token, method: 'POST', body: { organization_id: A, source_plan_id: planB.json.data.id, name: 'Copiado' } });
    const r2 = await api('/items/meal_plan_templates', { token: a.token, method: 'POST', body: { name: 'Biblioteca falsa' } });
    assert.ok(r1.status >= 400, `origem de B: ${r1.status}`);
    assert.ok(r2.status >= 400, `sem consultório: ${r2.status}`);
  });
  await check('B não lê, não altera nem apaga o modelo de A', async () => {
    assert.deepEqual((await api('/items/meal_plan_templates?fields=id&filter[organization_id][_nnull]=true', { token: b.token })).json.data, []);
    assert.equal((await api(`/items/meal_plan_templates/${tplA}`, { token: b.token, method: 'PATCH', body: { name: 'x' } })).status, 403);
    assert.equal((await api(`/items/meal_plan_templates/${tplA}`, { token: b.token, method: 'DELETE' })).status, 403);
  });
  await check('A edita e apaga o próprio modelo', async () => {
    assert.equal((await api(`/items/meal_plan_templates/${tplA}`, { token: a.token, method: 'PATCH', body: { name: 'Modelo A2' } })).status, 200);
    assert.equal((await api(`/items/meal_plan_templates/${tplA}`, { token: a.token, method: 'DELETE' })).status, 204);
  });

  console.log(`${passed} verificações passaram.`);
} finally {
  for (const id of created.orgs) await api(`/items/organizations/${id}`, { token: ADMIN, method: 'DELETE' });
  for (const id of created.users) await api(`/users/${id}`, { token: ADMIN, method: 'DELETE' });
}
