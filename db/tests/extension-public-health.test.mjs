// Testes das regras puras das triagens (0066).
// Uso: node --test db/tests/extension-public-health.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateScreening, weightLossFromHistory } from '../../directus/extensions/rafanutri/public-health.js';

const ok = { tool: 'must', tool_version: 'must@bapen2011', answers: { bmi: 19, weightLossPct: 7, acuteDiseaseNoIntake: false }, score: 2, classification: 'high', risk_level: 'high' };

test('triagem válida', () => {
  assert.deepEqual(validateScreening({ ...ok, notes: '  ok ' }).value, { ...ok, notes: 'ok' });
  assert.equal(validateScreening({ ...ok, tool: 'sga', tool_version: 'sga@detsky1987', score: null, classification: 'B' }).value.score, null);
});

test('rejeita ferramenta, versão, risco e formato inválidos', () => {
  assert.ok(validateScreening({ ...ok, tool: 'mna_sf' }).errors.tool);
  assert.ok(validateScreening({ ...ok, tool_version: 'must@old' }).errors.tool_version);
  assert.ok(validateScreening({ ...ok, risk_level: 'extreme' }).errors.risk_level);
  assert.ok(validateScreening({ ...ok, answers: [] }).errors.answers);
  assert.ok(validateScreening({ ...ok, classification: 'em risco!' }).errors.classification);
  assert.ok(validateScreening({ ...ok, score: -1 }).errors.score);
});

test('perda de peso pelo histórico na janela', () => {
  const w = [
    { date: '2026-11-01', weight_kg: 74 },
    { date: '2026-08-01', weight_kg: 78 },
    { date: '2026-06-01', weight_kg: 80 },
    { date: '2026-10-20', weight_kg: 75 },
  ];
  // 3 a 6 meses antes de 01/11: 01/08 (92 dias) e 01/06 (153 dias) → o mais antigo da janela (80 kg)
  assert.equal(weightLossFromHistory(w, 80, 190), 7.5);
  // até 3 meses: 01/08 (92 dias) está dentro de 20 a 100
  assert.equal(weightLossFromHistory(w, 20, 100), 5.1);
  assert.equal(weightLossFromHistory([{ date: '2026-11-01', weight_kg: 74 }], 80, 190), null);
  assert.equal(weightLossFromHistory([], 80, 190), null);
});
