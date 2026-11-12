// RN-024 a RN-026 — Registra questionnaire_templates e anamneses no Directus e dá as permissões
// às políticas que já acessam `patients`, com o mesmo filtro de consultório. Idempotente.
//
// Pré-requisito: migração db/migrations/0008_anamneses.sql aplicada e Directus reiniciado.
// Uso: DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=... node db/directus/0008_anamneses.mjs

const URL_ = process.env.DIRECTUS_URL;
const ADMIN = process.env.DIRECTUS_ADMIN_TOKEN;
if (!URL_ || !ADMIN) {
  console.error('Defina DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN.');
  process.exit(2);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok && res.status !== 404 && res.status !== 403) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json?.errors ?? json)}`);
  }
  return { status: res.status, json };
}
const q = (filter) => `filter=${encodeURIComponent(JSON.stringify(filter))}`;

const COLLECTIONS = [
  { collection: 'questionnaire_templates', meta: { icon: 'quiz', note: 'RN-024/025 — modelos de questionário (organization_id nulo = padrão da plataforma)' } },
  { collection: 'anamneses', meta: { icon: 'assignment', note: 'RN-026 — anamneses enviadas aos pacientes (cópia do questionário + respostas)' } },
];

// 1. Coleções e campos de sistema (autor e datas preenchidos pelo Directus)
for (const c of COLLECTIONS) {
  const existing = await api(`/collections/${c.collection}`);
  if (existing.status === 200) console.log(`coleção ${c.collection}: já registrada`);
  else {
    await api('/collections', { method: 'POST', body: { collection: c.collection, meta: c.meta } });
    console.log(`coleção ${c.collection}: registrada`);
  }
  for (const [field, special] of [['user_created', 'user-created'], ['date_created', 'date-created'], ['date_updated', 'date-updated']]) {
    const r = await api(`/fields/${c.collection}/${field}`, { method: 'PATCH', body: { meta: { special: [special], readonly: true, hidden: true } } });
    if (r.status !== 200) {
      throw new Error(`${c.collection}.${field}: ${r.status}. Reinicie o Directus (docker compose restart directus) depois da migração e rode este script de novo.`);
    }
  }
  console.log(`${c.collection}: autor e datas automáticos`);
}

// 2. Permissões, copiando o filtro de consultório de `patients`
const { json } = await api(`/permissions?${q({ collection: { _eq: 'patients' } })}&fields=policy,action,permissions&limit=-1`);
const patientPerms = json.data;
const policies = [...new Set(patientPerms.map((p) => p.policy))];
if (!policies.length) throw new Error('Nenhuma permissão de patients encontrada para copiar.');

const ANAMNESIS_READ = ['id', 'organization_id', 'patient_id', 'template_id', 'template_version', 'title', 'schema_snapshot', 'answers', 'status', 'token_expires_at', 'answered_at', 'reviewed_at', 'reviewed_by', 'user_created', 'date_created', 'date_updated'];

for (const policy of policies) {
  const read = patientPerms.find((p) => p.policy === policy && p.action === 'read');
  if (!read) continue;
  const org = read.permissions ?? {};
  const wanted = {
    questionnaire_templates: [
      // Padrões da plataforma + modelos do próprio consultório.
      { action: 'read', permissions: { _or: [{ organization_id: { _null: true } }, org] }, fields: ['*'] },
      { action: 'create', permissions: null, validation: { organization_id: { _nnull: true } }, fields: ['organization_id', 'name', 'description', 'schema'] },
      // Só os do consultório (o filtro exclui os padrões, que têm organization_id nulo).
      { action: 'update', permissions: org, fields: ['name', 'description', 'schema', 'is_active'] },
      { action: 'delete', permissions: org, fields: null },
    ],
    anamneses: [
      // Sem o hash do link: o token só existe na resposta da criação, no app.
      { action: 'read', permissions: org, fields: ANAMNESIS_READ },
      // O gatilho copia o questionário, zera respostas e limita a validade.
      { action: 'create', permissions: null, fields: ['organization_id', 'patient_id', 'template_id', 'title', 'public_token_hash', 'token_expires_at'] },
      // O profissional só revisa ou cancela; respostas vêm do paciente pelo link público.
      { action: 'update', permissions: org, validation: { status: { _in: ['reviewed', 'cancelled'] } }, fields: ['status', 'reviewed_by'] },
    ],
  };
  for (const [collection, perms] of Object.entries(wanted)) {
    const current = await api(`/permissions?${q({ _and: [{ policy: { _eq: policy } }, { collection: { _eq: collection } }] })}&fields=id,action&limit=-1`);
    const have = new Set(current.json.data.map((p) => p.action));
    for (const w of perms) {
      if (have.has(w.action)) {
        console.log(`${collection} (${policy}): ${w.action} já existe`);
        continue;
      }
      await api('/permissions', { method: 'POST', body: { policy, collection, validation: null, presets: null, ...w } });
      console.log(`${collection} (${policy}): ${w.action} criado`);
    }
  }
}
console.log('Pronto. Anamneses não são apagadas: cancelar invalida o link e preserva o histórico.');
