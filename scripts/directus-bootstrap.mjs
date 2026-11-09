// Configura o Directus da Rafanutri: papel/política "Profissional", relações o2m usadas
// nos filtros e permissões por coleção (isolamento por organização).
// Idempotente: pode ser executado várias vezes.
// Uso: node --env-file=infra/directus/.env scripts/directus-bootstrap.mjs

const BASE = process.env.DIRECTUS_URL ?? `http://127.0.0.1:${process.env.DIRECTUS_PORT ?? 8055}`;

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

const login = await api(null, 'POST', '/auth/login', {
  email: process.env.DIRECTUS_ADMIN_EMAIL,
  password: process.env.DIRECTUS_ADMIN_PASSWORD,
});
const T = login.access_token;
const get = (p) => api(T, 'GET', p);
const post = (p, b) => api(T, 'POST', p, b);
const patch = (p, b) => api(T, 'PATCH', p, b);
const del = (p, b) => api(T, 'DELETE', p, b);
const q = (filter) => `filter=${encodeURIComponent(JSON.stringify(filter))}`;

// ---------------------------------------------------------------------------
// Relações o2m (aliases) usadas nos filtros de permissão
// ---------------------------------------------------------------------------
async function ensureO2M(oneCollection, aliasField, manyCollection, manyField) {
  try {
    await get(`/fields/${oneCollection}/${aliasField}`);
  } catch (e) {
    if (e.status !== 403 && e.status !== 404) throw e;
    await post(`/fields/${oneCollection}`, {
      field: aliasField,
      type: 'alias',
      meta: { special: ['o2m'], interface: 'list-o2m', hidden: true },
      schema: null,
    });
  }
  const rel = await get(`/relations/${manyCollection}/${manyField}`);
  if (rel?.meta?.one_field !== aliasField) {
    if (rel?.meta) {
      await patch(`/relations/${manyCollection}/${manyField}`, { meta: { one_field: aliasField } });
    } else {
      await patch(`/relations/${manyCollection}/${manyField}`, {
        meta: { one_field: aliasField, one_deselect_action: 'nullify' },
      });
    }
  }
  console.log(`relação ${oneCollection}.${aliasField} ← ${manyCollection}.${manyField}`);
}

await ensureO2M('organizations', 'members', 'organization_members', 'organization_id');
await ensureO2M('directus_users', 'memberships', 'organization_members', 'user_id');

// ---------------------------------------------------------------------------
// Política e papel
// ---------------------------------------------------------------------------
async function ensurePolicy(name, description) {
  const [found] = await get(`/policies?${q({ name: { _eq: name } })}&limit=1`);
  if (found) return found.id;
  const created = await post('/policies', {
    name, description, icon: 'badge', admin_access: false, app_access: false, enforce_tfa: false,
  });
  return created.id;
}

async function ensureRole(name, policyId) {
  let [role] = await get(`/roles?${q({ name: { _eq: name } })}&limit=1`);
  if (!role) role = await post('/roles', { name, icon: 'badge' });
  const links = await get(`/access?${q({ _and: [{ role: { _eq: role.id } }, { policy: { _eq: policyId } }] })}`);
  if (!links.length) await post('/access', { role: role.id, policy: policyId });
  return role.id;
}

const policyId = await ensurePolicy('Profissional', 'Nutricionistas e equipe: acesso só às próprias organizações.');
await ensureRole('Profissional', policyId);
console.log('papel e política "Profissional" ok');

// ---------------------------------------------------------------------------
// Permissões
// ---------------------------------------------------------------------------
const ME = '$CURRENT_USER';
const ANY = ['owner', 'nutritionist', 'assistant'];
const CLINICAL = ['owner', 'nutritionist'];
const OWNER = ['owner'];

/** Filtro: organização em que o usuário é membro com um dos papéis. */
const memberOf = (roles) => ({
  members: { _some: { _and: [{ user_id: { _eq: ME } }, { role: { _in: roles } }] } },
});
const inOrg = (roles) => ({ organization_id: memberOf(roles) });

const PATIENT_ADMIN_FIELDS = [
  'id', 'organization_id', 'responsible_nutritionist_id', 'full_name', 'social_name', 'birth_date', 'sex',
  'email', 'phone', 'status', 'tags', 'created_at', 'updated_at',
];

