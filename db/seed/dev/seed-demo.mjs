// RN-038 — Dados fictícios para demonstração, por cima de seed-nutricionista.mjs (consultório + pacientes).
// Para cada paciente ativo: agenda de 4 semanas (consultas concluídas no passado, retornos marcados),
// 3 avaliações com evolução de peso; para alguns, plano publicado com alimentos da TACO e anamnese respondida
// (uma com alergia, para mostrar o destaque na ficha).
// Usa só o login do próprio usuário pela API (mesmas permissões e regras do app). Idempotente: o que já
// existe para o paciente não é criado de novo.
//
// Uso: SEED_EMAIL=... SEED_PASSWORD=... node db/seed/dev/seed-demo.mjs   (ou pnpm db:seed:demo)
// Plano gratuito: 1 profissional e até 20 pacientes ativos (o RN-038 pedia 3 e 30, o que exige plano pago).

import { createHash, randomBytes } from 'node:crypto';

const URL_ = process.env.DIRECTUS_URL ?? 'https://rafanutri-api.brunokobi.tech';
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Defina SEED_EMAIL e SEED_PASSWORD.');
  process.exit(2);
}

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json?.errors?.[0]?.message ?? res.statusText}`);
  return json?.data ?? null;
}
const q = (o) => encodeURIComponent(JSON.stringify(o));

// Brasília (UTC-3, sem horário de verão)
const day = (offset) => {
  const d = new Date(Date.now() - 3 * 3600e3 + offset * 86400e3);
  return d.toISOString().slice(0, 10);
};
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00-03:00`).toISOString();
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
/** Próximo dia útil a partir de `offset` (pula sábado e domingo). */
const workday = (offset) => {
  let o = offset;
  while ([0, 6].includes(weekday(day(o)))) o += offset < 0 ? -1 : 1;
  return day(o);
};

