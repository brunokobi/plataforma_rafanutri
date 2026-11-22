// Testes do catálogo básico de insumos da UAN.
// Uso: node --test db/tests/extension-ingredient-starter.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STARTER_INGREDIENTS, missingStarter, nameKey } from '../../directus/extensions/rafanutri/ingredient-starter.js';

const CATS = new Set(['produce', 'meat', 'dairy', 'grains', 'bakery', 'beverages', 'frozen', 'grocery', 'cleaning', 'disposables', 'other']);
const UNITS = new Set(['kg', 'g', 'l', 'ml', 'un', 'dz', 'cx', 'pct']);
const ALLERGENS = new Set(['gluten', 'crustaceans', 'eggs', 'fish', 'peanut', 'soy', 'milk', 'lactose', 'almond', 'hazelnut', 'cashew', 'brazil_nut', 'macadamia', 'walnut', 'pecan', 'pistachio', 'pine_nut', 'chestnut', 'latex']);

test('cada item passa nas mesmas regras do cadastro manual', () => {
  for (const i of STARTER_INGREDIENTS) {
    assert.ok(i.name.length >= 2 && i.name.length <= 120, i.name);
    assert.ok(CATS.has(i.category), i.name);
    assert.ok(UNITS.has(i.purchase_unit), i.name);
    assert.ok(['ambient', 'chilled', 'frozen'].includes(i.storage), i.name);
    assert.ok(i.default_fc >= 1 && i.default_fc <= 20, i.name);
    if (['un', 'dz'].includes(i.purchase_unit)) assert.ok(i.unit_weight_g > 0, `${i.name}: peso da unidade`);
    if (['cx', 'pct'].includes(i.purchase_unit)) assert.ok(i.pack_grams > 0, `${i.name}: peso da embalagem`);
    if (i.density_g_ml !== null) assert.ok(i.density_g_ml >= 0.1 && i.density_g_ml <= 5, i.name);
    for (const a of i.allergens) assert.ok(ALLERGENS.has(a), `${i.name}: ${a}`);
  }
});

test('nomes únicos e cobertura das categorias de alimento', () => {
  const keys = STARTER_INGREDIENTS.map((i) => nameKey(i.name));
  assert.equal(new Set(keys).size, keys.length);
  for (const c of ['produce', 'meat', 'dairy', 'grains', 'bakery', 'grocery', 'beverages', 'frozen', 'cleaning', 'disposables']) {
    assert.ok(STARTER_INGREDIENTS.some((i) => i.category === c), c);
  }
});

test('só adiciona o que falta, sem diferença de maiúsculas e acentos', () => {
  assert.equal(missingStarter([]).length, STARTER_INGREDIENTS.length);
  const left = missingStarter(['  TOMATE ', 'Açucar refinado', 'Outro qualquer']);
  assert.equal(left.length, STARTER_INGREDIENTS.length - 2);
  assert.ok(!left.some((i) => i.name === 'Tomate' || i.name === 'Açúcar refinado'));
  assert.equal(missingStarter(STARTER_INGREDIENTS.map((i) => i.name)).length, 0);
});
