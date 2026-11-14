// Alimentos próprios e preparações do consultório (RN-041, RN-042): regras puras, sem banco.
// Usadas pelos endpoints /rafanutri/foods e /rafanutri/recipes e testadas em db/tests/extension-foods.test.mjs.

/** Nutrientes que o consultório informa (os 5 do plano + os mais comuns do rótulo). */
export const CUSTOM_NUTRIENTS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'lipid_g', 'fiber_g', 'saturated_fat_g', 'sodium_mg'];
const REQUIRED = ['energy_kcal'];
/** Máximo plausível por 100 g (evita erro de digitação, ex.: kJ no lugar de kcal). */
const MAX_PER_100G = { energy_kcal: 900, protein_g: 100, carbohydrate_g: 100, lipid_g: 100, fiber_g: 100, saturated_fat_g: 100, sodium_mg: 40000 };

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN);
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Valores da porção do rótulo → por 100 g (ex.: porção de 30 g com 120 kcal → 400 kcal/100 g). */
export function toPer100g(values, basis, portionG) {
  const factor = basis === 'portion' ? 100 / portionG : 1;
  const out = {};
  for (const [code, v] of Object.entries(values)) out[code] = v === null ? null : round(v * factor, 2);
  return out;
}

function cleanMeasures(list, errors) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 10) {
    errors.household_measures = 'Até 10 medidas caseiras.';
    return [];
  }
  const out = [];
  for (const m of list) {
    const label = typeof m?.label === 'string' ? m.label.trim() : '';
    const grams = num(m?.grams);
    if (!label && !m?.grams) continue;
    if (label.length < 1 || label.length > 40 || !(grams > 0 && grams <= 2000)) {
      errors.household_measures = 'Cada medida precisa de nome (até 40 letras) e gramas (até 2.000 g).';
      return [];
    }
    out.push({ label, grams: round(grams, 1) });
  }
  return out;
}

function cleanBase(body, errors) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 160) errors.name = 'Informe o nome (2 a 160 caracteres).';
  const group = typeof body.food_group === 'string' ? body.food_group.trim().slice(0, 80) : '';
  return { name, food_group: group || null, household_measures: cleanMeasures(body.household_measures, errors) };
}

/**
 * Valida o cadastro de alimento próprio. `basis`: '100g' (valores por 100 g) ou 'portion'
 * (valores da porção do rótulo, com `portion_g`). Devolve { ok, errors, value } com os nutrientes já por 100 g.
 */
export function validateFoodInput(body) {
  const errors = {};
  if (!isObj(body)) return { ok: false, errors: { _: 'Corpo inválido.' }, value: null };
  const base = cleanBase(body, errors);
  const basis = body.basis === 'portion' ? 'portion' : '100g';
  const portionG = num(body.portion_g);
  if (basis === 'portion' && !(portionG > 0 && portionG <= 2000)) errors.portion_g = 'Informe o tamanho da porção em gramas.';
  const raw = {};
  const given = isObj(body.nutrients) ? body.nutrients : {};
  for (const code of CUSTOM_NUTRIENTS) {
    const v = given[code];
    if (v === undefined || v === null || v === '') {
      if (REQUIRED.includes(code)) errors[code] = 'Obrigatório.';
      raw[code] = null;
      continue;
    }
    const n = num(v);
    if (!Number.isFinite(n) || n < 0) errors[code] = 'Use um número maior ou igual a zero.';
    raw[code] = n;
  }
  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  const per100g = toPer100g(raw, basis, portionG);
  for (const code of CUSTOM_NUTRIENTS) {
    if (per100g[code] !== null && per100g[code] > MAX_PER_100G[code]) errors[code] = `Valor alto demais para 100 g (máx. ${MAX_PER_100G[code]}). Confira a porção e a unidade.`;
  }
  const macros = (per100g.protein_g ?? 0) + (per100g.carbohydrate_g ?? 0) + (per100g.lipid_g ?? 0);
  if (macros > 100.5) errors.carbohydrate_g = 'Proteínas + carboidratos + gorduras passam de 100 g em 100 g. Confira os valores.';
  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  return { ok: true, errors: {}, value: { ...base, per100g } };
}