const token = (await api('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })).access_token;
const orgs = await api('/rafanutri/me/organizations', { token });
const org = orgs.find((o) => o.role === 'owner' || o.role === 'nutritionist');
if (!org) {
  console.error('O usuário não tem consultório: rode antes db/seed/dev/seed-nutricionista.mjs.');
  process.exit(1);
}
const patients = (await api(`/items/patients?fields=id,full_name,sex,birth_date,status&limit=-1&filter=${q({ organization_id: { _eq: org.id } })}`, { token })).filter((p) => p.status === 'active');
console.log(`Consultório ${org.name}: ${patients.length} pacientes ativos.`);

// Alimentos da TACO usados nos planos (código TACO → id no banco)
const CODES = { arroz: '3', feijao: '561', frango: '410', brocolis: '100', azeite: '260', pao: '52', ovo: '488', banana: '182', mamao: '226', iogurte: '448', aveia: '7', tilapia: '313', batata: '88', alface: '78', tomate: '157' };
const foods = await api(`/items/foods?fields=id,source_code,nutrients.amount_per_100g,nutrients.nutrient_id.code&limit=-1&filter=${q({ _and: [{ source_code: { _in: Object.values(CODES) } }, { source_id: { code: { _eq: 'TACO' } } }] })}&deep=${q({ nutrients: { _filter: { nutrient_id: { code: { _eq: 'energy_kcal' } } } } })}`, { token });
const byCode = new Map(foods.map((f) => [f.source_code, f]));
const fid = (name) => String(byCode.get(CODES[name]).id);
const kcalOf = (name) => Number(byCode.get(CODES[name]).nutrients?.[0]?.amount_per_100g ?? 0);
const item = (key, name, g) => ({ key, foodId: fid(name), quantityG: g });
const MEALS = [
  { id: 'cafe', name: 'Café da manhã', time: '07:30', items: [item('c1', 'pao', 50), item('c2', 'ovo', 50), item('c3', 'mamao', 100)] },
  { id: 'lanche-manha', name: 'Lanche da manhã', time: '10:00', items: [item('l1', 'banana', 70)] },
  { id: 'almoco', name: 'Almoço', time: '12:30', items: [item('a1', 'arroz', 125), item('a2', 'feijao', 80), item('a3', 'frango', 100), item('a4', 'brocolis', 60), item('a5', 'azeite', 4)] },
  { id: 'lanche-tarde', name: 'Lanche da tarde', time: '16:00', items: [item('t1', 'iogurte', 170), item('t2', 'aveia', 15)] },
  { id: 'jantar', name: 'Jantar', time: '19:30', items: [item('j1', 'batata', 150), item('j2', 'tilapia', 120), item('j3', 'alface', 30), item('j4', 'tomate', 45), item('j5', 'azeite', 4)] },
];
const PLAN_KCAL = MEALS.flatMap((m) => m.items).reduce((s, i) => s + (kcalOf(Object.keys(CODES).find((k) => fid(k) === i.foodId)) * i.quantityG) / 100, 0);

const has = async (collection, patientId) =>
  (await api(`/items/${collection}?fields=id&limit=1&filter=${q({ patient_id: { _eq: patientId } })}`, { token })).length > 0;

let created = { appointments: 0, assessments: 0, plans: 0, anamneses: 0 };
const busy = new Set(); // horários já usados pela seed (data + hora) para não sobrepor
const slot = (date, hours) => {
  for (const h of hours) if (!busy.has(`${date} ${h}`)) return busy.add(`${date} ${h}`), h;
  return null;
};

for (const [n, p] of patients.entries()) {
  // Agenda: consulta concluída há 2–4 semanas e retorno nas próximas 2 semanas (um paciente fica sem retorno)
  if (!(await has('appointments', p.id))) {
    const past = workday(-(14 + (n % 3) * 7));
    const hPast = slot(past, ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00']);
    if (hPast) {
      const a = await api('/items/appointments?fields=id', { token, method: 'POST', body: { organization_id: org.id, patient_id: p.id, starts_at: at(past, hPast), ends_at: at(past, `${String(Number(hPast.slice(0, 2)) + 1).padStart(2, '0')}:00`), type: 'first', mode: n % 3 === 0 ? 'online' : 'in_person' } });
      await api(`/items/appointments/${a.id}`, { token, method: 'PATCH', body: { status: 'completed' } });
      created.appointments += 1;
    }
    if (n !== patients.length - 1) {
      const next = workday(n % 2 === 0 ? 0 : 1 + (n % 9));
      const hNext = slot(next, ['14:00', '15:00', '16:00', '17:00', '09:00', '10:00']);
      if (hNext) {
        await api('/items/appointments', { token, method: 'POST', body: { organization_id: org.id, patient_id: p.id, starts_at: at(next, hNext), ends_at: at(next, `${hNext.slice(0, 2)}:45`), type: 'return', mode: 'in_person', status: undefined } });
        created.appointments += 1;
      }
    }
  }

  // Avaliações: 3, a cada 30 dias, com peso caindo
  if (!(await has('anthropometric_assessments', p.id))) {
    const height = p.sex === 'male' ? 176 : 164;
    let weight = (p.sex === 'male' ? 86 : 72) + (n % 4) * 3;
    for (const offset of [-60, -30, -2]) {
      const bmi = Math.round((weight / (height / 100) ** 2) * 10) / 10;
      await api('/items/anthropometric_assessments', { token, method: 'POST', body: { organization_id: org.id, patient_id: p.id, assessed_at: day(offset), weight_kg: weight, height_cm: height, waist_cm: Math.round(weight * 1.05), results: { bmi }, calc_version: 'seed-demo', notes: 'Avaliação fictícia (seed de demonstração).' } });
      created.assessments += 1;
      weight = Math.round((weight - 1.2 - (n % 3) * 0.4) * 10) / 10;
    }
  }

  // Plano publicado para os 5 primeiros
  if (n < 5 && !(await has('meal_plans', p.id))) {
    const plan = await api('/items/meal_plans?fields=id', { token, method: 'POST', body: { organization_id: org.id, patient_id: p.id, title: 'Plano alimentar (demonstração)', meals: MEALS, guidelines: 'Beba água ao longo do dia.\nMastigue devagar e evite telas durante as refeições.' } });
    await api(`/items/meal_plans/${plan.id}`, { token, method: 'PATCH', body: { status: 'published', totals: { energy_kcal: Math.round(PLAN_KCAL) } } });
    created.plans += 1;
  }

  // Anamnese clínica respondida para os 3 primeiros (a primeira com alergia)
  if (n < 3 && !(await has('anamneses', p.id))) {
    const raw = randomBytes(32).toString('base64url');
    await api('/items/anamneses', { token, method: 'POST', body: { organization_id: org.id, patient_id: p.id, template_id: '7b1d3c2e-0001-4a5b-9c00-000000000001', public_token_hash: createHash('sha256').update(raw).digest('hex') } });
    const answers = { objetivo: n === 1 ? 'ganho_massa' : 'emagrecimento', medicamentos_usa: false, atividade: n === 1 ? '5_mais' : '1_2', refeicoes: 4 + (n % 2), sono: 7, agua: 6 };
    if (n === 0) answers.alergias = 'Intolerância à lactose';
    await api('/rafanutri/public/anamneses/save', { method: 'POST', body: { token: raw, answers, final: true } });
    created.anamneses += 1;
  }
}

console.log(`Criados agora: ${created.appointments} consultas, ${created.assessments} avaliações, ${created.plans} planos publicados, ${created.anamneses} anamneses respondidas.`);