const permissions = [
  // Núcleo
  { collection: 'organizations', action: 'read', permissions: memberOf(ANY), fields: ['*'] },
  { collection: 'organizations', action: 'update', permissions: memberOf(OWNER), fields: ['name', 'type', 'document', 'logo', 'brand_color'] },
  { collection: 'organization_members', action: 'read', permissions: inOrg(ANY), fields: ['*'] },
  { collection: 'organization_members', action: 'update', permissions: inOrg(OWNER), fields: ['role'] },
  { collection: 'organization_members', action: 'delete', permissions: inOrg(OWNER) },
  { collection: 'organization_invites', action: 'read', permissions: inOrg(OWNER), fields: ['id', 'organization_id', 'email', 'role', 'expires_at', 'accepted_at', 'invited_by', 'created_at'] },
  { collection: 'organization_invites', action: 'delete', permissions: inOrg(OWNER) },
  { collection: 'profiles', action: 'read', permissions: { id: { _eq: ME } }, fields: ['*'] },
  { collection: 'profiles', action: 'update', permissions: { id: { _eq: ME } }, fields: ['full_name', 'crn', 'crn_region', 'phone'] },
  {
    collection: 'directus_users', action: 'read',
    permissions: { _or: [{ id: { _eq: ME } }, { memberships: { _some: { organization_id: memberOf(ANY) } } }] },
    fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
  },
  { collection: 'directus_users', action: 'update', permissions: { id: { _eq: ME } }, fields: ['first_name', 'last_name', 'password', 'avatar', 'language'] },
  { collection: 'plans', action: 'read', permissions: {}, fields: ['*'] },
  { collection: 'subscriptions', action: 'read', permissions: inOrg(ANY), fields: ['*'] },
  { collection: 'plan_waitlist', action: 'read', permissions: inOrg(OWNER), fields: ['*'] },
  { collection: 'plan_waitlist', action: 'create', permissions: null, presets: { user_id: ME }, fields: ['organization_id', 'reason'] },

  // Alimentos
  { collection: 'food_sources', action: 'read', permissions: {}, fields: ['*'] },
  { collection: 'nutrients', action: 'read', permissions: {}, fields: ['*'] },
  { collection: 'foods', action: 'read', permissions: { _or: [{ organization_id: { _null: true } }, inOrg(ANY)] }, fields: ['*'] },
  { collection: 'foods', action: 'create', permissions: null, fields: ['source_id', 'organization_id', 'name', 'food_group', 'household_measures'] },
  { collection: 'foods', action: 'update', permissions: inOrg(CLINICAL), fields: ['name', 'food_group', 'household_measures', 'is_active'] },
  { collection: 'foods', action: 'delete', permissions: inOrg(CLINICAL) },
  { collection: 'food_nutrients', action: 'read', permissions: { food_id: { _or: [{ organization_id: { _null: true } }, inOrg(ANY)] } }, fields: ['*'] },
  { collection: 'food_nutrients', action: 'update', permissions: { food_id: inOrg(CLINICAL) }, fields: ['amount_per_100g', 'is_trace'] },

  // Clínico — o assistente vê só os dados cadastrais do paciente.
  { collection: 'patients', action: 'read', permissions: inOrg(CLINICAL), fields: ['*'] },
  { collection: 'patients', action: 'create', permissions: null, fields: ['*'] },
  { collection: 'patients', action: 'update', permissions: inOrg(CLINICAL), fields: ['*'] },
  { collection: 'anthropometric_assessments', action: 'read', permissions: inOrg(CLINICAL), fields: ['*'] },
  { collection: 'anthropometric_assessments', action: 'create', permissions: null, fields: ['*'] },
  { collection: 'anthropometric_assessments', action: 'update', permissions: inOrg(CLINICAL), fields: ['assessed_at', 'notes'] },
  { collection: 'anthropometric_assessments', action: 'delete', permissions: inOrg(CLINICAL) },
  { collection: 'energy_calculations', action: 'read', permissions: inOrg(CLINICAL), fields: ['*'] },
  { collection: 'energy_calculations', action: 'create', permissions: null, fields: ['*'] },
  { collection: 'energy_calculations', action: 'delete', permissions: inOrg(CLINICAL) },
];

// Leitura do assistente: dados cadastrais apenas. Directus soma permissões de leitura da mesma política
// por coleção, então o assistente recebe uma regra separada só com os campos administrativos.
permissions.push({
  collection: 'patients', action: 'read',
  permissions: { _and: [inOrg(['assistant']), { status: { _neq: 'archived' } }] },
  fields: PATIENT_ADMIN_FIELDS,
});

// Recria as permissões da política para refletir exatamente a lista acima.
const existing = await get(`/permissions?${q({ policy: { _eq: policyId } })}&limit=-1&fields=id`);
if (existing.length) await del('/permissions', existing.map((p) => p.id));
await post('/permissions', permissions.map((p) => ({
  policy: policyId,
  collection: p.collection,
  action: p.action,
  permissions: p.permissions ?? null,
  validation: null,
  presets: p.presets ?? null,
  fields: p.fields ?? null,
})));
console.log(`${permissions.length} permissões aplicadas à política "Profissional"`);
