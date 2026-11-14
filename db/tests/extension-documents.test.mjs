// Testes das regras puras dos documentos clínicos (RN-215).
// Uso: node --test db/tests/extension-documents.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDocumentInput } from '../../directus/extensions/rafanutri/documents.js';

test('pedido de exames só com exames: apara, remove vazios e repetidos', () => {
  const r = validateDocumentInput({ kind: 'exam_request', title: ' Pedido  de exames ', exams: ['Hemograma completo', ' ', 'hemograma completo', 'Ferritina'], document_date: '2026-11-14' });
  assert.deepEqual(r.value, { kind: 'exam_request', title: 'Pedido de exames', body: '', exams: ['Hemograma completo', 'Ferritina'], document_date: '2026-11-14' });
});

test('pedido sem exames nem texto e orientação sem texto falham', () => {
  assert.ok(validateDocumentInput({ kind: 'exam_request', title: 'Pedido', exams: [], document_date: '2026-11-14' }).errors.exams);
  assert.ok(validateDocumentInput({ kind: 'general_guidance', title: 'Orientação', body: ' ', document_date: '2026-11-14' }).errors.body);
});

test('exames são ignorados fora do pedido de exames', () => {
  const r = validateDocumentInput({ kind: 'supplement_prescription', title: 'Suplementos', body: 'Vitamina D', exams: ['Ferritina'], document_date: '2026-11-14' });
  assert.deepEqual(r.value.exams, []);
});

test('tipo, título e data inválidos', () => {
  const r = validateDocumentInput({ kind: 'receipt', title: 'X', body: 'Texto', document_date: '2026-02-30' });
  assert.ok(r.errors.kind && r.errors.title && r.errors.document_date);
});

test('modelo não tem data', () => {
  const r = validateDocumentInput({ kind: 'general_guidance', title: 'Hidratação', body: 'Beba água.' }, { withDate: false });
  assert.deepEqual(r.value, { kind: 'general_guidance', title: 'Hidratação', body: 'Beba água.', exams: [] });
});

test('limites: 60 exames e 6.000 caracteres', () => {
  const many = Array.from({ length: 61 }, (_, i) => `Exame ${i}`);
  assert.ok(validateDocumentInput({ kind: 'exam_request', title: 'Muitos', exams: many, document_date: '2026-11-14' }).errors.exams);
  assert.ok(validateDocumentInput({ kind: 'general_guidance', title: 'Longo', body: 'a'.repeat(6001), document_date: '2026-11-14' }).errors.body);
});