/** Valida a preparação: ingredientes (ids de alimentos e gramas), rendimento e porções. */
export function validateRecipeInput(body) {
  const errors = {};
  if (!isObj(body)) return { ok: false, errors: { _: 'Corpo inválido.' }, value: null };
  const base = cleanBase(body, errors);
  const yieldG = num(body.yield_g);
  if (!(yieldG > 0 && yieldG <= 100000)) errors.yield_g = 'Informe o peso da preparação pronta (rendimento) em gramas.';
  const servings = body.servings === undefined || body.servings === null || body.servings === '' ? null : num(body.servings);
  if (servings !== null && !(servings > 0 && servings <= 1000)) errors.servings = 'Número de porções inválido.';
  const instructions = typeof body.instructions === 'string' ? body.instructions.trim().slice(0, 4000) : '';
  const items = [];
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 60) errors.items = 'Inclua de 1 a 60 ingredientes.';
  else {
    for (const i of body.items) {
      const id = typeof i?.foodId === 'string' || typeof i?.foodId === 'number' ? String(i.foodId) : '';
      const q = num(i?.quantityG);
      if (!/^\d+$/.test(id) || !(q > 0 && q <= 20000)) {
        errors.items = 'Cada ingrediente precisa de alimento e quantidade em gramas.';
        break;
      }
      items.push({ foodId: id, quantityG: round(q, 1) });
    }
  }
  const library = cleanLibrary(body, errors);
  if (Object.keys(errors).length) return { ok: false, errors, value: null };
  return { ok: true, errors: {}, value: { ...base, yield_g: round(yieldG, 1), servings, instructions: instructions || null, items, ...library } };
}

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

/** Campos da biblioteca de receitas (RN-206): descrição, tempo, dificuldade e tags (minúsculas, sem repetir). */
export function cleanLibrary(body, errors) {
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > 600) errors.description = 'Descrição de até 600 caracteres.';
  const rawMin = body.prep_minutes;
  const prep = rawMin === undefined || rawMin === null || rawMin === '' ? null : num(rawMin);
  if (prep !== null && !(Number.isInteger(prep) && prep >= 1 && prep <= 1440)) errors.prep_minutes = 'Tempo de preparo em minutos (1 a 1440).';
  const difficulty = body.difficulty === undefined || body.difficulty === null || body.difficulty === '' ? null : body.difficulty;
  if (difficulty !== null && !DIFFICULTIES.includes(difficulty)) errors.difficulty = 'Dificuldade inválida.';
  const tags = [];
  if (body.tags != null) {
    if (!Array.isArray(body.tags)) errors.tags = 'Tags inválidas.';
    else for (const t of body.tags) {
      const tag = typeof t === 'string' ? t.trim().toLowerCase().replace(/\s+/g, ' ') : '';
      if (!tag) continue;
      if (tag.length > 30) { errors.tags = 'Cada tag com até 30 caracteres.'; break; }
      if (!tags.includes(tag)) tags.push(tag);
    }
    if (tags.length > 10) errors.tags = 'Até 10 tags.';
  }
  return { description: description || null, prep_minutes: prep, difficulty, tags };
}

/** Foto da receita enviada como data URL (o navegador já reduz para até 1200 px). Devolve { type, buffer } ou null. */
export const MAX_IMAGE_BYTES = 600_000;
export function parseImageDataUrl(value) {
  if (typeof value !== 'string') return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!m) return null;
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
  // Confere a assinatura do arquivo (não confia só no tipo declarado)
  const sig = buffer.subarray(0, 12);
  const isJpeg = sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff;
  const isPng = sig[0] === 0x89 && sig.toString('ascii', 1, 4) === 'PNG';
  const isWebp = sig.toString('ascii', 0, 4) === 'RIFF' && sig.toString('ascii', 8, 12) === 'WEBP';
  const ok = (m[1] === 'image/jpeg' && isJpeg) || (m[1] === 'image/png' && isPng) || (m[1] === 'image/webp' && isWebp);
  return ok ? { type: m[1], buffer } : null;
}

/**
 * Composição por 100 g da preparação pronta: soma dos ingredientes (por 100 g × gramas ÷ 100),
 * dividida pelo rendimento. Nutriente sem dado em algum ingrediente entra como soma do que se sabe
 * e vai para `incomplete` (mesma regra do nutrition-core). Sem dado em nenhum → null.
 */
export function recipePer100g(ingredients, yieldG, codes = CUSTOM_NUTRIENTS) {
  const per100g = {};
  const incomplete = [];
  for (const code of codes) {
    let sum = 0;
    let known = 0;
    for (const ing of ingredients) {
      const v = ing.per100g?.[code];
      if (v === null || v === undefined) continue;
      sum += (Number(v) * ing.quantityG) / 100;
      known += 1;
    }
    if (known === 0) per100g[code] = null;
    else {
      per100g[code] = round((sum / yieldG) * 100, 2);
      if (known < ingredients.length) incomplete.push(code);
    }
  }
  return { per100g, incomplete };
}
