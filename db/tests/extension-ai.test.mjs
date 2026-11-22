// Testes das regras puras do assistente de IA (0063).
// Uso: node --test db/tests/extension-ai.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMessages, cleanAnswer, formatAnswers, patientContext, pickFreeModels, scrub } from '../../directus/extensions/rafanutri/ai-core.js';

test('só modelos gratuitos, na ordem de preferência', () => {
  const m = (id, prompt = '0', ctx = 128000) => ({ id, pricing: { prompt, completion: prompt }, context_length: ctx });
  const out = pickFreeModels([m('x/big:free', '0', 200000), m('paid/model', '0.001'), m('y/fake:free', '0.0001'), m('liquid/lfm-3-1.7b:free'), m('google/gemma-4-31b-it:free'), m('z/small:free', '0', 8000)]);
  assert.deepEqual(out, ['google/gemma-4-31b-it:free', 'x/big:free']);
});

test('anonimização', () => {
  const s = scrub('Maria Souza, CPF 529.982.247-25, maria@x.com, (27) 99999-1234, nasceu 03/04/1990; come 2 pães.', ['Maria Souza']);
  assert.equal(s, '[nome] [nome], CPF [CPF], [e-mail], [telefone], nasceu [data]; come 2 pães.');
});

test('respostas da anamnese em texto, sem nome', () => {
  const schema = { sections: [{ title: 'A', questions: [{ id: 'q1', type: 'single', label: 'Intestino', options: [{ value: 'reg', label: 'Regular' }] }, { id: 'q2', type: 'yesno', label: 'Alergia?' }, { id: 'q3', type: 'text', label: 'Obs.' }, { id: 'q4', type: 'number', label: 'Água', unit: 'L' }] }] };
  const txt = formatAnswers(schema, { q1: 'reg', q2: true, q3: 'A Joana não come peixe', q4: 2 }, ['Joana Lima']);
  assert.equal(txt, '- Intestino: Regular\n- Alergia?: sim\n- Obs.: A [nome] não come peixe\n- Água: 2 L');
});

test('contexto sem identificação', () => {
  assert.equal(patientContext({ ageYears: 34.6, sex: 'female', weightKg: 70, heightCm: 165, objective: 'emagrecer', pregnancyWeeks: 20.5 }), '34 anos; sexo feminino; peso 70 kg; altura 165 cm; IMC 25.7; gestante, 20 semanas; objetivo: emagrecer');
});

test('mensagens por tipo', () => {
  assert.ok(buildMessages('question', { text: 'oi' }).error);
  assert.equal(buildMessages('question', { text: 'Qual a fibra recomendada?' }).messages.length, 2);
  assert.ok(buildMessages('plan_suggestion', { kcal: 100 }).error);
  assert.match(buildMessages('plan_suggestion', { kcal: 1800, context: '40 anos' }).messages[1].content, /1800 kcal/);
  assert.ok(buildMessages('anamnesis_summary', {}).error);
  assert.ok(buildMessages('xpto', {}).error);
  assert.equal(cleanAnswer('<think>hmm</think>\nResposta'), 'Resposta');
});

test('nomes com acento também saem (fronteira Unicode)', () => {
  assert.equal(scrub('Ângela e Ítalo vieram; a mãe Érica ligou.', ['Ângela Souza', 'Ítalo', 'Érica']), '[nome] e [nome] vieram; a mãe [nome] ligou.');
  // Não troca pedaço de outra palavra
  assert.equal(scrub('Analisar a dieta de Ana', ['Ana']), 'Analisar a dieta de [nome]');
});
