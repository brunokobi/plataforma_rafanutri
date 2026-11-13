// Testes das regras puras de alimentos próprios e preparações (extensão do Directus).
// Uso: node --test db/tests/extension-foods.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recipePer100g, toPer100g, validateFoodInput, validateRecipeInput } from '../../directus/extensions/rafanutri/foods.js';

test('rótulo com porção de 30 g grava os valores por 100 g (critério do RN-041)', () => {
  const r = validateFoodInput({
    name: 'Barra de cereal X', basis: 'portion', portion_g: 30,
    nutrients: { energy_kcal: 120, protein_g: 3, carbohydrate_g: 20, lipid_g: 3.3, fiber_g: '1,5', sodium_mg: 45 },
  });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.value.per100g, { energy_kcal: 400, protein_g: 10, carbohydrate_g: 66.67, lipid_g: 11, fiber_g: 5, saturated_fat_g: null, sodium_mg: 150 });
});

test('valores já por 100 g não são convertidos; medidas caseiras validadas', () => {
  const r = validateFoodInput({ name: 'Iogurte da casa', nutrients: { energy_kcal: 60 }, household_measures: [{ label: 'pote', grams: 170 }, { label: '', grams: '' }] });
  assert.equal(r.ok, true);
  assert.equal(r.value.per100g.energy_kcal, 60);
  assert.deepEqual(r.value.household_measures, [{ label: 'pote', grams: 170 }]);
});

test('recusa: sem nome, sem energia, porção ausente, negativo, valor implausível e macros > 100 g', () => {
  assert.ok(validateFoodInput({ name: 'X', nutrients: { energy_kcal: 10 } }).errors.name);
  assert.ok(validateFoodInput({ name: 'Sem energia', nutrients: {} }).errors.energy_kcal);
  assert.ok(validateFoodInput({ name: 'Porção', basis: 'portion', nutrients: { energy_kcal: 10 } }).errors.portion_g);
  assert.ok(validateFoodInput({ name: 'Negativo', nutrients: { energy_kcal: -1 } }).errors.energy_kcal);
  assert.match(validateFoodInput({ name: 'kJ por engano', nutrients: { energy_kcal: 1700 } }).errors.energy_kcal, /alto demais/);
  assert.ok(validateFoodInput({ name: 'Macros', nutrients: { energy_kcal: 400, protein_g: 60, carbohydrate_g: 50 } }).errors.carbohydrate_g);
  assert.ok(validateFoodInput({ name: 'Muitas medidas', nutrients: { energy_kcal: 1 }, household_measures: Array.from({ length: 11 }, () => ({ label: 'x', grams: 1 })) }).errors.household_measures);
});

test('conversão direta', () => {
  assert.deepEqual(toPer100g({ energy_kcal: 50, fiber_g: null }, 'portion', 25), { energy_kcal: 200, fiber_g: null });
});

test('preparação com 4 ingredientes e rendimento: kcal por 100 g da preparação pronta (critério do RN-042)', () => {
  // 200 g arroz cru (360 kcal/100 g) + 400 g água (0) + 10 g óleo (884) + 5 g sal (0), rendimento 520 g
  const { per100g, incomplete } = recipePer100g(
    [
      { quantityG: 200, per100g: { energy_kcal: 360, fiber_g: 1.6 } },
      { quantityG: 400, per100g: { energy_kcal: 0, fiber_g: 0 } },
      { quantityG: 10, per100g: { energy_kcal: 884, fiber_g: null } },
      { quantityG: 5, per100g: { energy_kcal: 0, fiber_g: 0 } },
    ],
    520,
    ['energy_kcal', 'fiber_g', 'sodium_mg'],
  );
  // (720 + 88,4) / 520 × 100 = 155,46
  assert.equal(per100g.energy_kcal, 155.46);
  assert.equal(per100g.fiber_g, 0.62); // 3,2 / 520 × 100, incompleto (óleo sem dado)
  assert.equal(per100g.sodium_mg, null);
  assert.deepEqual(incomplete, ['fiber_g']);
});

test('validação da preparação', () => {
  const ok = validateRecipeInput({ name: 'Arroz da casa', yield_g: 520, servings: 4, items: [{ foodId: 3, quantityG: 200 }, { foodId: '1', quantityG: '10,5' }] });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.deepEqual(ok.value.items, [{ foodId: '3', quantityG: 200 }, { foodId: '1', quantityG: 10.5 }]);
  assert.ok(validateRecipeInput({ name: 'Sem rendimento', items: [{ foodId: 1, quantityG: 1 }] }).errors.yield_g);
  assert.ok(validateRecipeInput({ name: 'Sem itens', yield_g: 100, items: [] }).errors.items);
  assert.ok(validateRecipeInput({ name: 'Item ruim', yield_g: 100, items: [{ foodId: 'abc', quantityG: 1 }] }).errors.items);
});
