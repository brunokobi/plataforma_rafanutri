// RN-031 / RN-036 — Registra a coleção meal_plans no Directus e dá as permissões
// ao papel Profissional, copiando o filtro de acesso que já existe para `patients`
// (mesmo isolamento por consultório). Idempotente: pode rodar mais de uma vez.
//
// Pré-requisito: migração db/migrations/0006_meal_plans.sql aplicada.
// Uso: DIRECTUS_URL=https://rafanutri-api.brunokobi.tech DIRECTUS_ADMIN_TOKEN=... node db/directus/0006_meal_plans.mjs

const URL_ = process.env.DIRECTUS_URL;
const ADMIN = process.env.DIRECTUS_ADMIN_TOKEN;
if (!URL_ || !ADMIN) {
  console.error('Defina DIRECTUS_URL e DIRECTUS_ADMIN_TOKEN.');
  process.exit(2);
}

const COLLECTION = 'meal_plans';
/** Campos que o profissional informa (o resto é do sistema). */
const WRITABLE = ['organization_id', 'patient_id', 'title', 'mode', 'targets', 'meals', 'guidelines'];
// Publicar = mudar status (o gatilho arquiva o anterior, marca data e validade e trava o conteúdo).
const EDITABLE = ['title', 'mode', 'targets', 'meals', 'guidelines', 'totals', 'status', 'valid_until'];

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

// 1. Coleção (a tabela já existe; registra só o meta)
const existing = await api(`/collections/${COLLECTION}`);
if (existing.status === 200) {
  console.log(`coleção ${COLLECTION}: já registrada`);
} else {
  await api('/collections', {
    method: 'POST',
    body: { collection: COLLECTION, meta: { icon: 'restaurant_menu', note: 'RN-031/RN-036 — planos alimentares por paciente', archive_field: null } },
  });
  console.log(`coleção ${COLLECTION}: registrada`);
}

// 2. Campos de sistema preenchidos pelo Directus (autor e datas)
for (const [field, special] of [['user_created', 'user-created'], ['date_created', 'date-created'], ['date_updated', 'date-updated']]) {
  await api(`/fields/${COLLECTION}/${field}`, { method: 'PATCH', body: { meta: { special: [special], readonly: true, hidden: true } } });
  console.log(`campo ${field}: ${special}`);
}

// 3. Permissões: mesmas políticas e filtros de `patients`
const { json } = await api(`/permissions?${q({ collection: { _eq: 'patients' } })}&fields=policy,action,permissions&limit=-1`);
const patientPerms = json.data;
const policies = [...new Set(patientPerms.map((p) => p.policy))];
if (!policies.length) throw new Error('Nenhuma permissão de patients encontrada para copiar.');

for (const policy of policies) {
  const read = patientPerms.find((p) => p.policy === policy && p.action === 'read');
  const update = patientPerms.find((p) => p.policy === policy && p.action === 'update');
  if (!read) continue;
  const wanted = [
    { action: 'read', permissions: read.permissions, fields: ['*'] },
    // Criação sem filtro: o gatilho do banco exige paciente do mesmo consultório, autor owner/nutricionista e status rascunho.
    { action: 'create', permissions: null, fields: WRITABLE },
    { action: 'update', permissions: update?.permissions ?? read.permissions, fields: EDITABLE },
    // Só rascunhos podem ser apagados; publicados e arquivados ficam no histórico.
    { action: 'delete', permissions: { _and: [read.permissions ?? {}, { status: { _eq: 'draft' } }] }, fields: null },
  ];
  const current = await api(`/permissions?${q({ _and: [{ policy: { _eq: policy } }, { collection: { _eq: COLLECTION } }] })}&fields=id,action&limit=-1`);
  const have = new Set(current.json.data.map((p) => p.action));
  for (const w of wanted) {
    if (have.has(w.action)) {
      console.log(`política ${policy}: ${w.action} já existe`);
      continue;
    }
    await api('/permissions', { method: 'POST', body: { policy, collection: COLLECTION, ...w, validation: null, presets: null } });
    console.log(`política ${policy}: ${w.action} criado`);
  }
}

console.log('Pronto. Só rascunhos podem ser apagados; publicados e arquivados ficam no histórico.');
