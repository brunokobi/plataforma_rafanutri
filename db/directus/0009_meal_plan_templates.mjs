// RN-035 — Registra meal_plan_templates no Directus e dá as permissões às políticas que já
// acessam `patients`, com o mesmo filtro de consultório. Idempotente.
//
// Pré-requisito: migração db/migrations/0009_meal_plan_templates.sql aplicada e Directus reiniciado.
// Uso: DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=... node db/directus/0009_meal_plan_templates.mjs

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
const COLLECTION = 'meal_plan_templates';

const existing = await api(`/collections/${COLLECTION}`);
if (existing.status === 200) console.log(`coleção ${COLLECTION}: já registrada`);
else {
  await api('/collections', { method: 'POST', body: { collection: COLLECTION, meta: { icon: 'library_books', note: 'RN-035 — modelos de plano alimentar (organization_id nulo = biblioteca da plataforma)' } } });
  console.log(`coleção ${COLLECTION}: registrada`);
}
for (const [field, special] of [['user_created', 'user-created'], ['date_created', 'date-created'], ['date_updated', 'date-updated']]) {
  const r = await api(`/fields/${COLLECTION}/${field}`, { method: 'PATCH', body: { meta: { special: [special], readonly: true, hidden: true } } });
  if (r.status !== 200) {
    throw new Error(`${COLLECTION}.${field}: ${r.status}. Reinicie o Directus (docker compose restart directus) depois da migração e rode este script de novo.`);
  }
}
console.log(`${COLLECTION}: autor e datas automáticos`);

const { json } = await api(`/permissions?${q({ collection: { _eq: 'patients' } })}&fields=policy,action,permissions&limit=-1`);
const patientPerms = json.data;
const policies = [...new Set(patientPerms.map((p) => p.policy))];
if (!policies.length) throw new Error('Nenhuma permissão de patients encontrada para copiar.');

const CONTENT = ['name', 'description', 'tags', 'mode', 'targets', 'meals', 'guidelines', 'energy_kcal'];
for (const policy of policies) {
  const read = patientPerms.find((p) => p.policy === policy && p.action === 'read');
  if (!read) continue;
  const org = read.permissions ?? {};
  const wanted = [
    // Biblioteca da plataforma + modelos do próprio consultório.
    { action: 'read', permissions: { _or: [{ organization_id: { _null: true } }, org] }, fields: ['*'] },
    // O gatilho confere autor e plano de origem; a validação impede criar modelo "da plataforma".
    { action: 'create', permissions: null, validation: { organization_id: { _nnull: true } }, fields: ['organization_id', 'source_plan_id', ...CONTENT] },
    // Só os do consultório (o filtro exclui a biblioteca, que tem organization_id nulo).
    { action: 'update', permissions: org, fields: CONTENT },
    { action: 'delete', permissions: org, fields: null },
  ];
  const current = await api(`/permissions?${q({ _and: [{ policy: { _eq: policy } }, { collection: { _eq: COLLECTION } }] })}&fields=id,action&limit=-1`);
  const have = new Set(current.json.data.map((p) => p.action));
  for (const w of wanted) {
    if (have.has(w.action)) {
      console.log(`${COLLECTION} (${policy}): ${w.action} já existe`);
      continue;
    }
    await api('/permissions', { method: 'POST', body: { policy, collection: COLLECTION, validation: null, presets: null, ...w } });
    console.log(`${COLLECTION} (${policy}): ${w.action} criado`);
  }
}
console.log('Pronto.');
