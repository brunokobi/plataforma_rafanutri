// RN-008 — Teste de isolamento entre consultórios pela API do Directus.
// Cria dois nutricionistas de teste pelo cadastro público, cada um cria o próprio consultório
// e o teste confere que um não lê nem altera nada do outro. No fim, apaga tudo o que criou.
//
// Uso: DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=... node db/tests/api-isolation.test.mjs
// O token de administrador só é usado na limpeza e para listar as coleções (ADR 0008, regra 1).
// Sem token: db/scripts/isolation-test.sh lista as tabelas pelo banco (ISOLATION_COLLECTIONS) e faz a
// limpeza por SQL a partir da linha CLEANUP_JSON que o teste imprime.
// ISOLATION_PSQL (opcional): comando que recebe SQL na entrada padrão. Usado só para habilitar o módulo
// UAN e o contrato nos consultórios de teste (no MVP isso é feito pelo admin por SQL); sem ele, os
// cenários de UAN entre unidades são pulados.

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const URL_ = process.env.DIRECTUS_URL;
const ADMIN = process.env.DIRECTUS_ADMIN_TOKEN;
const COLLECTIONS = process.env.ISOLATION_COLLECTIONS;
if (!URL_ || (!ADMIN && !COLLECTIONS)) {
  console.error('Defina DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN (ou rode db/scripts/isolation-test.sh).');
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
    assert.match(r.json.errors[0].message, /limite de 20 pacientes ativos/);
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
  // Token no corpo (POST), nunca na URL (logs de acesso).
  const pub = (token, init) =>
    init?.method === 'POST'
      ? api('/rafanutri/public/anamneses/save', { method: 'POST', body: { token, ...init.body } })
      : api('/rafanutri/public/anamneses/open', { method: 'POST', body: { token } });
  // paciente ativo novo de A (o anterior foi arquivado nos testes de pacientes)
  const pa = await api('/items/patients?fields=id', { token: a.token, method: 'POST', body: { organization_id: A, full_name: 'Paciente Anamnese Teste', status: 'inactive' } });
  const patientAnam = pa.json.data.id;
  const link = newLink();
  let anamA;
  await check('ninguém cria questionário sem consultório (biblioteca da plataforma)', async () => {
    const sch = { version: 1, sections: [{ title: 'S', questions: [{ id: 'q', type: 'text', label: 'Q' }] }] };
    const r = await api('/items/questionnaire_templates', { token: a.token, method: 'POST', body: { name: 'Biblioteca falsa', schema: sch } });
    assert.equal(r.status, 403, `sem consultório: ${r.status}`);
  });
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
    assert.equal(r2.status, 403, `sem consultório: ${r2.status}`);
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

  console.log('Revisão de segurança (criar no consultório alheio e forjar autor):');
  await check('A não cria plano, anamnese nem modelos no consultório de B', async () => {
    const sch = { version: 1, sections: [{ title: 'S', questions: [{ id: 'q', type: 'text', label: 'Q' }] }] };
    const tries = {
      plano: await api('/items/meal_plans', { token: a.token, method: 'POST', body: { organization_id: B, patient_id: patientB } }),
      'plano para paciente de B no consultório de A': await api('/items/meal_plans', { token: a.token, method: 'POST', body: { organization_id: A, patient_id: patientB } }),
      anamnese: await api('/items/anamneses', { token: a.token, method: 'POST', body: { organization_id: B, patient_id: patientB, template_id: CLINICA, public_token_hash: newLink().hash } }),
      questionário: await api('/items/questionnaire_templates', { token: a.token, method: 'POST', body: { organization_id: B, name: 'Intruso', schema: sch } }),
      'modelo de plano': await api('/items/meal_plan_templates', { token: a.token, method: 'POST', body: { organization_id: B, name: 'Intruso' } }),
    };
    for (const [what, r] of Object.entries(tries)) assert.ok(r.status >= 400, `${what}: ${r.status}`);
  });
  await check('ninguém forja o autor (user_created) ao criar', async () => {
    const r = await api('/items/meal_plans', { token: a.token, method: 'POST', body: { organization_id: A, patient_id: patientAnam, user_created: created.users[1] } });
    if (r.status === 200) {
      const row = await api(`/items/meal_plans/${r.json.data.id}?fields=user_created`, { token: a.token });
      assert.equal(row.json.data.user_created, created.users[0], 'autor deveria ser quem criou');
    } else {
      assert.ok(r.status >= 400);
    }
  });
  await check('o profissional não grava revisor arbitrário na anamnese', async () => {
    const r = await api(`/items/anamneses/${anamA}`, { token: a.token, method: 'PATCH', body: { reviewed_by: created.users[1] } });
    assert.ok(r.status >= 400, `reviewed_by: ${r.status}`);
  });
  await check('B não lê o perfil profissional nem os membros do consultório de A', async () => {
    assert.ok(!(await api('/items/professional_profiles?fields=user_id', { token: b.token })).json.data.some((p) => p.user_id === created.users[0]));
    assert.ok(!(await api('/items/organization_members?fields=organization_id', { token: b.token })).json.data.some((m) => m.organization_id === A));
  });
  await check('anônimo não lê nenhuma coleção de dados', async () => {
    for (const c of ['patients', 'appointments', 'anamneses', 'meal_plans', 'anthropometric_assessments', 'questionnaire_templates', 'meal_plan_templates', 'professional_profiles', 'organization_members']) {
      assert.equal((await api(`/items/${c}?limit=1`)).status, 403, c);
    }
  });

  console.log('Alimentos e preparações do consultório (RN-041, RN-042):');
  const foodBody = (name) => ({ name, basis: 'portion', portion_g: 30, nutrients: { energy_kcal: 120, protein_g: 3 } });
  const fa = await api('/rafanutri/foods', { token: a.token, method: 'POST', body: foodBody('Barra Teste A') });
  const fb = await api('/rafanutri/foods', { token: b.token, method: 'POST', body: foodBody('Barra Teste B') });
  await check('A cadastra alimento pelo rótulo (convertido para 100 g)', async () => {
    assert.equal(fa.status, 201, JSON.stringify(fa.json));
    assert.equal(fa.json.data.per100g.energy_kcal, 400);
  });
  await check('B não vê, não edita nem arquiva o alimento de A', async () => {
    assert.deepEqual((await api(`/items/foods?fields=id&filter[id][_eq]=${fa.json.data.id}`, { token: b.token })).json.data, []);
    assert.equal((await api(`/rafanutri/foods/${fa.json.data.id}`, { token: b.token, method: 'PUT', body: foodBody('Invadido') })).status, 404);
    assert.equal((await api(`/rafanutri/foods/${fa.json.data.id}/archive`, { token: b.token, method: 'POST', body: {} })).status, 404);
  });
  await check('preparação não usa alimento de outro consultório; com ingredientes válidos calcula por 100 g', async () => {
    const bad = await api('/rafanutri/recipes', { token: a.token, method: 'POST', body: { name: 'Receita invasora', yield_g: 100, items: [{ foodId: fb.json.data.id, quantityG: 50 }] } });
    assert.equal(bad.status, 400);
    const ok = await api('/rafanutri/recipes', { token: a.token, method: 'POST', body: { name: 'Receita Teste A', yield_g: 60, items: [{ foodId: fa.json.data.id, quantityG: 30 }] } });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    assert.equal(ok.json.data.per100g.energy_kcal, 200); // 30 g × 400 kcal/100 g = 120 kcal em 60 g pronto
    assert.equal((await api(`/rafanutri/recipes/${ok.json.data.id}`, { token: b.token })).status, 404);
  });
  await check('ninguém cria alimento na base pública nem altera a TACO pela API', async () => {
    const r = await api('/items/foods', { token: a.token, method: 'POST', body: { name: 'TACO falsa', source_id: 1 } });
    assert.equal(r.status, 403);
    assert.equal((await api('/items/foods/1', { token: a.token, method: 'PATCH', body: { name: 'x' } })).status, 403);
    assert.equal((await api('/rafanutri/foods', { method: 'POST', body: foodBody('Anônimo') })).status, 401);
  });

  console.log('Orientações reutilizáveis (RN-045):');
  const sa = await api('/rafanutri/snippets', { token: a.token, method: 'POST', body: { category: 'Hidratação', title: 'Água Teste A', body: 'Beba água ao longo do dia.' } });
  await check('A cria orientação; B não a vê, não edita nem apaga', async () => {
    assert.equal(sa.status, 201, JSON.stringify(sa.json));
    const id = sa.json.data.id;
    assert.ok(!(await api('/rafanutri/snippets', { token: b.token })).json.data.some((x) => x.id === id));
    assert.equal((await api(`/rafanutri/snippets/${id}`, { token: b.token, method: 'PUT', body: { category: 'Invasão', title: 'Invadido', body: 'Invadido' } })).status, 404);
    assert.equal((await api(`/rafanutri/snippets/${id}`, { token: b.token, method: 'DELETE' })).status, 404);
    assert.ok((await api('/rafanutri/snippets', { token: a.token })).json.data.some((x) => x.id === id && x.own));
  });
  await check('orientação inválida, sem login ou pela coleção direta é recusada', async () => {
    assert.equal((await api('/rafanutri/snippets', { token: a.token, method: 'POST', body: { category: 'H', title: '', body: '' } })).status, 400);
    assert.equal((await api('/rafanutri/snippets')).status, 401);
    assert.equal((await api('/items/text_snippets', { token: a.token, method: 'POST', body: { category: 'Geral', title: 'Biblioteca falsa', body: 'Texto' } })).status, 403);
    assert.equal((await api(`/rafanutri/snippets/${sa.json.data.id}`, { token: a.token, method: 'DELETE' })).status, 204);
  });

  console.log('Evoluções do prontuário (RN-023):');
  const na = await api(`/rafanutri/patients/${patientA}/notes`, { token: a.token, method: 'POST', body: { body: 'Evolução Teste A' } });
  await check('A registra evolução; B não lê, não edita, não assina nem apaga', async () => {
    assert.equal(na.status, 201, JSON.stringify(na.json));
    const id = na.json.data.id;
    assert.equal((await api(`/rafanutri/patients/${patientA}/notes`, { token: b.token })).status, 404);
    assert.equal((await api(`/rafanutri/notes/${id}`, { token: b.token, method: 'PUT', body: { body: 'Invadido' } })).status, 404);
    assert.equal((await api(`/rafanutri/notes/${id}/sign`, { token: b.token, method: 'POST' })).status, 404);
    assert.equal((await api(`/rafanutri/notes/${id}`, { token: b.token, method: 'DELETE' })).status, 404);
    assert.equal((await api(`/rafanutri/patients/${patientA}/notes`, { token: b.token, method: 'POST', body: { body: 'Invasora' } })).status, 404);
  });
  await check('assinada não muda nem some; retificação guarda a original', async () => {
    const id = na.json.data.id;
    const s = await api(`/rafanutri/notes/${id}/sign`, { token: a.token, method: 'POST' });
    assert.equal(s.status, 200, JSON.stringify(s.json));
    assert.ok(s.json.data.signed_at && s.json.data.signer_name);
    assert.equal((await api(`/rafanutri/notes/${id}`, { token: a.token, method: 'PUT', body: { body: 'Mudada' } })).status, 409);
    assert.equal((await api(`/rafanutri/notes/${id}`, { token: a.token, method: 'DELETE' })).status, 409);
    const r = await api(`/rafanutri/patients/${patientA}/notes`, { token: a.token, method: 'POST', body: { body: 'Retificação A', supersedes_id: id } });
    assert.equal(r.status, 201);
    const list = (await api(`/rafanutri/patients/${patientA}/notes`, { token: a.token })).json.data;
    assert.ok(list.some((n) => n.id === id && n.body === 'Evolução Teste A') && list.some((n) => n.supersedes_id === id));
  });
  await check('evolução sem login ou pela coleção direta é recusada', async () => {
    assert.equal((await api(`/rafanutri/patients/${patientA}/notes`)).status, 401);
    assert.equal((await api('/items/clinical_notes?limit=1', { token: a.token })).status, 403);
  });

  console.log('Plano e lista de interesse (RN-200, RN-202):');
  await check('cada um vê só o uso do próprio consultório', async () => {
    const ra = await api('/rafanutri/plan', { token: a.token });
    const rb = await api('/rafanutri/plan', { token: b.token });
    assert.equal(ra.status, 200);
    assert.equal(ra.json.data.plan.code, 'free');
    assert.ok(ra.json.data.usage.active_patients >= 20, 'A tem os pacientes do teste de limite');
    assert.ok(rb.json.data.usage.active_patients < ra.json.data.usage.active_patients, 'B não conta os pacientes de A');
  });
  await check('interesse no plano pago: owner registra; inválido, sem login e coleção direta recusados', async () => {
    assert.equal((await api('/rafanutri/plan/waitlist', { token: a.token, method: 'POST', body: { desired_plan: 'professional', note: 'teste' } })).status, 201);
    assert.equal((await api('/rafanutri/plan', { token: a.token })).json.data.waitlist.desired_plan, 'professional');
    assert.equal((await api('/rafanutri/plan', { token: b.token })).json.data.waitlist, null);
    assert.equal((await api('/rafanutri/plan/waitlist', { token: a.token, method: 'POST', body: { desired_plan: 'gratis' } })).status, 400);
    assert.equal((await api('/rafanutri/plan/waitlist', { method: 'POST', body: {} })).status, 401);
    assert.equal((await api('/items/plan_waitlist', { token: a.token })).status, 403);
  });

  console.log('Área do paciente (RN-203, RN-204):');
  const patientEmail = `iso.paciente.${Date.now()}@example.com`;
  await check('B não vê, não convida nem revoga o acesso do paciente de A; vínculo direto pela API é recusado', async () => {
    assert.equal((await api(`/rafanutri/patients/${patientA}/app-access`, { token: b.token })).status, 404);
    assert.equal((await api(`/rafanutri/patients/${patientA}/app-invite`, { token: b.token, method: 'POST', body: { email: patientEmail } })).status, 404);
    assert.equal((await api(`/rafanutri/patients/${patientA}/app-access/revoke`, { token: b.token, method: 'POST' })).status, 404);
    assert.ok((await api(`/items/patients/${patientA}`, { token: a.token, method: 'PATCH', body: { app_user_id: created.users[1] } })).status >= 400);
  });
  await check('convite: e-mail de profissional recusado; paciente cria a conta e só vê os próprios dados', async () => {
    // patientA foi arquivado no teste de limite: usa um paciente ativo de A
    const pid = (await api(`/items/patients?fields=id&limit=1&filter[organization_id][_eq]=${A}&filter[status][_eq]=active`, { token: a.token })).json.data[0].id;
    assert.equal((await api(`/rafanutri/patients/${pid}/app-invite`, { token: a.token, method: 'POST', body: { email: (await api('/users/me?fields=email', { token: b.token })).json.data.email } })).status, 409);
    assert.equal((await api(`/rafanutri/patients/${patientA}/app-invite`, { token: a.token, method: 'POST', body: { email: patientEmail } })).status, 409, 'arquivado não recebe convite');
    const inv = await api(`/rafanutri/patients/${pid}/app-invite`, { token: a.token, method: 'POST', body: { email: patientEmail } });
    assert.equal(inv.status, 201, JSON.stringify(inv.json));
    const acc = await api('/rafanutri/public/patient-invites/accept', { method: 'POST', body: { token: inv.json.data.token, password: 'Senha-isolamento-1' } });
    assert.equal(acc.status, 201);
    const login = await api('/auth/login', { method: 'POST', body: { email: patientEmail, password: 'Senha-isolamento-1' } });
    const pt = login.json.data.access_token;
    const me = (await api('/rafanutri/me/patient', { token: pt })).json.data;
    assert.equal(me.patient_account, true);
    assert.deepEqual(me.records.map((r) => r.patient_id), [pid]);
    for (const c of ['patients', 'meal_plans', 'anamneses', 'appointments', 'organizations']) assert.equal((await api(`/items/${c}?limit=1`, { token: pt })).status, 403, c);
    assert.equal((await api('/rafanutri/organizations', { token: pt, method: 'POST', body: { name: 'Consultório do paciente', type: 'solo', crn: '1', crn_region: 'CRN-1' } })).status, 403);
    assert.equal((await api(`/rafanutri/patients/${pid}/notes`, { token: pt })).status, 404);
    // RN-205: plano completo só do próprio registro; id de paciente de outro consultório não abre nada
    assert.equal((await api(`/rafanutri/me/patient/plan?c=${patientB}`, { token: pt })).status, 404);
    assert.equal((await api(`/rafanutri/me/patient/plan`, { token: a.token })).status, 404);
    // RN-206/RN-207: receitas só as visíveis; foto e ficha de outro consultório não abrem
    assert.equal((await api('/rafanutri/me/patient/recipes/1', { token: pt })).status, 404);
    assert.deepEqual((await api('/rafanutri/recipes', { token: pt })).json.data, []);
    assert.equal((await api(`/rafanutri/patients/${patientB}/recipes`, { token: a.token })).status, 404);
    assert.equal((await api(`/rafanutri/patients/${patientB}/recipes`, { token: a.token, method: 'POST', body: { recipe_id: '1' } })).status, 404);
    // RN-208: recomendações — rascunho não aparece; paciente só marca a própria leitura; outro consultório não cria
    const recs = await api(`/rafanutri/patients/${pid}/recommendations`, { token: a.token, method: 'POST', body: { items: [{ category: 'Sono', title: 'Publicada', body: 'Texto.' }], publish: true } });
    assert.equal(recs.status, 201);
    await api(`/rafanutri/patients/${pid}/recommendations`, { token: a.token, method: 'POST', body: { category: 'Sono', title: 'Rascunho', body: 'Texto.' } });
    const mine = (await api('/rafanutri/me/patient/recommendations', { token: pt })).json.data.recommendations;
    assert.deepEqual(mine.map((r) => r.title), ['Publicada']);
    assert.equal((await api(`/rafanutri/me/patient/recommendations/${recs.json.data.ids[0]}/read`, { token: pt, method: 'POST' })).status, 200);
    assert.equal((await api(`/rafanutri/recommendations/${recs.json.data.ids[0]}`, { token: pt, method: 'PUT', body: { category: 'Sono', title: 'Hack', body: 'x', status: 'published' } })).status, 404);
    assert.equal((await api(`/rafanutri/patients/${patientB}/recommendations`, { token: a.token, method: 'POST', body: { category: 'Sono', title: 'Intruso', body: 'Texto.' } })).status, 404);
    assert.equal((await api('/items/patient_recommendations?limit=1', { token: pt })).status, 403);
    // RN-209: documentos — só planos do próprio registro
    assert.deepEqual((await api(`/rafanutri/me/patient/plans?c=${patientB}`, { token: pt })).json.data.plans, []);
    assert.equal((await api(`/rafanutri/me/patient/plan?p=${randomUUID()}`, { token: pt })).status, 404);
    // RN-215: documentos clínicos — rascunho não aparece nem pelo id; paciente não edita; outro consultório não cria
    const today = new Date().toISOString().slice(0, 10);
    const docPub = await api(`/rafanutri/patients/${pid}/documents`, { token: a.token, method: 'POST', body: { kind: 'exam_request', title: 'Pedido publicado', exams: ['Ferritina'], document_date: today, publish: true } });
    assert.equal(docPub.status, 201, JSON.stringify(docPub.json));
    const docDraft = await api(`/rafanutri/patients/${pid}/documents`, { token: a.token, method: 'POST', body: { kind: 'general_guidance', title: 'Rascunho', body: 'Texto.', document_date: today } });
    assert.equal(docDraft.status, 201);
    assert.deepEqual((await api('/rafanutri/me/patient/documents', { token: pt })).json.data.documents.map((d) => d.title), ['Pedido publicado']);
    assert.equal((await api(`/rafanutri/me/patient/documents/${docPub.json.data.id}`, { token: pt })).status, 200);
    assert.equal((await api(`/rafanutri/me/patient/documents/${docDraft.json.data.id}`, { token: pt })).status, 404, 'rascunho pelo id');
    assert.equal((await api(`/rafanutri/documents/${docPub.json.data.id}`, { token: pt, method: 'PUT', body: { title: 'Hack', body: 'x', document_date: today, status: 'published' } })).status, 404);
    assert.equal((await api(`/rafanutri/documents/${docDraft.json.data.id}`, { token: b.token })).status, 404, 'outro consultório lendo o rascunho');
    assert.equal((await api(`/rafanutri/patients/${patientB}/documents`, { token: a.token, method: 'POST', body: { kind: 'general_guidance', title: 'Intruso', body: 'Texto.', document_date: today } })).status, 404);
    assert.equal((await api('/items/clinical_documents?limit=1', { token: pt })).status, 403);
    // RN-053: financeiro — outro consultório não lê, não edita nem exclui; paciente e coleção direta recusados
    const cats = (await api('/rafanutri/finance/categories', { token: a.token })).json.data;
    const catIn = cats.find((c) => c.kind === 'income').id;
    const txA = await api('/rafanutri/finance/transactions', { token: a.token, method: 'POST', body: { kind: 'income', category_id: catIn, description: 'Consulta isolamento', amount_cents: 25050, due_date: today, status: 'paid', patient_id: pid } });
    assert.equal(txA.status, 201, JSON.stringify(txA.json));
    assert.equal(txA.json.data.amount_cents, 25050);
    assert.ok(!(await api('/rafanutri/finance/transactions', { token: b.token })).json.data.transactions.some((t) => t.id === txA.json.data.id), 'B não lista');
    assert.equal((await api(`/rafanutri/finance/transactions/${txA.json.data.id}`, { token: b.token, method: 'PUT', body: { kind: 'income', category_id: catIn, description: 'Invadido', amount_cents: 1, due_date: today } })).status, 404);
    assert.equal((await api(`/rafanutri/finance/transactions/${txA.json.data.id}`, { token: b.token, method: 'DELETE' })).status, 404);
    assert.equal((await api('/rafanutri/finance/transactions', { token: b.token, method: 'POST', body: { kind: 'income', category_id: catIn, description: 'Paciente de A', amount_cents: 100, due_date: today, patient_id: pid } })).status, 409, 'B não lança para paciente de A');
    assert.equal((await api('/rafanutri/finance/transactions', { token: pt })).status, 403, 'paciente não vê o financeiro');
    assert.equal((await api('/items/financial_transactions?limit=1', { token: a.token })).status, 403, 'coleção direta');
    assert.equal((await api(`/rafanutri/finance/transactions/${txA.json.data.id}`, { token: a.token, method: 'DELETE' })).status, 200, 'owner exclui');
    // RN-055: recibo — número sequencial, outro consultório não lê nem emite; lançamento com recibo não é excluído
    const txR = await api('/rafanutri/finance/transactions', { token: a.token, method: 'POST', body: { kind: 'income', category_id: catIn, description: 'Consulta recibo', amount_cents: 1000, due_date: today, status: 'paid', patient_id: pid } });
    const rec = await api(`/rafanutri/finance/transactions/${txR.json.data.id}/receipt`, { token: a.token, method: 'POST', body: {} });
    assert.equal(rec.status, 201, JSON.stringify(rec.json));
    assert.equal(rec.json.data.receipt.number, 1);
    assert.equal((await api(`/rafanutri/finance/transactions/${txR.json.data.id}/receipt`, { token: a.token, method: 'POST', body: {} })).json.data.receipt.id, rec.json.data.receipt.id, 'emitir de novo devolve o mesmo');
    assert.equal((await api(`/rafanutri/finance/receipts/${rec.json.data.receipt.id}`, { token: b.token })).status, 404, 'B não lê o recibo');
    assert.equal((await api(`/rafanutri/finance/transactions/${txR.json.data.id}/receipt`, { token: b.token, method: 'POST', body: {} })).status, 404, 'B não emite');
    assert.equal((await api(`/rafanutri/finance/receipts/${rec.json.data.receipt.id}`, { token: pt })).status, 403, 'paciente não lê');
    assert.equal((await api(`/rafanutri/finance/transactions/${txR.json.data.id}`, { token: a.token, method: 'DELETE' })).status, 409, 'com recibo não exclui');
    assert.equal((await api('/items/receipts?limit=1', { token: a.token })).status, 403, 'coleção direta');
    // RN-054: pacotes — catálogo e vendas isolados; venda gera as parcelas no financeiro
    const pkA = await api('/rafanutri/packages', { token: a.token, method: 'POST', body: { name: 'Trimestral isolamento', sessions: 3, price_cents: 30000, validity_days: 90 } });
    assert.equal(pkA.status, 201, JSON.stringify(pkA.json));
    assert.ok(!(await api('/rafanutri/packages', { token: b.token })).json.data.some((x) => x.id === pkA.json.data.id), 'B não vê o catálogo de A');
    assert.equal((await api(`/rafanutri/packages/${pkA.json.data.id}`, { token: b.token, method: 'PUT', body: { name: 'Invadido', sessions: 1, price_cents: 1 } })).status, 404);
    const sold = await api(`/rafanutri/patients/${pid}/packages`, { token: a.token, method: 'POST', body: { package_id: pkA.json.data.id, installments: 3, first_due_date: today } });
    assert.equal(sold.status, 201, JSON.stringify(sold.json));
    const parcels = (await api('/rafanutri/finance/transactions?from=2000-01-01&to=2100-01-01', { token: a.token })).json.data.transactions.filter((t) => t.description.startsWith('Trimestral isolamento'));
    assert.deepEqual(parcels.map((t) => t.amount_cents).sort((x, y) => y - x), [10000, 10000, 10000], '3 parcelas');
    assert.equal((await api(`/rafanutri/patients/${pid}/packages`, { token: b.token })).status, 404, 'B não lista pacotes do paciente de A');
    assert.equal((await api(`/rafanutri/patient-packages/${sold.json.data.id}/cancel`, { token: b.token, method: 'POST' })).status, 404, 'B não cancela');
    assert.equal((await api(`/rafanutri/patients/${pid}/packages`, { token: pt })).status, 403, 'paciente não vê');
    assert.equal((await api('/items/patient_packages?limit=1', { token: a.token })).status, 403, 'coleção direta');
    // RN-056: CRM — leads e quadro isolados; perdido exige motivo
    const leadA = await api('/rafanutri/crm/leads', { token: a.token, method: 'POST', body: { full_name: 'Lead isolamento', phone: '(31) 99999-0000', source: 'instagram' } });
    assert.equal(leadA.status, 201, JSON.stringify(leadA.json));
    assert.equal(leadA.json.data.phone, '+5531999990000');
    assert.ok(!(await api('/rafanutri/crm/board', { token: b.token })).json.data.leads.some((l) => l.id === leadA.json.data.id), 'B não vê o lead de A');
    assert.equal((await api(`/rafanutri/crm/leads/${leadA.json.data.id}/stage`, { token: b.token, method: 'POST', body: { stage: 'contacted' } })).status, 404);
    assert.equal((await api(`/rafanutri/crm/leads/${leadA.json.data.id}/convert`, { token: b.token, method: 'POST' })).status, 404);
    assert.equal((await api(`/rafanutri/crm/leads/${leadA.json.data.id}/stage`, { token: a.token, method: 'POST', body: { stage: 'lost' } })).status, 400, 'perdido sem motivo');
    assert.equal((await api('/rafanutri/crm/board', { token: pt })).status, 403, 'paciente não vê o CRM');
    assert.equal((await api('/items/leads?limit=1', { token: a.token })).status, 403, 'coleção direta');
    // RN-064: indicadores só do próprio consultório
    const dashA = (await api('/rafanutri/dashboard', { token: a.token })).json.data;
    assert.ok(dashA.current && Number(dashA.current.revenue_cents) >= 0, 'indicadores de A');
    assert.equal((await api('/rafanutri/dashboard', { token: pt })).status, 403, 'paciente não vê indicadores');
    // RN-210: peso só liberado; paciente não muda o que vê; outro consultório não lê nem muda
    assert.deepEqual((await api('/rafanutri/me/patient/weight', { token: pt })).json.data.weight, []);
    assert.equal((await api(`/rafanutri/patients/${pid}/share`, { token: pt, method: 'PUT', body: { show_kcal: true, show_macros: true, show_weight_history: true } })).status, 404);
    assert.equal((await api(`/rafanutri/patients/${patientB}/share`, { token: a.token })).status, 404);
    assert.equal((await api(`/rafanutri/patients/${patientB}/preview`, { token: a.token })).status, 404);
    assert.equal((await api('/rafanutri/public/patient-invites/accept', { method: 'POST', body: { token: inv.json.data.token, password: 'Senha-isolamento-2' } })).status, 410);
    // RN-213: a conta de paciente não lê nenhuma coleção pela API de itens (todas as tabelas do produto)
    const collections = ADMIN
      ? (await api('/collections?limit=-1', { token: ADMIN })).json.data.map((c) => c.collection).filter((c) => !c.startsWith('directus_'))
      : COLLECTIONS.split(',').filter((c) => c && !c.startsWith('directus_'));
    assert.ok(collections.length >= 15, `coleções: ${collections.length}`);
    for (const c of collections) assert.equal((await api(`/items/${c}?limit=1`, { token: pt })).status, 403, `paciente lendo ${c}`);
    // Rascunho de plano nunca chega ao paciente, nem pedindo pelo id
    const draft = await api('/items/meal_plans?fields=id', { token: a.token, method: 'POST', body: { organization_id: A, patient_id: pid, title: 'Rascunho IDOR' } });
    assert.equal(draft.status, 200, JSON.stringify(draft.json));
    assert.equal((await api(`/rafanutri/me/patient/plan?p=${draft.json.data.id}`, { token: pt })).status, 404, 'rascunho pelo id');
    assert.ok(!(await api('/rafanutri/me/patient/plans', { token: pt })).json.data.plans.some((x) => x.id === draft.json.data.id), 'rascunho na lista');
    // Outro paciente do mesmo consultório (outra conta): nenhum id trocado abre nada
    const email2 = `teste-isolamento-paciente2-${randomUUID().slice(0, 8)}@example.com`;
    // A está no limite de 20 ativos (teste do limite): libera uma vaga arquivando outro paciente
    const spare = (await api(`/items/patients?fields=id&limit=1&filter[organization_id][_eq]=${A}&filter[status][_eq]=active&filter[id][_neq]=${pid}`, { token: a.token })).json.data[0].id;
    assert.equal((await api(`/items/patients/${spare}`, { token: a.token, method: 'PATCH', body: { status: 'archived' } })).status, 200);
    const p2 = await api('/items/patients?fields=id', { token: a.token, method: 'POST', body: { organization_id: A, full_name: 'Paciente Dois A' } });
    assert.equal(p2.status, 200, JSON.stringify(p2.json));
    const pid2 = p2.json.data.id;
    const inv2 = await api(`/rafanutri/patients/${pid2}/app-invite`, { token: a.token, method: 'POST', body: { email: email2 } });
    assert.equal((await api('/rafanutri/public/patient-invites/accept', { method: 'POST', body: { token: inv2.json.data.token, password: 'Senha-isolamento-2b' } })).status, 201);
    const pt2 = (await api('/auth/login', { method: 'POST', body: { email: email2, password: 'Senha-isolamento-2b' } })).json.data.access_token;
    created.users.push((await api('/users/me?fields=id', { token: pt2 })).json.data.id);
    for (const [tok, other] of [[pt, pid2], [pt2, pid]]) {
      assert.equal((await api(`/rafanutri/me/patient/plan?c=${other}`, { token: tok })).status, 404, 'plano de outro paciente');
      assert.equal((await api(`/rafanutri/me/patient/recommendations?c=${other}`, { token: tok })).json.data.patient_id, null, 'recomendações de outro paciente');
      assert.equal((await api(`/rafanutri/me/patient/recipes?c=${other}`, { token: tok })).json.data.patient_id, null, 'receitas de outro paciente');
      assert.equal((await api(`/rafanutri/me/patient/plans?c=${other}`, { token: tok })).json.data.patient_id, null, 'documentos de outro paciente');
      assert.equal((await api(`/rafanutri/me/patient/weight?c=${other}`, { token: tok })).json.data.patient_id, null, 'peso de outro paciente');
      assert.equal((await api(`/rafanutri/patients/${other}/notes`, { token: tok })).status, 404, 'notas clínicas');
      assert.equal((await api(`/rafanutri/me/patient/documents?c=${other}`, { token: tok })).json.data.patient_id, null, 'documentos clínicos de outro paciente');
    }
    const recRead = (await api('/rafanutri/me/patient/recommendations', { token: pt })).json.data.recommendations[0];
    assert.equal((await api(`/rafanutri/me/patient/recommendations/${recRead.id}/read`, { token: pt2, method: 'POST' })).status, 404, 'marcar leitura de outro');
    assert.equal((await api(`/rafanutri/me/patient/documents/${docPub.json.data.id}`, { token: pt2 })).status, 404, 'documento de outro paciente');
    // Registro arquivado: some da área do paciente
    assert.equal((await api(`/items/patients/${pid2}`, { token: a.token, method: 'PATCH', body: { status: 'archived' } })).status, 200);
    assert.deepEqual((await api('/rafanutri/me/patient', { token: pt2 })).json.data.records, []);
    assert.equal((await api('/rafanutri/me/patient/plan', { token: pt2 })).status, 404);

    // RN-211: a mesma conta também paciente de B; cada consultório só aparece no próprio registro
    const pb = await api('/items/patients?fields=id', { token: b.token, method: 'POST', body: { organization_id: B, full_name: 'Paciente Comum B' } });
    assert.equal(pb.status, 200, JSON.stringify(pb.json));
    const pidB = pb.json.data.id;
    const invB = await api(`/rafanutri/patients/${pidB}/app-invite`, { token: b.token, method: 'POST', body: { email: patientEmail } });
    assert.equal(invB.status, 201);
    assert.equal((await api('/rafanutri/patient-invites/accept', { token: pt, method: 'POST', body: { token: invB.json.data.token } })).status, 200);
    const both = (await api('/rafanutri/me/patient', { token: pt })).json.data.records;
    assert.deepEqual(both.map((r) => r.patient_id).sort(), [pid, pidB].sort());
    assert.equal(new Set(both.map((r) => r.practice.id)).size, 2, 'marca de cada consultório');
    await api(`/rafanutri/patients/${pidB}/recommendations`, { token: b.token, method: 'POST', body: { items: [{ category: 'Treino', title: 'Só de B', body: 'Texto.' }], publish: true } });
    const recA = (await api(`/rafanutri/me/patient/recommendations?c=${pid}`, { token: pt })).json.data.recommendations.map((r) => r.title);
    const recB = (await api(`/rafanutri/me/patient/recommendations?c=${pidB}`, { token: pt })).json.data.recommendations.map((r) => r.title);
    assert.ok(!recA.includes('Só de B') && recA.includes('Publicada'), 'A não vê o que é de B');
    assert.deepEqual(recB, ['Só de B'], 'B não vê o que é de A');
    assert.deepEqual((await api(`/rafanutri/me/patient/plans?c=${pidB}`, { token: pt })).json.data.plans, []);
    assert.deepEqual((await api(`/rafanutri/me/patient/recipes?c=${pidB}`, { token: pt })).json.data.recipes, []);
    assert.deepEqual((await api(`/rafanutri/me/patient/documents?c=${pidB}`, { token: pt })).json.data.documents, []);
    await api(`/rafanutri/patients/${pidB}/app-access/revoke`, { token: b.token, method: 'POST' });
    assert.deepEqual((await api('/rafanutri/me/patient', { token: pt })).json.data.records.map((r) => r.patient_id), [pid]);
    await api(`/rafanutri/patients/${pid}/app-access/revoke`, { token: a.token, method: 'POST' });
    assert.deepEqual((await api('/rafanutri/me/patient', { token: pt })).json.data.records, []);
    const uid = (await api('/users/me?fields=id', { token: pt })).json.data.id;
    created.users.push(uid); // apagado no fim
  });

  // RN-009: auditoria só do próprio consultório, só para o owner, sem acesso pela API de itens
  await check('auditoria: o owner vê o próprio log, com autor e leituras, e não o de outro consultório', async () => {
    assert.equal((await api('/rafanutri/audit')).status, 401, 'anônimo');
    assert.equal((await api('/rafanutri/audit?entity=directus_users', { token: a.token })).status, 400, 'filtro inválido');
    assert.notEqual((await api('/items/audit_logs', { token: a.token })).status, 200, 'sem API de itens');
    const uidA = (await api('/users/me?fields=id', { token: a.token })).json.data.id;
    const somePatient = (await api('/items/patients?fields=id&limit=1', { token: a.token })).json.data[0].id;
    assert.equal((await api(`/rafanutri/patients/${somePatient}/notes`, { token: a.token })).status, 200);
    await new Promise((r) => setTimeout(r, 500));
    const la = await api('/rafanutri/audit', { token: a.token });
    assert.equal(la.status, 200, JSON.stringify(la.json));
    assert.ok(la.json.members.some((m) => m.id === uidA), 'membros para o filtro');
    assert.ok(la.json.data.some((e) => e.entity === 'patients' && e.action === 'insert' && e.actor?.id === uidA), 'autor da escrita pela API de itens');
    const reads = (await api(`/rafanutri/audit?action=read&entity=clinical_notes&patient=${somePatient}`, { token: a.token })).json.data;
    assert.ok(reads.length === 1 && reads[0].actor?.id === uidA, 'leitura do prontuário registrada');
    const mineA = new Set(la.json.data.map((e) => e.patient?.id).filter(Boolean));
    const lb = await api('/rafanutri/audit', { token: b.token });
    assert.equal(lb.status, 200);
    assert.ok(lb.json.data.every((e) => !mineA.has(e.patient?.id)), 'B não vê registros de A');
    assert.ok(!lb.json.members.some((m) => m.id === uidA), 'B não vê membros de A');
    assert.deepEqual((await api(`/rafanutri/audit?patient=${somePatient}`, { token: b.token })).json.data, [], 'filtro por paciente de A');
  });

  // RN-022: expediente só pelo owner do próprio consultório
  await check('expediente: B não altera o de A; A altera o próprio', async () => {
    const body = { work_start: '07:00', work_end: '12:00', work_weekdays: [1, 2] };
    assert.equal((await api(`/rafanutri/practices/${A}/schedule`, { token: b.token, method: 'PUT', body })).status, 404);
    assert.equal((await api(`/rafanutri/practices/${A}/schedule`, { method: 'PUT', body })).status, 401);
    assert.equal((await api(`/rafanutri/practices/${A}/schedule`, { token: a.token, method: 'PUT', body })).status, 200);
    const mine = (await api('/rafanutri/me/organizations', { token: a.token })).json.data.find((o) => o.id === A);
    assert.deepEqual([mine.work_start, mine.work_end, mine.work_weekdays], ['07:00', '12:00', [1, 2]]);
    const theirs = (await api('/rafanutri/me/organizations', { token: b.token })).json.data.find((o) => o.id === B);
    assert.deepEqual([theirs.work_start, theirs.work_end], ['08:00', '18:00'], 'B intacto');
  });

  // RN-121 a RN-123: UAN. Sem o módulo, ninguém cria unidade; com ele, o cozinheiro de uma unidade
  // não vê a outra, não edita e não ganha acesso clínico ao consultório.
  await check('UAN: sem o módulo não cria unidade; sem login 401', async () => {
    assert.equal((await api('/rafanutri/uan/units', { token: a.token, method: 'POST', body: { organization_id: A, name: 'Unidade Teste' } })).status, 403);
    assert.deepEqual((await api('/rafanutri/uan/context', { token: a.token })).json.data, []);
    assert.equal((await api('/rafanutri/uan/context')).status, 401);
  });
  // Conta sem consultório nem unidade, criada uma vez (o cadastro público tem limite por minuto).
  let outsiderUser = null;
  const outsider = async () => {
    if (!outsiderUser) {
      outsiderUser = await newUser('fora');
      created.users.push((await api('/users/me?fields=id', { token: outsiderUser.token })).json.data.id);
    }
    return outsiderUser;
  };
  if (process.env.ISOLATION_PSQL) {
    const uidB = created.users[1];
    // Só o consultório A criado por este teste (id recém-criado, dono com e-mail @example.com).
    const enabled = String(execSync(process.env.ISOLATION_PSQL, {
      input: `update organizations o set modules = '{clinical,uan}' where o.id = '${A}'
                and exists (select 1 from organization_members m join directus_users u on u.id = m.user_id
                            where m.organization_id = o.id and m.role = 'owner' and u.email like '%@example.com') returning 'UAN_ON';
              insert into organization_contracts (organization_id, plan, units_contracted) values ('${A}', 'uan_pilot', 2);`,
      stdio: ['pipe', 'pipe', 'inherit'],
    }));
    assert.ok(enabled.includes('UAN_ON'), `módulo UAN não habilitado em A: ${enabled}`);
    const u1 = await api('/rafanutri/uan/units', { token: a.token, method: 'POST', body: { organization_id: A, name: 'Unidade Teste 1', kind: 'industrial' } });
    const u2 = await api('/rafanutri/uan/units', { token: a.token, method: 'POST', body: { organization_id: A, name: 'Unidade Teste 2' } });
    assert.equal(u1.status, 201, JSON.stringify(u1.json)); assert.equal(u2.status, 201);
    const U1 = u1.json.data.id; const U2 = u2.json.data.id;
    await check('UAN: limite do contrato e empresa de outro dono', async () => {
      assert.equal((await api('/rafanutri/uan/units', { token: a.token, method: 'POST', body: { organization_id: A, name: 'Unidade Teste 3' } })).status, 409);
      assert.equal((await api('/rafanutri/uan/units', { token: b.token, method: 'POST', body: { organization_id: A, name: 'Intrusa' } })).status, 403);
      assert.equal((await api(`/rafanutri/uan/units/${U1}`, { token: b.token })).status, 404);
      assert.equal((await api(`/rafanutri/uan/units/${U1}`, { token: b.token, method: 'PUT', body: { name: 'Invadida' } })).status, 404);
    });
    // RN-220: B entra como cozinheiro da unidade 1 pelo link de convite (não por SQL).
    await check('UAN: convite por link — só quem administra convida; uso único; token falso 410', async () => {
      assert.equal((await api(`/rafanutri/uan/units/${U1}/invites`, { token: b.token, method: 'POST', body: { role: 'cook' } })).status, 404, 'B ainda não é da unidade');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/invites`, { method: 'POST', body: { role: 'cook' } })).status, 401);
      const inv = await api(`/rafanutri/uan/units/${U1}/invites`, { token: a.token, method: 'POST', body: { role: 'cook', label: 'Teste B' } });
      assert.equal(inv.status, 201, JSON.stringify(inv.json));
      const open = await api('/rafanutri/public/unit-invites/open', { method: 'POST', body: { token: inv.json.data.token } });
      assert.equal(open.status, 200);
      assert.deepEqual([open.json.data.unit, open.json.data.role], ['Unidade Teste 1', 'cook']);
      assert.equal(open.json.data.organization_id, undefined, 'sem ids no convite público');
      assert.equal((await api('/rafanutri/unit-invites/accept', { method: 'POST', body: { token: inv.json.data.token } })).status, 401);
      const acc = await api('/rafanutri/unit-invites/accept', { token: b.token, method: 'POST', body: { token: inv.json.data.token } });
      assert.equal(acc.status, 200, JSON.stringify(acc.json));
      assert.equal(acc.json.data.unit_id, U1);
      assert.equal((await api('/rafanutri/unit-invites/accept', { token: b.token, method: 'POST', body: { token: inv.json.data.token } })).status, 410, 'uso único');
      assert.equal((await api('/rafanutri/public/unit-invites/open', { method: 'POST', body: { token: 'x'.repeat(43) } })).status, 410);
    });
    await check('UAN: cozinheiro da unidade 1 não vê a 2, não edita, não vê a equipe nem o clínico', async () => {
      const ctx = (await api('/rafanutri/uan/context', { token: b.token })).json.data;
      const orgA = ctx.find((o) => o.id === A);
      assert.ok(orgA && !orgA.is_owner && orgA.unit_limit === null, 'vê a empresa A como equipe');
      assert.deepEqual(orgA.units.map((u) => u.id), [U1], 'só a unidade 1');
      assert.deepEqual(orgA.units[0].roles, ['cook']);
      const d1 = await api(`/rafanutri/uan/units/${U1}`, { token: b.token });
      assert.equal(d1.status, 200);
      assert.equal(d1.json.data.can_edit, false);
      assert.deepEqual(d1.json.data.members, [], 'cozinheiro não lista a equipe');
      assert.equal((await api(`/rafanutri/uan/units/${U2}`, { token: b.token })).status, 404, 'unidade 2');
      assert.equal((await api(`/rafanutri/uan/units/${U1}`, { token: b.token, method: 'PUT', body: { name: 'Mudada' } })).status, 403, 'edita');
      const pats = await api(`/items/patients?filter[organization_id][_eq]=${A}&fields=id`, { token: b.token });
      assert.ok(pats.status >= 400 || pats.json.data.length === 0, 'pacientes de A');
      assert.ok((await api('/rafanutri/finance/transactions', { token: b.token })).json.data?.transactions?.every((t) => t.organization_id !== A) ?? true, 'financeiro de A');
      const own = (await api(`/rafanutri/uan/units/${U1}`, { token: a.token })).json.data;
      assert.ok(own.can_edit && own.members.some((m) => m.user_id === uidB && m.role === 'cook'), 'owner vê a equipe');
    });
    await check('UAN: cozinheiro não convida, não troca papel nem cancela convite; owner administra', async () => {
      assert.equal((await api(`/rafanutri/uan/units/${U1}/invites`, { token: b.token, method: 'POST', body: { role: 'cook' } })).status, 403, 'cozinheiro convida');
      assert.equal((await api(`/rafanutri/uan/units/${U2}/invites`, { token: b.token, method: 'POST', body: { role: 'cook' } })).status, 404, 'convida em outra unidade');
      const pending = await api(`/rafanutri/uan/units/${U1}/invites`, { token: a.token, method: 'POST', body: { role: 'auditor' } });
      assert.equal(pending.status, 201);
      assert.equal((await api(`/rafanutri/uan/units/${U1}/invites/${pending.json.data.id}/revoke`, { token: b.token, method: 'POST', body: {} })).status, 403, 'cozinheiro cancela');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/members`, { token: b.token, method: 'POST', body: { user_id: uidB, role: 'cook', new_role: 'manager' } })).status, 403, 'promove a si mesmo');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/invites/${pending.json.data.id}/revoke`, { token: a.token, method: 'POST', body: {} })).status, 200);
      assert.equal((await api('/rafanutri/public/unit-invites/open', { method: 'POST', body: { token: pending.json.data.token } })).status, 410, 'revogado');
    });
    await check('UAN: conta criada pelo convite entra só na unidade, sem consultório', async () => {
      const inv = await api(`/rafanutri/uan/units/${U1}/invites`, { token: a.token, method: 'POST', body: { role: 'stock_keeper' } });
      const email = `isol-uan-${Date.now()}@example.com`;
      const password = `Senha-${Math.random().toString(36).slice(2)}A1`;
      assert.equal((await api('/rafanutri/public/unit-invites/accept', { method: 'POST', body: { token: inv.json.data.token, full_name: 'Estoquista Teste', email: 'x', password } })).status, 400);
      const acc = await api('/rafanutri/public/unit-invites/accept', { method: 'POST', body: { token: inv.json.data.token, full_name: 'Estoquista Teste', email, password } });
      assert.equal(acc.status, 201, JSON.stringify(acc.json));
      const login = await api('/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(login.status, 200);
      const c = login.json.data.access_token;
      const me = await api('/users/me?fields=id', { token: c });
      created.users.push(me.json.data.id);
      assert.deepEqual((await api('/rafanutri/me/organizations', { token: c })).json.data, [], 'sem consultório');
      const ctx = (await api('/rafanutri/uan/context', { token: c })).json.data;
      assert.deepEqual(ctx.flatMap((o) => o.units.map((u) => u.id)), [U1]);
      const pats = await api('/items/patients?fields=id&limit=1', { token: c });
      assert.ok(pats.status >= 400 || pats.json.data.length === 0, 'pacientes');
      assert.equal((await api(`/rafanutri/uan/units/${U2}`, { token: c })).status, 404);
      // owner troca o papel e remove
      assert.equal((await api(`/rafanutri/uan/units/${U1}/members`, { token: a.token, method: 'POST', body: { user_id: me.json.data.id, role: 'stock_keeper', new_role: 'auditor' } })).status, 200);
      assert.deepEqual((await api('/rafanutri/uan/context', { token: c })).json.data[0].units[0].roles, ['auditor']);
      assert.equal((await api(`/rafanutri/uan/units/${U1}/members`, { token: a.token, method: 'POST', body: { user_id: me.json.data.id, role: 'auditor' } })).status, 200);
      assert.deepEqual((await api('/rafanutri/uan/context', { token: c })).json.data, [], 'removido não vê mais a unidade');
      assert.equal((await api(`/rafanutri/uan/units/${U1}`, { token: c })).status, 404);
    });
    await check('UAN: checklist — cozinheiro faz na unidade dele; quem é de fora não vê nem responde; cancelado não muda', async () => {
      const list = await api(`/rafanutri/uan/units/${U1}/checklists`, { token: b.token });
      assert.equal(list.status, 200);
      assert.equal(list.json.data.can_run, true);
      const tpl = list.json.data.templates.find((t) => t.name === 'Abertura da cozinha');
      assert.ok(tpl, 'modelo da biblioteca');
      const clientId = randomUUID();
      const start = await api(`/rafanutri/uan/units/${U1}/checklist-runs`, { token: b.token, method: 'POST', body: { template_id: tpl.id, client_id: clientId } });
      assert.equal(start.status, 201, JSON.stringify(start.json));
      const RUN = start.json.data.id;
      const again = await api(`/rafanutri/uan/units/${U1}/checklist-runs`, { token: b.token, method: 'POST', body: { template_id: tpl.id, client_id: clientId } });
      assert.equal(again.json.data.id, RUN, 'mesmo client_id');
      assert.equal((await api(`/rafanutri/uan/units/${U2}/checklist-runs`, { token: b.token, method: 'POST', body: { template_id: tpl.id, client_id: randomUUID() } })).status, 404, 'outra unidade');
      assert.equal((await api(`/rafanutri/uan/units/${U2}/checklists`, { token: b.token })).status, 404);
      // pessoa de fora (conta sem consultório nem unidade)
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/checklist-runs/${RUN}`, { token: out.token })).status, 404, 'lê execução');
      assert.equal((await api(`/rafanutri/uan/checklist-runs/${RUN}/answers/1`, { token: out.token, method: 'PUT', body: { value: 'conform' } })).status, 404, 'responde');
      assert.equal((await api(`/rafanutri/uan/checklist-runs/${RUN}/complete`, { token: out.token, method: 'POST', body: {} })).status, 404, 'conclui');
      assert.equal((await api(`/rafanutri/uan/checklist-runs/${RUN}/cancel`, { token: out.token, method: 'POST', body: {} })).status, 404, 'cancela');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/checklists`, { token: out.token })).status, 404, 'lista');
      assert.equal((await api(`/rafanutri/uan/checklist-runs/${RUN}`)).status, 401);
      const direct = await api('/items/checklist_answers?limit=1', { token: b.token });
      assert.ok(direct.status >= 400, 'coleção direta recusada');
      // responder, foto inválida, concluir incompleto, cancelar
      assert.equal((await api(`/rafanutri/uan/checklist-runs/${RUN}/answers/1`, { token: b.token, method: 'PUT', body: { value: 'talvez' } })).status, 400);
      const ans = await api(`/rafanutri/uan/checklist-runs/${RUN}/answers/5`, { token: b.token, method: 'PUT', body: { number_value: 9 } });
      assert.equal(ans.status, 200, JSON.stringify(ans.json));
      assert.equal(ans.json.data.value, 'non_conform', '9 °C fora do limite');
      assert.equal((await api(`/rafanutri/uan/checklist-runs/${RUN}/answers/5/photo`, { token: b.token, method: 'POST', body: { image: 'data:image/png;base64,AAAA' } })).status, 400);
      assert.equal((await api(`/rafanutri/uan/checklist-runs/${RUN}/complete`, { token: b.token, method: 'POST', body: {} })).status, 409, 'incompleto');
      assert.equal((await api(`/rafanutri/uan/checklist-runs/${RUN}/cancel`, { token: b.token, method: 'POST', body: {} })).status, 200);
      assert.equal((await api(`/rafanutri/uan/checklist-runs/${RUN}/answers/1`, { token: b.token, method: 'PUT', body: { value: 'conform' } })).status, 409, 'cancelado não muda');
      const own = await api(`/rafanutri/uan/checklist-runs/${RUN}`, { token: a.token });
      assert.equal(own.json.data.run.status, 'cancelled', 'owner vê');
    });
    await check('UAN: temperaturas — só quem administra cadastra equipamento; cozinheiro registra; fora do limite exige ação; quem é de fora não vê', async () => {
      assert.equal((await api(`/rafanutri/uan/units/${U1}/equipment`, { token: b.token, method: 'POST', body: { name: 'Geladeira B', kind: 'refrigerator' } })).status, 403, 'cozinheiro cadastra');
      const eq = await api(`/rafanutri/uan/units/${U1}/equipment`, { token: a.token, method: 'POST', body: { name: 'Geladeira Teste', kind: 'refrigerator' } });
      assert.equal(eq.status, 201, JSON.stringify(eq.json));
      assert.equal(eq.json.data.max_temp, 5, 'limite padrão');
      const EQ = eq.json.data.id;
      const cid = randomUUID();
      const ok = await api(`/rafanutri/uan/units/${U1}/temperatures`, { token: b.token, method: 'POST', body: { equipment_id: EQ, value: 4, client_id: cid } });
      assert.equal(ok.status, 201, JSON.stringify(ok.json));
      assert.equal(ok.json.data.out_of_range, false);
      assert.equal((await api(`/rafanutri/uan/units/${U1}/temperatures`, { token: b.token, method: 'POST', body: { equipment_id: EQ, value: 4, client_id: cid } })).json.data.id, ok.json.data.id, 'idempotente');
      const noAction = await api(`/rafanutri/uan/units/${U1}/temperatures`, { token: b.token, method: 'POST', body: { equipment_id: EQ, value: 7, client_id: randomUUID() } });
      assert.equal(noAction.status, 400);
      assert.ok(noAction.json.errors[0].extensions.fields.corrective_action);
      const withAction = await api(`/rafanutri/uan/units/${U1}/temperatures`, { token: b.token, method: 'POST', body: { equipment_id: EQ, value: 7, corrective_action: 'Porta fechada', client_id: randomUUID() } });
      assert.equal(withAction.json.data.out_of_range, true);
      assert.equal((await api(`/rafanutri/uan/units/${U2}/temperatures`, { token: a.token, method: 'POST', body: { equipment_id: EQ, value: 4, client_id: randomUUID() } })).status, 404, 'equipamento de outra unidade');
      assert.equal((await api(`/rafanutri/uan/units/${U2}/temperatures`, { token: b.token })).status, 404, 'cozinheiro em outra unidade');
      assert.equal((await api(`/rafanutri/uan/equipment/${EQ}`, { token: b.token, method: 'PUT', body: { max_temp: 10 } })).status, 403, 'cozinheiro muda limite');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/equipment/${EQ}`, { token: out.token })).status, 404, 'lê equipamento');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/temperatures`, { token: out.token, method: 'POST', body: { equipment_id: EQ, value: 4, client_id: randomUUID() } })).status, 404, 'registra');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/temperatures`, { token: out.token })).status, 404, 'lista');
      assert.ok((await api('/items/temperature_readings?limit=1', { token: b.token })).status >= 400, 'coleção direta recusada');
      const hist = await api(`/rafanutri/uan/equipment/${EQ}`, { token: a.token });
      assert.equal(hist.json.data.readings.length, 2, 'histórico do owner');
    });
    await check('UAN: não conformidade — cozinheiro abre e conclui a ação dele; só quem supervisiona planeja; fechar exige RT/owner e foto; de fora não vê', async () => {
      const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII=';
      const open = await api(`/rafanutri/uan/units/${U1}/non-conformities`, { token: b.token, method: 'POST', body: { title: 'Ralo entupido', severity: 'medium' } });
      assert.equal(open.status, 201, JSON.stringify(open.json));
      const NC = open.json.data.id;
      assert.equal(open.json.data.status, 'open');
      assert.equal((await api(`/rafanutri/uan/non-conformities/${NC}/plans`, { token: b.token, method: 'POST', body: { what: 'Desentupir', due_date: '2026-12-01', who_text: 'Eu' } })).status, 403, 'cozinheiro planeja');
      const uidB2 = created.users[1];
      const plan = await api(`/rafanutri/uan/non-conformities/${NC}/plans`, { token: a.token, method: 'POST', body: { what: 'Desentupir o ralo', due_date: '2026-12-01', who_user: uidB2 } });
      assert.equal(plan.status, 201, JSON.stringify(plan.json));
      assert.equal((await api(`/rafanutri/uan/non-conformities/${NC}/plans`, { token: a.token, method: 'POST', body: { what: 'X', due_date: '2026-12-01', who_user: randomUUID() } })).status, 400, 'responsável fora da equipe');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/non-conformities/${NC}`, { token: out.token })).status, 404, 'lê NC');
      assert.equal((await api(`/rafanutri/uan/action-plans/${plan.json.data.id}/done`, { token: out.token, method: 'POST', body: {} })).status, 404, 'conclui ação');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/non-conformities`, { token: out.token })).status, 404, 'quadro');
      assert.equal((await api(`/rafanutri/uan/units/${U2}/non-conformities`, { token: b.token })).status, 404, 'quadro de outra unidade');
      assert.equal((await api(`/rafanutri/uan/non-conformities/${NC}`, { token: b.token })).json.data.nc.status, 'in_progress');
      assert.equal((await api(`/rafanutri/uan/action-plans/${plan.json.data.id}/done`, { token: b.token, method: 'POST', body: { note: 'Feito' } })).status, 200, 'responsável conclui');
      assert.equal((await api(`/rafanutri/uan/non-conformities/${NC}/close`, { token: b.token, method: 'POST', body: { note: 'ok', image: PNG } })).status, 403, 'cozinheiro fecha');
      assert.equal((await api(`/rafanutri/uan/non-conformities/${NC}/close`, { token: a.token, method: 'POST', body: { note: 'Verificado' } })).status, 400, 'sem foto');
      const closed = await api(`/rafanutri/uan/non-conformities/${NC}/close`, { token: a.token, method: 'POST', body: { note: 'Sem retorno em 48 h', image: PNG } });
      assert.equal(closed.status, 200, JSON.stringify(closed.json));
      assert.equal(closed.json.data.status, 'closed');
      assert.equal((await api(`/rafanutri/uan/non-conformities/${NC}/plans`, { token: a.token, method: 'POST', body: { what: 'Mais', due_date: '2026-12-01', who_text: 'RT' } })).status, 409, 'fechada não recebe plano');
      assert.ok((await api('/items/non_conformities?limit=1', { token: b.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: modelos e agenda — biblioteca só leitura; cozinheiro não copia, não edita nem agenda; de fora não vê o modelo da empresa', async () => {
      const list = (await api(`/rafanutri/uan/units/${U1}/checklists`, { token: a.token })).json.data;
      const lib = list.templates.find((t) => t.name === 'Higiene dos manipuladores');
      assert.ok(lib?.platform, 'modelo da biblioteca');
      assert.equal((await api(`/rafanutri/uan/checklist-templates/${lib.id}`, { token: a.token, method: 'PUT', body: { name: 'X', category: 'other', frequency_hint: 'daily', active: true, items: [{ prompt: 'Teste?' }] } })).status, 404, 'biblioteca não edita');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/checklist-templates/copy`, { token: b.token, method: 'POST', body: { template_id: lib.id } })).status, 403, 'cozinheiro copia');
      const copy = await api(`/rafanutri/uan/units/${U1}/checklist-templates/copy`, { token: a.token, method: 'POST', body: { template_id: lib.id } });
      assert.equal(copy.status, 201, JSON.stringify(copy.json));
      const T = copy.json.data.id;
      const body = { name: 'Higiene — manhã', category: 'hygiene', frequency_hint: 'daily', active: true, items: [{ prompt: 'Touca em uso?', critical: true }, { prompt: 'Câmara fria', kind: 'number', unit: '°C', max_value: 5 }] };
      assert.equal((await api(`/rafanutri/uan/checklist-templates/${T}`, { token: a.token, method: 'PUT', body })).status, 200, 'owner edita');
      assert.equal((await api(`/rafanutri/uan/checklist-templates/${T}`, { token: a.token, method: 'PUT', body: { ...body, items: [{ prompt: 'X', kind: 'number' }] } })).status, 400, 'item numérico sem limite');
      const seen = await api(`/rafanutri/uan/checklist-templates/${T}`, { token: b.token });
      assert.equal(seen.status, 200);
      assert.equal(seen.json.data.can_edit, false, 'cozinheiro só lê');
      assert.equal(seen.json.data.items.length, 2);
      assert.equal((await api(`/rafanutri/uan/checklist-templates/${T}`, { token: b.token, method: 'PUT', body })).status, 403, 'cozinheiro edita');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/checklist-templates/${T}`, { token: out.token })).status, 404, 'de fora lê');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/checklist-schedules`, { token: b.token, method: 'POST', body: { template_id: T, weekdays: [1, 2, 3, 4, 5, 6, 7], at_time: '00:15' } })).status, 403, 'cozinheiro agenda');
      const sch = await api(`/rafanutri/uan/units/${U1}/checklist-schedules`, { token: a.token, method: 'POST', body: { template_id: T, weekdays: [1, 2, 3, 4, 5, 6, 7], at_time: '00:15', tolerance_minutes: 15 } });
      assert.equal(sch.status, 201, JSON.stringify(sch.json));
      const today = (await api(`/rafanutri/uan/units/${U1}/checklists`, { token: b.token })).json.data.today;
      assert.ok(today.some((d) => d.template_id === T && ['overdue', 'pending'].includes(d.status)), 'agenda de hoje para a equipe');
      assert.equal((await api(`/rafanutri/uan/checklist-schedules/${sch.json.data.id}`, { token: out.token, method: 'DELETE' })).status, 404, 'de fora remove');
      assert.equal((await api(`/rafanutri/uan/checklist-schedules/${sch.json.data.id}`, { token: b.token, method: 'DELETE' })).status, 403, 'cozinheiro remove');
      assert.equal((await api(`/rafanutri/uan/checklist-schedules/${sch.json.data.id}`, { token: a.token, method: 'DELETE' })).status, 200);
    });
    await check('UAN: painel de conformidade — owner vê as unidades da empresa; cozinheiro só a dele; de fora, nada', async () => {
      const own = (await api('/rafanutri/uan/compliance', { token: a.token })).json.data.organizations.find((o) => o.id === A);
      assert.ok(own.units.some((u) => u.id === U1), 'owner vê a unidade 1');
      const mine = (await api('/rafanutri/uan/compliance', { token: b.token })).json.data.organizations.find((o) => o.id === A);
      assert.deepEqual(mine.units.map((u) => u.id), [U1], 'cozinheiro só a unidade 1');
      assert.ok('index' in mine.units[0] && 'components' in mine.units[0], 'índice calculado');
      const out = await outsider();
      assert.deepEqual((await api('/rafanutri/uan/compliance', { token: out.token })).json.data.organizations, [], 'de fora');
      assert.equal((await api('/rafanutri/uan/compliance')).status, 401);
    });
    await check('UAN: insumos e fornecedores — cozinheiro vê mas não cadastra; de fora não vê; TACO só pública', async () => {
      const ing = await api(`/rafanutri/uan/organizations/${A}/ingredients`, { token: a.token, method: 'POST', body: { name: 'Arroz teste', category: 'grains', purchase_unit: 'kg', storage: 'ambient', allergens: [] } });
      assert.equal(ing.status, 201, JSON.stringify(ing.json));
      const ING = ing.json.data.id;
      assert.equal((await api(`/rafanutri/uan/organizations/${A}/ingredients`, { token: a.token, method: 'POST', body: { name: 'arroz TESTE', category: 'grains', purchase_unit: 'kg', storage: 'ambient' } })).status, 409, 'nome repetido');
      assert.equal((await api(`/rafanutri/uan/organizations/${A}/ingredients`, { token: b.token, method: 'POST', body: { name: 'Feijão', category: 'grains', purchase_unit: 'kg', storage: 'ambient' } })).status, 403, 'cozinheiro cadastra');
      const list = await api(`/rafanutri/uan/organizations/${A}/ingredients`, { token: b.token });
      assert.equal(list.status, 200);
      assert.equal(list.json.data.can_manage, false);
      assert.ok(list.json.data.items.some((i) => i.id === ING), 'cozinheiro vê');
      assert.equal((await api(`/rafanutri/uan/ingredients/${ING}/prices`, { token: b.token, method: 'POST', body: { price: '5,49' } })).status, 403, 'cozinheiro registra preço');
      const sup = await api(`/rafanutri/uan/organizations/${A}/suppliers`, { token: a.token, method: 'POST', body: { name: 'Atacado teste', cnpj: '12.345.678/0001-90' } });
      assert.equal(sup.status, 201, JSON.stringify(sup.json));
      assert.equal(sup.json.data.cnpj, '12345678000190');
      const price = await api(`/rafanutri/uan/ingredients/${ING}/prices`, { token: a.token, method: 'POST', body: { price: '5,49', supplier_id: sup.json.data.id } });
      assert.equal(price.status, 201, JSON.stringify(price.json));
      assert.equal((await api(`/rafanutri/uan/ingredients/${ING}`, { token: b.token })).json.data.current_price.price_cents, 549);
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/organizations/${A}/ingredients`, { token: out.token })).status, 404, 'de fora lista');
      assert.equal((await api(`/rafanutri/uan/ingredients/${ING}`, { token: out.token })).status, 404, 'de fora lê');
      assert.equal((await api(`/rafanutri/uan/organizations/${A}/suppliers`, { token: out.token })).status, 404, 'de fora vê fornecedores');
      assert.deepEqual((await api('/rafanutri/uan/foods?q=arroz', { token: out.token })).json.data, [], 'busca só para quem atua na UAN');
      assert.ok((await api('/rafanutri/uan/foods?q=arroz', { token: b.token })).json.data.length > 0, 'busca na TACO');
      assert.equal((await api(`/rafanutri/uan/organizations/${B}/ingredients`, { token: a.token })).status, 404, 'empresa sem UAN');
      assert.ok((await api('/items/ingredients?limit=1', { token: b.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: fichas técnicas — cozinheiro vê sem custo, não cria nem aprova; ciclo de sub-receita recusado; de fora não vê', async () => {
      const ing = (await api(`/rafanutri/uan/organizations/${A}/ingredients`, { token: a.token })).json.data.items.find((i) => i.name === 'Arroz teste');
      const s1 = await api(`/rafanutri/uan/organizations/${A}/tech-sheets`, { token: a.token, method: 'POST', body: { name: 'Arroz cozido teste', category: 'side', servings: 10 } });
      assert.equal(s1.status, 201, JSON.stringify(s1.json));
      const S1 = s1.json.data.id;
      assert.equal((await api(`/rafanutri/uan/organizations/${A}/tech-sheets`, { token: b.token, method: 'POST', body: { name: 'X', servings: 1 } })).status, 403, 'cozinheiro cria');
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${S1}`, { token: a.token, method: 'PUT', body: { name: 'Arroz cozido teste', category: 'side', servings: 10, items: [{ ingredient_id: ing.id, gross_g: 1000 }], steps: [{ text: 'Cozinhar', critical: true, target_temp: 74 }] } })).status, 200);
      const s2 = await api(`/rafanutri/uan/organizations/${A}/tech-sheets`, { token: a.token, method: 'POST', body: { name: 'Prato teste', servings: 5 } });
      const S2 = s2.json.data.id;
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${S2}`, { token: a.token, method: 'PUT', body: { name: 'Prato teste', category: 'main', servings: 5, items: [{ sub_sheet_id: S1, gross_g: 500 }] } })).status, 200);
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${S1}`, { token: a.token, method: 'PUT', body: { name: 'Arroz cozido teste', category: 'side', servings: 10, items: [{ ingredient_id: ing.id, gross_g: 1000 }, { sub_sheet_id: S2, gross_g: 10 }] } })).status, 409, 'ciclo recusado');
      const cookView = (await api(`/rafanutri/uan/tech-sheets/${S2}`, { token: b.token })).json.data;
      assert.equal(cookView.can_see_cost, false);
      assert.ok(cookView.graph.ingredients.every((i) => i.price_per_kg_cents === null), 'cozinheiro sem preço');
      assert.equal(cookView.can_edit, false);
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${S1}/approve`, { token: b.token, method: 'POST', body: { computed: {} } })).status, 403, 'cozinheiro aprova');
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${S1}/approve`, { token: a.token, method: 'POST', body: { computed: { costCents: 549, costPerServingCents: 55 } } })).status, 200, 'owner aprova');
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${S1}`, { token: a.token, method: 'PUT', body: { name: 'Mudada', category: 'side', servings: 10, items: [] } })).status, 409, 'aprovada não muda');
      const v2 = await api(`/rafanutri/uan/tech-sheets/${S1}/new-version`, { token: a.token, method: 'POST', body: {} });
      assert.equal(v2.status, 201);
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${S1}`, { token: b.token })).json.data.sheet.computed, null, 'cozinheiro não vê o custo gravado');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${S1}`, { token: out.token })).status, 404, 'de fora lê');
      assert.equal((await api(`/rafanutri/uan/organizations/${A}/tech-sheets`, { token: out.token })).status, 404, 'de fora lista');
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${S1}/duplicate`, { token: out.token, method: 'POST', body: {} })).status, 404, 'de fora duplica');
      assert.ok((await api('/items/tech_sheets?limit=1', { token: b.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: cardápio — cozinheiro só vê o aprovado, não monta nem aprova; teto de custo exige justificativa; de fora não vê', async () => {
      const sheets = (await api(`/rafanutri/uan/organizations/${A}/tech-sheets`, { token: a.token })).json.data.items;
      const approved = sheets.find((x) => x.name === 'Arroz cozido teste' && x.status === 'approved');
      assert.ok(approved, 'ficha aprovada');
      const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
      assert.equal((await api(`/rafanutri/uan/units/${U1}/menus`, { token: b.token, method: 'POST', body: { name: 'X', starts_on: today, length_days: 7, services: ['lunch'], slots: ['side'] } })).status, 403, 'cozinheiro cria');
      const c = await api(`/rafanutri/uan/units/${U1}/menus`, { token: a.token, method: 'POST', body: { name: 'Cardápio teste', starts_on: today, length_days: 7, services: ['lunch'], slots: ['side'], cost_target: '0,01' } });
      assert.equal(c.status, 201, JSON.stringify(c.json));
      const M = c.json.data.id;
      assert.equal((await api(`/rafanutri/uan/menus/${M}`, { token: b.token })).status, 404, 'cozinheiro não vê rascunho');
      for (let d = 1; d <= 7; d++) assert.equal((await api(`/rafanutri/uan/menus/${M}/items`, { token: a.token, method: 'PUT', body: { day_index: d, service: 'lunch', slot: 'side', sheet_root_id: approved.root_id } })).status, 200);
      assert.equal((await api(`/rafanutri/uan/menus/${M}/items`, { token: b.token, method: 'PUT', body: { day_index: 1, service: 'lunch', slot: 'side', sheet_root_id: null } })).status, 404, 'cozinheiro altera');
      const noJust = await api(`/rafanutri/uan/menus/${M}/submit`, { token: a.token, method: 'POST', body: { note: '' } });
      assert.equal(noJust.status, 400, 'acima do teto sem justificativa');
      assert.equal(noJust.json.errors[0].extensions.code, 'COST_OVER');
      assert.equal((await api(`/rafanutri/uan/menus/${M}/submit`, { token: a.token, method: 'POST', body: { note: 'Teto de teste baixo de propósito' } })).status, 200);
      assert.equal((await api(`/rafanutri/uan/menus/${M}/approve`, { token: b.token, method: 'POST', body: {} })).status, 404, 'cozinheiro aprova');
      assert.equal((await api(`/rafanutri/uan/menus/${M}/approve`, { token: a.token, method: 'POST', body: {} })).status, 200, 'owner aprova');
      const cookList = (await api(`/rafanutri/uan/units/${U1}/menus`, { token: b.token })).json.data;
      assert.ok(cookList.cycles.some((x) => x.id === M), 'cozinheiro vê o aprovado');
      assert.ok(cookList.today_menus.some((m) => m.cycle_id === M && m.items.some((i) => i.name === 'Arroz cozido teste')), 'cardápio do dia');
      assert.equal((await api(`/rafanutri/uan/menus/${M}`, { token: b.token })).json.data.cost, null, 'cozinheiro sem custo');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/menus/${M}`, { token: out.token })).status, 404, 'de fora');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/menus`, { token: out.token })).status, 404, 'de fora lista');
      assert.ok((await api('/items/menu_cycles?limit=1', { token: b.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: produção — cozinheiro pesa mas não muda comensais; dia futuro recusado; de fora não vê', async () => {
      const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 21 * 3600e3).toISOString().slice(0, 10);
      assert.equal((await api(`/rafanutri/uan/units/${U1}/diners`, { token: b.token, method: 'POST', body: { day: today, service: 'lunch', planned: 10 } })).status, 403, 'cozinheiro muda comensais');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/diners`, { token: a.token, method: 'POST', body: { day: today, service: 'lunch', planned: 10, actual: 8 } })).status, 200);
      const pat = await api(`/rafanutri/uan/units/${U1}/diners/pattern`, { token: a.token, method: 'POST', body: { from: today, to: today, weekdays: [1, 2, 3, 4, 5, 6, 7], service: 'dinner', planned: 5 } });
      assert.equal(pat.json.data.days, 1, 'padrão aplicado');
      const prod = await api(`/rafanutri/uan/units/${U1}/production?date=${today}`, { token: b.token });
      assert.equal(prod.status, 200);
      assert.ok(prod.json.data.menu.some((m) => m.name === 'Arroz cozido teste'), 'cardápio do dia na produção');
      assert.ok(prod.json.data.graph.ingredients.every((i) => i.price_per_kg_cents === null), 'cozinheiro sem preço');
      const root = prod.json.data.menu[0].sheet_root_id;
      assert.equal((await api(`/rafanutri/uan/units/${U1}/waste`, { token: b.token, method: 'PUT', body: { day: today, service: 'lunch', sheet_root_id: root, produced_g: 1000, leftover_g: 40, portions_served: 7 } })).status, 200, 'cozinheiro pesa');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/waste`, { token: b.token, method: 'PUT', body: { day: today, service: 'lunch', sheet_root_id: root, produced_g: 1000, leftover_g: 50 } })).status, 200, 'corrige a mesma pesagem');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/waste`, { token: b.token, method: 'PUT', body: { day: today, service: 'lunch', sheet_root_id: root, produced_g: 10, leftover_g: 50 } })).status, 400, 'sobra maior que produzido');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/waste`, { token: b.token, method: 'PUT', body: { day: tomorrow, service: 'lunch', plate_waste_g: 10 } })).status, 409, 'dia futuro');
      const after = (await api(`/rafanutri/uan/units/${U1}/production?date=${today}`, { token: a.token })).json.data;
      assert.equal(after.waste.filter((w) => w.sheet_root_id === root).length, 1, 'um registro por preparação');
      assert.equal(after.waste.find((w) => w.sheet_root_id === root).leftover_g, 50);
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/units/${U1}/production`, { token: out.token })).status, 404, 'de fora lê');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/waste`, { token: out.token, method: 'PUT', body: { day: today, service: 'lunch', plate_waste_g: 10 } })).status, 404, 'de fora pesa');
      assert.equal((await api(`/rafanutri/uan/units/${U2}/waste`, { token: b.token, method: 'PUT', body: { day: today, service: 'lunch', plate_waste_g: 10 } })).status, 404, 'outra unidade');
      assert.ok((await api('/items/waste_records?limit=1', { token: b.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: estoque — cozinheiro vê mas não movimenta; FEFO e saldo insuficiente; inventário cego e aprovação só RT/owner; de fora não vê', async () => {
      const ing = (await api(`/rafanutri/uan/organizations/${A}/ingredients`, { token: a.token })).json.data.items.find((i) => i.name === 'Arroz teste');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/stock/in`, { token: b.token, method: 'POST', body: { ingredient_id: ing.id, quantity: '5' } })).status, 403, 'cozinheiro dá entrada');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/stock/in`, { token: a.token, method: 'POST', body: { ingredient_id: ing.id, quantity: '5', lot_code: 'L2', expires_on: '2030-01-10' } })).status, 201);
      assert.equal((await api(`/rafanutri/uan/units/${U1}/stock/in`, { token: a.token, method: 'POST', body: { ingredient_id: ing.id, quantity: '3', lot_code: 'L1', expires_on: '2030-01-05' } })).status, 201);
      assert.equal((await api(`/rafanutri/uan/units/${U1}/stock/out`, { token: a.token, method: 'POST', body: { kind: 'out_production', lines: [{ ingredient_id: ing.id, quantity: '2' }] } })).status, 200);
      const st = (await api(`/rafanutri/uan/units/${U1}/stock`, { token: b.token })).json.data;
      assert.equal(st.can_move, false, 'cozinheiro só vê');
      const lots = st.lots.filter((l) => l.ingredient_id === ing.id);
      assert.equal(lots.find((l) => l.lot_code === 'L1').quantity_g, 1000, 'FEFO consumiu o que vence antes');
      assert.equal(lots.find((l) => l.lot_code === 'L2').quantity_g, 5000);
      assert.equal((await api(`/rafanutri/uan/units/${U1}/stock/out`, { token: a.token, method: 'POST', body: { kind: 'out_production', lines: [{ ingredient_id: ing.id, quantity: '100' }] } })).status, 409, 'saldo insuficiente');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/stock/out`, { token: a.token, method: 'POST', body: { kind: 'out_loss', lines: [{ ingredient_id: ing.id, quantity: '1' }] } })).status, 409, 'perda sem motivo');
      assert.equal((await api(`/rafanutri/uan/units/${U2}/stock/in`, { token: a.token, method: 'POST', body: { ingredient_id: randomUUID(), quantity: '1' } })).status, 400, 'insumo inexistente');
      const inv = await api(`/rafanutri/uan/units/${U1}/inventories`, { token: a.token, method: 'POST', body: {} });
      assert.equal(inv.status, 201, JSON.stringify(inv.json));
      const INV = inv.json.data.id;
      assert.equal((await api(`/rafanutri/uan/inventories/${INV}`, { token: b.token })).status, 404, 'cozinheiro não conta');
      assert.equal((await api(`/rafanutri/uan/inventories/${INV}/counts`, { token: a.token, method: 'PUT', body: { ingredient_id: ing.id, counted: '4', reason: 'Contagem' } })).status, 200);
      assert.equal((await api(`/rafanutri/uan/inventories/${INV}/approve`, { token: a.token, method: 'POST', body: {} })).json.data.adjustments, 1, 'owner aprova o ajuste');
      const after = (await api(`/rafanutri/uan/units/${U1}/stock`, { token: a.token })).json.data;
      assert.equal(after.lots.filter((l) => l.ingredient_id === ing.id).reduce((s2, l) => s2 + l.quantity_g, 0), 4000, 'saldo ajustado para a contagem');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/units/${U1}/stock`, { token: out.token })).status, 404, 'de fora lê');
      assert.equal((await api(`/rafanutri/uan/inventories/${INV}`, { token: out.token })).status, 404, 'de fora lê inventário');
      assert.ok((await api('/items/stock_lots?limit=1', { token: b.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: compras — cozinheiro não vê; pedido por fornecedor; recebimento entra no estoque e recusa exige motivo; de fora não vê', async () => {
      const ing = (await api(`/rafanutri/uan/organizations/${A}/ingredients`, { token: a.token })).json.data.items.find((i) => i.name === 'Arroz teste');
      const sup = (await api(`/rafanutri/uan/organizations/${A}/suppliers`, { token: a.token })).json.data.items.find((x) => x.name === 'Atacado teste');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/purchase-needs`, { token: b.token })).status, 403, 'cozinheiro vê necessidade');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/purchase-needs`, { token: a.token })).status, 200);
      const po = await api(`/rafanutri/uan/units/${U1}/purchase-orders`, { token: a.token, method: 'POST', body: { orders: [{ supplier_id: sup.id, items: [{ ingredient_id: ing.id, quantity_units: 2 }] }] } });
      assert.equal(po.status, 201, JSON.stringify(po.json));
      const PO = po.json.data.id;
      assert.equal((await api(`/rafanutri/uan/purchase-orders/${PO}`, { token: a.token })).json.data.items[0].unit_price_cents, 549, 'preço vigente no pedido');
      assert.equal((await api(`/rafanutri/uan/purchase-orders/${PO}`, { token: b.token })).status, 404, 'cozinheiro vê pedido');
      assert.equal((await api(`/rafanutri/uan/purchase-orders/${PO}/receive`, { token: a.token, method: 'POST', body: { items: [{ ingredient_id: ing.id, quantity_units: 2, accepted: true }] } })).status, 409, 'rascunho não recebe');
      assert.equal((await api(`/rafanutri/uan/purchase-orders/${PO}/send`, { token: a.token, method: 'POST', body: {} })).status, 200);
      assert.equal((await api(`/rafanutri/uan/purchase-orders/${PO}/receive`, { token: a.token, method: 'POST', body: { items: [{ ingredient_id: ing.id, quantity_units: 2, accepted: false, temperature: 9 }] } })).status, 409, 'recusa sem motivo');
      const before = (await api(`/rafanutri/uan/units/${U1}/stock`, { token: a.token })).json.data.lots.filter((l) => l.ingredient_id === ing.id).reduce((s2, l) => s2 + l.quantity_g, 0);
      assert.equal((await api(`/rafanutri/uan/purchase-orders/${PO}/receive`, { token: a.token, method: 'POST', body: { invoice_number: 'NF 1', items: [{ ingredient_id: ing.id, quantity_units: 2, accepted: true, lot_code: 'R1', expires_on: '2030-02-01', unit_price: '5,60' }] } })).status, 200);
      const after = (await api(`/rafanutri/uan/units/${U1}/stock`, { token: a.token })).json.data.lots.filter((l) => l.ingredient_id === ing.id).reduce((s2, l) => s2 + l.quantity_g, 0);
      assert.equal(after - before, 2000, 'entrou no estoque');
      assert.equal((await api(`/rafanutri/uan/ingredients/${ing.id}`, { token: a.token })).json.data.current_price.price_cents, 560, 'preço do recebimento');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/purchase-orders/${PO}`, { token: out.token })).status, 404, 'de fora lê');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/purchase-orders`, { token: out.token })).status, 404, 'de fora lista');
      assert.ok((await api('/items/purchase_orders?limit=1', { token: b.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: custos — cozinheiro não vê; consumo real pelas retiradas para produção; de fora não vê', async () => {
      assert.equal((await api(`/rafanutri/uan/units/${U1}/costs`, { token: b.token })).status, 403, 'cozinheiro vê custos');
      const c = await api(`/rafanutri/uan/units/${U1}/costs`, { token: a.token });
      assert.equal(c.status, 200, JSON.stringify(c.json));
      assert.ok(c.json.data.criterion.includes('retiradas do estoque'), 'critério explícito');
      assert.ok(c.json.data.consumption.some((x) => x.name === 'Arroz teste' && x.grams === 2000), 'retirada para produção do dia');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/costs?from=2026-01-01&to=2026-03-01`, { token: a.token })).status, 400, 'período longo');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/units/${U1}/costs`, { token: out.token })).status, 404, 'de fora');
    });
    await check('UAN: documentos e treinamentos — cozinheiro lê e dá ciência, não cria nem aprova; aprovada é imutável; de fora não vê', async () => {
      assert.equal((await api(`/rafanutri/uan/units/${U1}/documents`, { token: b.token, method: 'POST', body: { title: 'POP teste', body_md: '# x' } })).status, 403, 'cozinheiro cria');
      const d = await api(`/rafanutri/uan/units/${U1}/documents`, { token: a.token, method: 'POST', body: { title: 'POP teste', kind: 'pop', code: 'pop-teste', body_md: '# POP\n\nTexto' } });
      assert.equal(d.status, 201, JSON.stringify(d.json));
      const D = d.json.data.id;
      assert.equal((await api(`/rafanutri/uan/documents/${D}/acknowledge`, { token: b.token, method: 'POST', body: {} })).status, 409, 'ciência sem versão aprovada');
      assert.equal((await api(`/rafanutri/uan/documents/${D}/approve`, { token: b.token, method: 'POST', body: {} })).status, 403, 'cozinheiro aprova');
      assert.equal((await api(`/rafanutri/uan/documents/${D}/approve`, { token: a.token, method: 'POST', body: {} })).status, 200);
      const g = await api(`/rafanutri/uan/documents/${D}`, { token: b.token });
      assert.equal(g.status, 200);
      assert.equal(g.json.data.current.content_hash.length, 64, 'hash SHA-256');
      assert.equal(g.json.data.can_edit, false);
      assert.equal((await api(`/rafanutri/uan/documents/${D}/acknowledge`, { token: b.token, method: 'POST', body: {} })).status, 200);
      assert.equal((await api(`/rafanutri/uan/documents/${D}`, { token: b.token })).json.data.acknowledged, true);
      assert.equal((await api(`/rafanutri/uan/documents/${D}/draft`, { token: b.token, method: 'PUT', body: { body_md: 'y' } })).status, 403, 'cozinheiro edita');
      assert.equal((await api(`/rafanutri/uan/documents/${D}/draft`, { token: a.token, method: 'PUT', body: { body_md: '# POP v2' } })).status, 200);
      const g2 = (await api(`/rafanutri/uan/documents/${D}`, { token: a.token })).json.data;
      assert.equal(g2.draft.version, 2, 'nova versão a partir da aprovada');
      assert.equal(g2.current.body_md, '# POP\n\nTexto', 'aprovada intacta');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/trainings`, { token: b.token, method: 'POST', body: { topic: 'BPF', held_on: '2026-11-01', hours: 2, other_names: ['Fulano'] } })).status, 403, 'cozinheiro registra treinamento');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/trainings`, { token: a.token, method: 'POST', body: { topic: 'BPF', held_on: '2026-11-01', hours: 2, attendee_ids: [uidB] } })).status, 201);
      const t = await api(`/rafanutri/uan/units/${U1}/trainings`, { token: b.token });
      assert.equal(t.status, 200);
      assert.equal(t.json.data.team.find((m) => m.user_id === uidB)?.last_training_on, '2026-11-01', 'último treinamento do cozinheiro');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/documents/${D}`, { token: out.token })).status, 404, 'de fora lê documento');
      assert.equal((await api(`/rafanutri/uan/documents/${D}/acknowledge`, { token: out.token, method: 'POST', body: {} })).status, 404, 'de fora dá ciência');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/trainings`, { token: out.token })).status, 404, 'de fora lista treinamentos');
      assert.ok((await api('/items/quality_document_versions?limit=1', { token: a.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: licenças, integridade, dossiê e Manual — cozinheiro não registra nem vê o dossiê; emissão registrada; de fora não vê', async () => {
      assert.equal((await api(`/rafanutri/uan/units/${U1}/licenses`, { token: b.token, method: 'POST', body: { kind: 'sanitary_permit', number: '1' } })).status, 403, 'cozinheiro registra licença');
      const l = await api(`/rafanutri/uan/units/${U1}/licenses`, { token: a.token, method: 'POST', body: { kind: 'sanitary_permit', number: 'AL-1', issued_on: '2026-01-01', valid_until: '2027-01-01' } });
      assert.equal(l.status, 201, JSON.stringify(l.json));
      assert.equal((await api(`/rafanutri/uan/units/${U1}/licenses`, { token: a.token, method: 'POST', body: { kind: 'pest_control', issued_on: '2026-02-01', valid_until: '2026-01-01' } })).status, 400, 'validade antes da emissão');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/licenses`, { token: b.token })).json.data.licenses.length, 1, 'cozinheiro lê licenças');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/dossier`, { token: b.token })).status, 403, 'cozinheiro vê dossiê');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/integrity`, { token: b.token })).status, 403, 'cozinheiro vê integridade');
      const d = await api(`/rafanutri/uan/units/${U1}/dossier`, { token: a.token });
      assert.equal(d.status, 200, JSON.stringify(d.json));
      assert.equal(d.json.data.integrity.divergent, 0, 'sem divergência');
      assert.ok(d.json.data.documents.some((x) => x.title === 'POP teste'), 'documento vigente no dossiê');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/dossier?from=2026-01-01&to=2026-11-18`, { token: a.token })).status, 400, 'período longo');
      const hash = 'c'.repeat(64);
      assert.equal((await api(`/rafanutri/uan/units/${U1}/exports`, { token: b.token, method: 'POST', body: { kind: 'manual', file_hash: hash } })).status, 403, 'cozinheiro emite Manual');
      const e1 = await api(`/rafanutri/uan/units/${U1}/exports`, { token: a.token, method: 'POST', body: { kind: 'manual', file_hash: hash, includes: { documents: [] } } });
      assert.equal(e1.status, 201, JSON.stringify(e1.json));
      assert.equal(e1.json.data.edition, 1, 'edição 1');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/exports`, { token: a.token, method: 'POST', body: { kind: 'manual', file_hash: hash } })).json.data.edition, 2, 'edição 2');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/manual`, { token: b.token })).json.data.can_issue, false, 'cozinheiro não emite');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/units/${U1}/licenses`, { token: out.token })).status, 404, 'de fora lê licenças');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/dossier`, { token: out.token })).status, 404, 'de fora lê dossiê');
      assert.equal((await api(`/rafanutri/uan/licenses/${l.json.data.id}`, { token: out.token, method: 'PATCH', body: { archived: true } })).status, 404, 'de fora arquiva');
      assert.ok((await api('/items/compliance_exports?limit=1', { token: a.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: APPCC — cozinheiro lê e não edita; aprovação exige PCC completo; aprovado imutável; de fora não vê', async () => {
      assert.equal((await api(`/rafanutri/uan/units/${U1}/haccp`, { token: b.token, method: 'POST', body: { title: 'APPCC teste' } })).status, 403, 'cozinheiro cria');
      const p = await api(`/rafanutri/uan/units/${U1}/haccp`, { token: a.token, method: 'POST', body: { title: 'APPCC teste' } });
      assert.equal(p.status, 201, JSON.stringify(p.json));
      const P = p.json.data.id;
      const hz = { kind: 'biological', description: 'Sobrevivência de patógenos', severity: 3, probability: 2, q1: true, q2: true };
      assert.equal((await api(`/rafanutri/uan/haccp/${P}`, { token: a.token, method: 'PUT', body: { title: 'APPCC teste', steps: [{ name: 'Cocção', target_temp: 74, hazards: [hz] }] } })).status, 200);
      assert.equal((await api(`/rafanutri/uan/haccp/${P}/approve`, { token: a.token, method: 'POST', body: {} })).status, 409, 'PCC sem limite');
      assert.equal((await api(`/rafanutri/uan/haccp/${P}`, { token: b.token, method: 'PUT', body: { title: 'x', steps: [] } })).status, 403, 'cozinheiro edita');
      const full = { ...hz, critical_limit: 'mínimo 74 °C', monitoring_what: 'Temperatura no centro', corrective_action: 'Continuar a cocção' };
      assert.equal((await api(`/rafanutri/uan/haccp/${P}`, { token: a.token, method: 'PUT', body: { title: 'APPCC teste', steps: [{ name: 'Cocção', target_temp: 74, hazards: [full] }] } })).status, 200);
      assert.equal((await api(`/rafanutri/uan/haccp/${P}/approve`, { token: b.token, method: 'POST', body: {} })).status, 403, 'cozinheiro aprova');
      assert.equal((await api(`/rafanutri/uan/haccp/${P}/approve`, { token: a.token, method: 'POST', body: {} })).status, 200);
      const g = await api(`/rafanutri/uan/haccp/${P}`, { token: b.token });
      assert.equal(g.status, 200);
      assert.equal(g.json.data.steps[0].hazards[0].decision, 'ccp', 'decisão do banco');
      assert.equal(g.json.data.steps[0].hazards[0].ccp_number, 1, 'PCC 1');
      assert.equal((await api(`/rafanutri/uan/haccp/${P}`, { token: a.token, method: 'PUT', body: { title: 'x', steps: [] } })).status, 409, 'aprovado não muda');
      const nv = await api(`/rafanutri/uan/haccp/${P}/new-version`, { token: a.token, method: 'POST', body: {} });
      assert.equal(nv.status, 201);
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/haccp/${P}`, { token: out.token })).status, 404, 'de fora lê');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/haccp`, { token: out.token })).status, 404, 'de fora lista');
      assert.ok((await api('/items/haccp_plans?limit=1', { token: a.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: rótulos — cozinheiro não emite; só de ficha aprovada e com a tabela completa; de fora não vê', async () => {
      const list = (await api(`/rafanutri/uan/organizations/${A}/tech-sheets`, { token: a.token })).json.data.items;
      const approved = list.find((x) => x.status === 'approved');
      const draft = list.find((x) => x.status === 'draft');
      assert.ok(approved, 'ficha aprovada do teste');
      const keys = ['energy_kcal', 'carbohydrate_g', 'total_sugar_g', 'added_sugar_g', 'protein_g', 'lipid_g', 'saturated_fat_g', 'trans_fat_g', 'fiber_g', 'sodium_mg'];
      const full = Object.fromEntries(keys.map((k) => [k, 1]));
      const body = { product_name: 'Arroz', physical_state: 'solid', portion_g: 100, household_measure: '1 escumadeira', values: { per100: full, perPortion: full, vd: full }, front_warnings: [], allergens: ['milk'], allergen_statement: 'ALÉRGICOS: CONTÉM LEITE.' };
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${approved.id}/labels`, { token: b.token, method: 'POST', body })).status, 403, 'cozinheiro emite');
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${approved.id}/labels`, { token: a.token, method: 'POST', body: { ...body, values: { per100: { ...full, trans_fat_g: null }, perPortion: full, vd: full } } })).status, 400, 'tabela incompleta');
      if (draft) assert.equal((await api(`/rafanutri/uan/tech-sheets/${draft.id}/labels`, { token: a.token, method: 'POST', body })).status, 409, 'ficha em rascunho');
      const l = await api(`/rafanutri/uan/tech-sheets/${approved.id}/labels`, { token: a.token, method: 'POST', body });
      assert.equal(l.status, 201, JSON.stringify(l.json));
      assert.equal((await api(`/rafanutri/uan/labels/${l.json.data.id}`, { token: b.token })).json.data.product_name, 'Arroz', 'cozinheiro lê');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/labels/${l.json.data.id}`, { token: out.token })).status, 404, 'de fora lê rótulo');
      assert.equal((await api(`/rafanutri/uan/tech-sheets/${approved.id}/labels`, { token: out.token })).status, 404, 'de fora lista');
      assert.ok((await api('/items/nutrition_labels?limit=1', { token: a.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: cardápio público — só com link publicado, sem dados internos; pesquisa uma vez por aparelho; cozinheiro não configura', async () => {
      assert.equal((await api(`/rafanutri/uan/units/${U1}/public-menu`, { token: b.token, method: 'POST', body: { enabled: true } })).status, 403, 'cozinheiro publica');
      const on = await api(`/rafanutri/uan/units/${U1}/public-menu`, { token: a.token, method: 'POST', body: { enabled: true } });
      assert.equal(on.status, 200, JSON.stringify(on.json));
      const tok = on.json.data.token;
      assert.match(tok, /^[A-Za-z0-9_-]{32}$/);
      const pub = await api(`/rafanutri/public/menus/${tok}?week=1`);
      assert.equal(pub.status, 200, JSON.stringify(pub.json));
      assert.equal(pub.json.data.days.length, 7, 'semana');
      const raw = JSON.stringify(pub.json);
      assert.ok(!/cost|price|supplier|organization_id|unit_id/.test(raw), 'sem custo, fornecedor nem ids internos');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/surveys`, { token: b.token, method: 'POST', body: { questions: [{ text: 'Nota?', kind: 'stars' }] } })).status, 403, 'cozinheiro cria pesquisa');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/surveys`, { token: a.token, method: 'POST', body: { per_dish: false, questions: [{ text: 'Nota da refeição?', kind: 'stars' }] } })).status, 201);
      const dev = randomUUID();
      const r1 = await api(`/rafanutri/public/menus/${tok}/responses`, { method: 'POST', body: { device_id: dev, answers: [5], comment: 'Ótimo' } });
      assert.equal(r1.status, 201, JSON.stringify(r1.json));
      assert.equal((await api(`/rafanutri/public/menus/${tok}/responses`, { method: 'POST', body: { device_id: dev, answers: [4] } })).status, 409, 'uma vez por aparelho e dia');
      assert.equal((await api(`/rafanutri/public/menus/${tok}/responses`, { method: 'POST', body: { device_id: randomUUID(), answers: [9] } })).status, 400, 'nota inválida');
      const st = await api(`/rafanutri/uan/units/${U1}/public-menu`, { token: a.token });
      assert.equal(st.json.data.results[0].responses, 1, 'resultado da pesquisa');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/units/${U1}/public-menu`, { token: out.token })).status, 404, 'de fora vê configuração');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/public-menu`, { token: a.token, method: 'POST', body: { enabled: false } })).status, 200);
      assert.equal((await api(`/rafanutri/public/menus/${tok}`)).status, 404, 'despublicado some');
      assert.ok((await api('/items/satisfaction_responses?limit=1', { token: a.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: perfis e regras do cardápio — cozinheiro só lê; perfil da plataforma só se copia; de fora não vê', async () => {
      const pl = await api(`/rafanutri/uan/organizations/${A}/menu-planning`, { token: b.token });
      assert.equal(pl.status, 200);
      assert.equal(pl.json.data.can_manage, false, 'cozinheiro não edita');
      const pat = pl.json.data.profiles.find((p) => p.platform && p.code === 'pat-grande-refeicao');
      assert.ok(pat && !pat.validated, 'modelo PAT a validar');
      assert.equal((await api(`/rafanutri/uan/organizations/${A}/diner-profiles`, { token: b.token, method: 'POST', body: { copy_from: pat.id } })).status, 403, 'cozinheiro copia');
      assert.equal((await api(`/rafanutri/uan/diner-profiles/${pat.id}`, { token: a.token, method: 'PUT', body: { name: 'x', segment: 'pat', services: ['lunch'] } })).status, 404, 'perfil da plataforma não se edita');
      const cp = await api(`/rafanutri/uan/organizations/${A}/diner-profiles`, { token: a.token, method: 'POST', body: { copy_from: pat.id } });
      assert.equal(cp.status, 201, JSON.stringify(cp.json));
      assert.equal((await api(`/rafanutri/uan/diner-profiles/${cp.json.data.id}`, { token: a.token, method: 'PUT', body: { name: 'PAT teste', segment: 'pat', services: ['lunch'], targets: { energy_kcal: { min: 900, max: 800 } } } })).status, 400, 'mínimo maior que máximo');
      assert.equal((await api(`/rafanutri/uan/diner-profiles/${cp.json.data.id}`, { token: a.token, method: 'PUT', body: { name: 'PAT teste', segment: 'pat', services: ['lunch'], targets: { energy_kcal: { min: 600, max: 800 } }, validated: true } })).status, 200);
      assert.equal((await api(`/rafanutri/uan/organizations/${A}/menu-rules`, { token: a.token, method: 'POST', body: { kind: 'vetoed_ingredient' } })).status, 400, 'regra incompleta');
      const r = await api(`/rafanutri/uan/organizations/${A}/menu-rules`, { token: a.token, method: 'POST', body: { kind: 'cost_ceiling', cost: '12,50', profile_id: cp.json.data.id } });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal((await api(`/rafanutri/uan/menu-rules/${r.json.data.id}/deactivate`, { token: b.token, method: 'POST', body: {} })).status, 403, 'cozinheiro remove regra');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/organizations/${A}/menu-planning`, { token: out.token })).status, 404, 'de fora lê');
      assert.equal((await api(`/rafanutri/uan/diner-profiles/${cp.json.data.id}`, { token: out.token, method: 'PUT', body: { name: 'x', segment: 'pat', services: ['lunch'] } })).status, 404, 'de fora edita');
      assert.ok((await api('/items/menu_rules?limit=1', { token: a.token })).status >= 400, 'coleção direta recusada');
    });
    await check('UAN: ajuste local de per capita — cozinheiro não ajusta; fator vai para a produção; de fora não vê', async () => {
      const adj = await api(`/rafanutri/uan/units/${U1}/sheet-adjustments`, { token: a.token });
      assert.equal(adj.status, 200);
      const sheet = adj.json.data.sheets[0];
      assert.ok(sheet, 'ficha aprovada para ajustar');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/sheet-adjustments`, { token: b.token, method: 'PUT', body: { sheet_root_id: sheet.root_id, portion_factor: '1,2' } })).status, 403, 'cozinheiro ajusta');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/sheet-adjustments`, { token: a.token, method: 'PUT', body: { sheet_root_id: sheet.root_id, portion_factor: '9' } })).status, 400, 'fator fora da faixa');
      assert.equal((await api(`/rafanutri/uan/units/${U1}/sheet-adjustments`, { token: a.token, method: 'PUT', body: { sheet_root_id: sheet.root_id, portion_factor: '1,2' } })).status, 200);
      const prod = await api(`/rafanutri/uan/units/${U1}/production`, { token: a.token });
      assert.equal(prod.json.data.adjustments.find((x) => x.sheet_root_id === sheet.root_id)?.portion_factor, 1.2, 'fator na produção');
      const out = await outsider();
      assert.equal((await api(`/rafanutri/uan/units/${U1}/sheet-adjustments`, { token: out.token })).status, 404, 'de fora lê');
    });
    await check('UAN: contrato — só o owner vê; contrato encerrado deixa a UAN em modo leitura (lê, não grava)', async () => {
      const ct = await api(`/rafanutri/uan/organizations/${A}/contract`, { token: a.token });
      assert.equal(ct.status, 200, JSON.stringify(ct.json));
      assert.equal(ct.json.data.state, 'active');
      assert.equal((await api(`/rafanutri/uan/organizations/${A}/contract`, { token: b.token })).status, 403, 'cozinheiro vê contrato');
      const sql = (q) => String(execSync(process.env.ISOLATION_PSQL, { input: q, stdio: ['pipe', 'pipe', 'inherit'] }));
      const guard = `organization_id = '${A}' and exists (select 1 from organization_members m join directus_users u on u.id = m.user_id where m.organization_id = '${A}' and m.role = 'owner' and u.email like '%@example.com')`;
      sql(`update organization_contracts set starts_at = current_date - 400, ends_at = current_date - 10 where ${guard};`);
      try {
        assert.equal((await api(`/rafanutri/uan/organizations/${A}/contract`, { token: a.token })).json.data.state, 'read_only');
        assert.equal((await api('/rafanutri/uan/context', { token: a.token })).json.data.find((o) => o.id === A).contract_state, 'read_only');
        assert.equal((await api(`/rafanutri/uan/units/${U1}/licenses`, { token: a.token })).status, 200, 'lê no modo leitura');
        const w = await api(`/rafanutri/uan/units/${U1}/licenses`, { token: a.token, method: 'POST', body: { kind: 'other', title: 'Bloqueado' } });
        assert.equal(w.status, 403, 'grava no modo leitura');
        assert.equal(w.json.errors[0].extensions.code, 'READ_ONLY');
        assert.equal((await api(`/rafanutri/uan/organizations/${A}/menu-rules`, { token: a.token, method: 'POST', body: { kind: 'cost_ceiling', cost: '10' } })).status, 403, 'regra no modo leitura');
      } finally {
        sql(`update organization_contracts set ends_at = null where ${guard};`);
      }
      assert.equal((await api(`/rafanutri/uan/organizations/${A}/contract`, { token: a.token })).json.data.state, 'active', 'contrato restaurado');
    });
  } else {
    console.log('  (pulado) UAN entre unidades: defina ISOLATION_PSQL');
  }

  console.log(`${passed} verificações passaram.`);
} finally {
  if (ADMIN) {
    for (const id of created.orgs) await api(`/items/organizations/${id}`, { token: ADMIN, method: 'DELETE' });
    for (const id of created.users) await api(`/users/${id}`, { token: ADMIN, method: 'DELETE' });
  } else {
    console.log(`CLEANUP_JSON ${JSON.stringify(created)}`);
  }
}
