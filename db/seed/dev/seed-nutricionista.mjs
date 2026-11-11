// Seed de desenvolvimento: deixa um usuário de teste pronto como nutricionista, com
// consultório (plano gratuito) e pacientes fictícios. Usa só o login do próprio usuário
// pela API (mesmas permissões, ganchos e regras do app), sem token de administrador.
// Idempotente: rodar de novo não duplica consultório nem pacientes.
//
// Uso:
//   SEED_EMAIL=... SEED_PASSWORD=... node db/seed/dev/seed-nutricionista.mjs
// Opcional: DIRECTUS_URL (padrão https://rafanutri-api.brunokobi.tech), SEED_FIRST_NAME,
// SEED_LAST_NAME e SEED_CREATE_USER=1 (cria a conta pelo cadastro público se não existir).

const URL_ = process.env.DIRECTUS_URL ?? 'https://rafanutri-api.brunokobi.tech';
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Defina SEED_EMAIL e SEED_PASSWORD.');
  process.exit(2);
}

const ORGANIZATION = {
  name: 'Consultório de Teste Rafanutri',
  type: 'solo',
  brand_color: '#2E7D32',
  crn: '12345', // fictício
  crn_region: 'CRN-9',
};

// Pacientes fictícios (nomes, CPFs e telefones inventados; CPFs com dígito verificador válido).
const PATIENTS = [
  { full_name: 'Marina Costa', birth_date: '1994-03-12', sex: 'female', phone: '+5531988880001', objective: 'Emagrecimento com preservação de massa magra' },
  { full_name: 'Rafael Lima', birth_date: '1999-07-25', sex: 'male', phone: '+5531988880002', objective: 'Hipertrofia' },
  { full_name: 'Beatriz Nogueira', birth_date: '1981-01-30', sex: 'female', email: 'beatriz.teste@example.com', objective: 'Controle glicêmico (diabetes tipo 2)' },
  { full_name: 'Carlos Menezes', birth_date: '1968-05-08', sex: 'male', cpf: '52998224725', objective: 'Saúde cardiovascular (hipertensão)' },
  { full_name: 'Juliana Prado', birth_date: '1992-09-17', sex: 'female', phone: '+5531988880005', objective: 'Gestação (2º trimestre)' },
  { full_name: 'Lucas Andrade', birth_date: '2004-02-03', sex: 'male', objective: 'Desempenho esportivo (corrida)' },
  { full_name: 'Helena Duarte', birth_date: '1959-11-21', sex: 'female', objective: 'Manutenção de massa muscular' },
  { full_name: 'Pedro Siqueira', birth_date: '1985-06-14', sex: 'male', objective: 'Reeducação alimentar', status: 'inactive' },
  { full_name: 'Fernanda Alves', birth_date: '1997-04-09', sex: 'female', objective: 'Saúde intestinal (FODMAP)', status: 'archived' },
];

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = json?.errors?.[0]?.message ?? res.statusText;
    const error = new Error(`${method} ${path}: ${res.status} ${message}`);
    error.status = res.status;
    throw error;
  }
  return json?.data ?? null;
}

async function login() {
  try {
    return (await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })).access_token;
  } catch (error) {
    if (error.status !== 401 || process.env.SEED_CREATE_USER !== '1') throw error;
    console.log(`Conta ${EMAIL} não existe: criando pelo cadastro público.`);
    await api('/users/register', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD, first_name: process.env.SEED_FIRST_NAME ?? 'Nutricionista', last_name: process.env.SEED_LAST_NAME ?? 'Teste' },
    });
    return (await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })).access_token;
  }
}

const token = await login();
const me = await api('/users/me?fields=id,email', { token });
console.log(`Usuário: ${me.email}`);
// O papel não é legível pelo próprio usuário; sem o papel Profissional, o endpoint abaixo recusa (403).

// Consultório (o endpoint devolve o existente se o usuário já for owner de um).
const org = await api('/rafanutri/organizations', { token, method: 'POST', body: ORGANIZATION });
console.log(`Consultório: ${org.name} (${org.slug}, plano ${org.plan})`);

// Pacientes: cria só os que ainda não existem (pelo nome) no consultório.
const existing = await api(`/items/patients?fields=full_name&limit=-1&filter[organization_id][_eq]=${org.id}`, { token });
const names = new Set(existing.map((p) => p.full_name));
let created = 0;
for (const p of PATIENTS) {
  if (names.has(p.full_name)) continue;
  await api('/items/patients', { token, method: 'POST', body: { status: 'active', ...p, organization_id: org.id } });
  created += 1;
}
const all = await api(`/items/patients?fields=status&limit=-1&filter[organization_id][_eq]=${org.id}`, { token });
const by = (s) => all.filter((p) => p.status === s).length;
console.log(`Pacientes: ${created} criados agora; total ${all.length} (${by('active')} ativos, ${by('inactive')} inativos, ${by('archived')} arquivados).`);
